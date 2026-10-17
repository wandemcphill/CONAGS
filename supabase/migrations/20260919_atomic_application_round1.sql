create or replace function public.laurem_create_application_with_round1(
  p_token_hash text,
  p_payload jsonb,
  p_round1_role text,
  p_round1_pathway text,
  p_question_ids jsonb,
  p_question_snapshot jsonb,
  p_total_questions integer,
  p_pass_percent integer,
  p_actor text
)
returns public.laurem_recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application_row public.laurem_recruitment_applications;
  existing_attempt_id uuid;
begin
  if nullif(trim(coalesce(p_actor,'')), '') is null then
    raise exception using errcode='P0001', message='ACTOR_REQUIRED';
  end if;

  application_row := public.laurem_create_recruitment_application(
    p_token_hash,
    p_payload
  );

  select id
    into existing_attempt_id
    from public.laurem_interview_attempts
   where application_id = application_row.id
     and round = 1
   order by created_at desc
   limit 1
   for update;

  if existing_attempt_id is null then
    insert into public.laurem_interview_attempts(
      application_id,
      invite_id,
      round,
      role,
      pathway,
      question_ids,
      question_snapshot,
      status,
      total_questions,
      pass_percent
    )
    values (
      application_row.id,
      application_row.invite_id,
      1,
      p_round1_role,
      p_round1_pathway,
      coalesce(p_question_ids, '[]'::jsonb),
      coalesce(p_question_snapshot, '[]'::jsonb),
      'in_progress',
      p_total_questions,
      p_pass_percent
    );
  end if;

  if application_row.status <> 'Interview' then
    application_row := public.laurem_transition_application_status(
      application_row.id,
      'Interview',
      p_actor,
      'Round 1 assessment created as part of atomic application submission.',
      false,
      null
    );
  end if;

  return application_row;
end;
$$;

revoke all on function public.laurem_create_application_with_round1(
  text,jsonb,text,text,jsonb,jsonb,integer,integer,text
) from public, anon, authenticated;

grant execute on function public.laurem_create_application_with_round1(
  text,jsonb,text,text,jsonb,jsonb,integer,integer,text
) to service_role;