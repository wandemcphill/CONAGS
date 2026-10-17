create or replace function public.laurem_transition_application_status(
  p_application_id uuid,
  p_to_status text,
  p_actor text,
  p_note text default null,
  p_override boolean default false,
  p_override_reason text default null
)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.laurem_recruitment_applications;
  result_row public.laurem_recruitment_applications;
  allowed boolean := false;
  blocked_reason text := null;
  policy jsonb;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='P0001',message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row
    from public.laurem_recruitment_applications
   where id=p_application_id
   for update;

  if not found then
    raise exception using errcode='P0001',message='APPLICATION_NOT_FOUND';
  end if;

  if p_to_status is null or p_to_status not in(
    'Enquiry','Invited','Application','Screening','Interview','Second Interview',
    'Documents','Sponsorship','Offer','Onboarding','Hired','Rejected','Withdrawn'
  ) then
    raise exception using errcode='P0001',message='INVALID_RECRUITMENT_STATUS';
  end if;

  allowed := (app_row.status=p_to_status)
    or (app_row.status='Enquiry' and p_to_status in('Invited','Rejected','Withdrawn'))
    or (app_row.status='Invited' and p_to_status in('Application','Rejected','Withdrawn'))
    or (app_row.status='Application' and p_to_status in('Screening','Interview','Rejected','Withdrawn'))
    or (app_row.status='Screening' and p_to_status in('Interview','Documents','Rejected','Withdrawn'))
    or (app_row.status='Interview' and p_to_status in('Second Interview','Documents','Offer','Rejected','Withdrawn'))
    or (app_row.status='Second Interview' and p_to_status in('Documents','Offer','Rejected','Withdrawn'))
    or (app_row.status='Documents' and p_to_status in('Sponsorship','Offer','Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Sponsorship' and p_to_status in('Offer','Rejected','Withdrawn'))
    or (app_row.status='Offer' and p_to_status in('Onboarding','Rejected','Withdrawn'))
    or (app_row.status='Onboarding' and p_to_status in('Hired','Rejected','Withdrawn'));

  if p_to_status='Onboarding' then
    policy := public.laurem_evaluate_staff_lifecycle(p_application_id,'prepare_onboarding',p_override);
    if coalesce((policy->>'ok')::boolean,false)=false then
      blocked_reason:=coalesce(policy->>'reason','Canonical onboarding lifecycle policy blocked this transition.');
    end if;
  elsif p_to_status='Hired' then
    policy := public.laurem_evaluate_staff_lifecycle(p_application_id,'mark_hired',p_override);
    if coalesce((policy->>'ok')::boolean,false)=false then
      blocked_reason:=coalesce(policy->>'reason','Canonical Hired lifecycle policy blocked this transition.');
    end if;
  elsif p_to_status='Second Interview' then
    if not p_override and app_row.status <> 'Interview' then
      blocked_reason:=format('Transition from %s to Second Interview is not permitted.',app_row.status);
    end if;
    if not p_override and not exists(
      select 1
        from public.laurem_recruitment_interviews i
       where i.application_id=app_row.id
         and i.status='Completed'
         and i.cancelled_at is null
    ) then
      blocked_reason:=coalesce(blocked_reason||' ','')||
        'A completed first interview is required before Second Interview.';
    end if;
  end if;

  if blocked_reason is null and not allowed and not p_override then
    blocked_reason:=format('Transition from %s to %s is not permitted.',app_row.status,p_to_status);
  end if;

  if blocked_reason is not null then
    insert into public.laurem_recruitment_admin_actions(
      application_id,actor,action_type,from_status,to_status,outcome,reason,metadata
    )
    values(
      p_application_id,p_actor,'status_transition',app_row.status,p_to_status,
      'blocked',blocked_reason,jsonb_build_object('override_requested',p_override)
    );
    raise exception using errcode='P0001',message='STATUS_TRANSITION_BLOCKED',detail=blocked_reason;
  end if;

  if p_override and nullif(trim(coalesce(p_override_reason,'')),'') is null then
    insert into public.laurem_recruitment_admin_actions(
      application_id,actor,action_type,from_status,to_status,outcome,reason,metadata
    )
    values(
      p_application_id,p_actor,'status_transition',app_row.status,p_to_status,
      'blocked','Override reason is required.',jsonb_build_object('override_requested',true)
    );
    raise exception using errcode='P0001',message='OVERRIDE_REASON_REQUIRED';
  end if;

  update public.laurem_recruitment_applications
     set status=p_to_status,
         updated_at=now()
   where id=p_application_id
   returning * into result_row;

  insert into public.laurem_recruitment_status_history(
    application_id,from_status,to_status,changed_by,note
  )
  values(
    p_application_id,
    app_row.status,
    p_to_status,
    p_actor,
    coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),''))
  );

  insert into public.laurem_recruitment_admin_actions(
    application_id,actor,action_type,from_status,to_status,outcome,reason,metadata
  )
  values(
    p_application_id,p_actor,'status_transition',app_row.status,p_to_status,
    case when p_override then 'overridden' else 'allowed' end,
    coalesce(nullif(trim(p_note),''),nullif(trim(p_override_reason),'')),
    jsonb_build_object('override',p_override,'blocked_reason',blocked_reason)
  );

  return result_row;
end;
$$;

revoke all on function public.laurem_transition_application_status(
  uuid,text,text,text,boolean,text
) from public, anon, authenticated;

grant execute on function public.laurem_transition_application_status(
  uuid,text,text,text,boolean,text
) to service_role;
