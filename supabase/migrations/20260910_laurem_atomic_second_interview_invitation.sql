create or replace function public.laurem_create_second_interview_invitation(
  p_application_id uuid,
  p_token_hash text,
  p_sent_by text,
  p_expires_at timestamptz
) returns table(
  id uuid,
  application_id uuid,
  status text,
  sent_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
  v_sent_at timestamptz;
  v_expires_at timestamptz;
begin
  perform 1
  from laurem_recruitment_applications
  where laurem_recruitment_applications.id = p_application_id
  for update;

  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  select r.id, r.status, r.sent_at, r.expires_at
    into v_id, v_status, v_sent_at, v_expires_at
  from laurem_recruitment_second_interviews r
  where r.application_id = p_application_id
    and r.status = 'sent'
    and r.expires_at > now()
  order by r.sent_at desc
  limit 1;

  if v_id is not null then
    raise exception 'active_second_interview_exists' using errcode = 'P0001';
  end if;

  insert into laurem_recruitment_second_interviews(
    application_id,
    token_hash,
    status,
    sent_by,
    expires_at
  )
  values (
    p_application_id,
    p_token_hash,
    'sent',
    p_sent_by,
    p_expires_at
  )
  returning laurem_recruitment_second_interviews.id,
            laurem_recruitment_second_interviews.application_id,
            laurem_recruitment_second_interviews.status,
            laurem_recruitment_second_interviews.sent_at,
            laurem_recruitment_second_interviews.expires_at
  into v_id, application_id, status, sent_at, expires_at;

  id := v_id;
  return next;
end;
$$;

revoke all on function public.laurem_create_second_interview_invitation(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.laurem_create_second_interview_invitation(uuid,text,text,timestamptz)
  to service_role;
