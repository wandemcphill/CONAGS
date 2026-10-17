-- UK in-country visa switch payment plan: £500 upfront plus £1,500 recovered weekly over the first three months.
create or replace function public.laurem_request_staff_visa_sponsorship(
  p_staff_id uuid,
  p_requested_pathway text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.laurem_staff_profiles%rowtype;
  v_application public.laurem_recruitment_applications%rowtype;
  v_case public.laurem_staff_visa_cases%rowtype;
  v_invoice public.laurem_staff_visa_invoices%rowtype;
  v_pathway text;
  v_basis text;
  v_is_uk boolean;
  v_is_split_payment boolean;
  v_invoice_amount_pence integer;
  v_invoice_due_date date;
  v_invoice_description text;
  v_invoice_notes text;
  v_payment_plan jsonb := '{}'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_invoice_number text;
begin
  select * into v_staff
  from public.laurem_staff_profiles
  where id = p_staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.employment_status not in ('pending','active') then raise exception 'STAFF_NOT_ELIGIBLE'; end if;

  select * into v_application
  from public.laurem_recruitment_applications
  where id = v_staff.application_id
  for share;

  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  select * into v_case
  from public.laurem_staff_visa_cases
  where staff_id = p_staff_id
    and status not in ('completed','declined','withdrawn')
  order by requested_at desc
  limit 1
  for update;

  if found then
    select * into v_invoice
    from public.laurem_staff_visa_invoices
    where visa_case_id = v_case.id
    order by created_at desc
    limit 1;
    return jsonb_build_object(
      'ok', true,
      'already_exists', true,
      'case', to_jsonb(v_case),
      'invoice', to_jsonb(v_invoice)
    );
  end if;

  v_is_uk :=
    lower(coalesce(v_application.living_in_uk,'')) in ('yes','true','currently in the uk')
    or lower(coalesce(v_application.current_country,'')) ~ '(united kingdom|^uk$|england|scotland|wales|northern ireland)';

  if p_requested_pathway in ('visa_switch','international_sponsorship') then
    v_pathway := p_requested_pathway;
    v_basis := 'Staff-selected route at request time; final route remains subject to CONAGS administrative review and UK immigration eligibility.';
  elsif v_is_uk then
    v_pathway := 'visa_switch';
    v_basis := 'Existing recruitment record indicates the candidate is in the UK; CONAGS therefore opened a visa-switch support case for administrative review.';
  else
    v_pathway := 'international_sponsorship';
    v_basis := 'Existing recruitment record indicates the candidate is outside the UK; CONAGS therefore opened an international sponsorship support case for administrative review.';
  end if;

  v_is_split_payment :=
    v_pathway = 'visa_switch'
    and v_is_uk
    and (
      lower(coalesce(v_application.role_applied,'')) like '%healthcare assistant%'
      or lower(coalesce(v_application.role_applied,'')) like '%support worker%'
      or lower(coalesce(v_staff.job_title,'')) like '%healthcare assistant%'
      or lower(coalesce(v_staff.job_title,'')) like '%support worker%'
    );

  if v_is_split_payment then
    v_invoice_amount_pence := 50000;
    v_invoice_due_date := current_date;
    v_invoice_description := 'CONAGS UK visa switch support: £500 initial payment. The remaining £1,500 is recovered through weekly salary deductions during the first three months of employment.';
    v_payment_plan := jsonb_build_object(
      'kind', 'uk_switch_split',
      'upfront_amount_pence', 50000,
      'deferred_amount_pence', 150000,
      'weekly_deduction_count', 13,
      'weekly_deduction_pence', 11538,
      'final_weekly_deduction_pence', 11544,
      'first_deduction_week', 'First training week after successful visa and commencement of employment',
      'cadence', 'weekly',
      'period', 'first three months'
    );
    v_invoice_notes := '£500 is due immediately and is required before CONAGS starts the visa sponsorship application process. The remaining £1,500 is not due now. After the visa is successful and the staff member starts employment, the remaining £1,500 is recovered through 13 weekly salary deductions during the first three months, beginning with the first training week: £115.38 for weeks 1-12 and £115.44 for week 13, totalling exactly £1,500.';
  else
    v_invoice_amount_pence := 200000;
    v_invoice_due_date := null;
    v_invoice_description := 'CONAGS visa sponsorship support and case administration';
    v_invoice_notes := 'This invoice is for CONAGS support/service and is not represented as a UK government fee.';
  end if;

  insert into public.laurem_staff_visa_cases(
    staff_id, application_id, pathway, pathway_basis, status,
    role_at_request, job_title_at_request, case_snapshot, additional_information,
    requested_at, created_at, updated_at
  )
  values (
    p_staff_id, v_application.id, v_pathway, v_basis, 'requested',
    v_application.role_applied, v_staff.job_title,
    jsonb_build_object(
      'application_id', v_application.id,
      'staff_id', p_staff_id,
      'full_name', v_application.full_name,
      'preferred_name', v_application.preferred_name,
      'email', v_application.email,
      'phone', v_application.phone,
      'date_of_birth', v_application.date_of_birth,
      'nationality', v_application.nationality,
      'country_of_residence', v_application.country_of_residence,
      'address', v_application.address,
      'role_applied', v_application.role_applied,
      'employment_type', v_application.employment_type,
      'start_date', v_application.start_date,
      'qualifications', v_application.qualifications,
      'training', v_application.training,
      'professional_experience', v_application.professional_experience,
      'employment_history', v_application.employment_history,
      'living_in_uk', v_application.living_in_uk,
      'current_country', v_application.current_country,
      'work_permission', v_application.work_permission,
      'requires_sponsorship', v_application.requires_sponsorship,
      'supporting_documents', v_application.supporting_documents,
      'application_data', v_application.application_data,
      'consent', v_application.consent
    ),
    jsonb_build_object('payment_plan', v_payment_plan),
    v_now, v_now, v_now
  )
  returning * into v_case;

  v_invoice_number := 'CONAGS-VS-' || to_char(v_now, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.laurem_staff_visa_invoice_seq')::text, 6, '0');

  insert into public.laurem_staff_visa_invoices(
    visa_case_id, staff_id, invoice_number, status, currency, amount_pence,
    description, issue_date, due_date, billed_name, billed_email,
    created_by, notes, created_at, updated_at
  )
  values (
    v_case.id, p_staff_id, v_invoice_number, 'issued', 'GBP', v_invoice_amount_pence,
    v_invoice_description, current_date, v_invoice_due_date,
    coalesce(v_application.full_name, v_staff.full_name),
    coalesce(v_application.email, v_staff.email),
    'CONAGS platform', v_invoice_notes, v_now, v_now
  )
  returning * into v_invoice;

  insert into public.laurem_staff_visa_case_events(
    visa_case_id, staff_id, event_type, actor_type, actor, metadata, created_at
  )
  values
  (
    v_case.id, p_staff_id, 'requested', 'staff', v_staff.email,
    jsonb_build_object(
      'pathway', v_pathway,
      'pathway_basis', v_basis,
      'invoice_number', v_invoice.invoice_number,
      'invoice_amount_pence', v_invoice.amount_pence,
      'payment_plan', v_payment_plan
    ),
    v_now
  ),
  (
    v_case.id, p_staff_id, 'invoice_issued', 'system', 'CONAGS platform',
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'amount_pence', v_invoice.amount_pence,
      'payment_plan', v_payment_plan
    ),
    v_now
  );

  return jsonb_build_object(
    'ok', true,
    'already_exists', false,
    'case', to_jsonb(v_case),
    'invoice', to_jsonb(v_invoice)
  );
exception
  when unique_violation then
    select * into v_case
    from public.laurem_staff_visa_cases
    where staff_id = p_staff_id
      and status not in ('completed','declined','withdrawn')
    order by requested_at desc
    limit 1;
    if found then
      select * into v_invoice
      from public.laurem_staff_visa_invoices
      where visa_case_id = v_case.id
      order by created_at desc
      limit 1;
      return jsonb_build_object('ok', true, 'already_exists', true, 'case', to_jsonb(v_case), 'invoice', to_jsonb(v_invoice));
    end if;
    raise;
end;
$$;

revoke all on function public.laurem_request_staff_visa_sponsorship(uuid,text) from public, anon, authenticated;
grant execute on function public.laurem_request_staff_visa_sponsorship(uuid,text) to service_role;
