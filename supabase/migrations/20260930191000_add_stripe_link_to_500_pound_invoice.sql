-- CONAGS: add the supplied Stripe payment link to the £500 UK visa-switch invoice.
-- The £500 invoice is due three calendar days after its issue date.
-- Patch the currently deployed function in place so later lifecycle changes are preserved.

alter table public.laurem_staff_visa_invoices
  add column if not exists payment_url text;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(p.oid)
    into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'laurem_request_staff_visa_sponsorship';

  if definition is null then
    raise exception 'laurem_request_staff_visa_sponsorship not found';
  end if;

  if position('v_invoice_notes text;' in definition) = 0 then
    raise exception 'Invoice notes declaration not found';
  end if;

  definition := replace(
    definition,
    '  v_invoice_notes text;',
    '  v_invoice_notes text;
  v_payment_url text;'
  );

  if position('v_invoice_due_date := current_date;' in definition) = 0 then
    raise exception '£500 invoice due-date assignment not found';
  end if;

  definition := replace(
    definition,
    '    v_invoice_amount_pence := 50000;
    v_invoice_due_date := current_date;',
    '    v_invoice_amount_pence := 50000;
    v_invoice_due_date := current_date + 3;
    v_payment_url := ''https://buy.stripe.com/4gMcN63sc39823A6OYbAs0m'';'
  );

  if position('    billed_email,' in definition) = 0 then
    raise exception 'Invoice billed_email column not found';
  end if;

  definition := replace(
    definition,
    '    billed_email,
    created_by,',
    '    billed_email,
    payment_url,
    created_by,'
  );

  definition := replace(
    definition,
    '    coalesce(v_application.email, v_staff.email),
    ''CONAGS platform'',',
    '    coalesce(v_application.email, v_staff.email),
    v_payment_url,
    ''CONAGS platform'','
  );

  execute definition;
end $$;

update public.laurem_staff_visa_invoices
set payment_url = 'https://buy.stripe.com/4gMcN63sc39823A6OYbAs0m',
    due_date = issue_date + 3,
    updated_at = clock_timestamp()
where amount_pence = 50000;
