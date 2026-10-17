create table if not exists public.laurem_interview_attempts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.laurem_recruitment_applications(id) on delete cascade,
  invite_id uuid references public.laurem_recruitment_invites(id) on delete set null,
  second_interview_id uuid references public.laurem_recruitment_second_interviews(id) on delete set null,
  round smallint not null check (round in (1,2)),
  role text not null,
  pathway text not null check (pathway in ('uk','international')),
  question_ids jsonb not null default '[]'::jsonb,
  question_snapshot jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score integer,
  total_questions integer,
  pass_percent integer,
  percent numeric(5,2),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','passed','failed','expired')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, round)
);

create index if not exists laurem_interview_attempts_token_idx on public.laurem_interview_attempts(invite_id, round);
create index if not exists laurem_interview_attempts_second_idx on public.laurem_interview_attempts(second_interview_id, round);
alter table public.laurem_interview_attempts enable row level security;
revoke all on public.laurem_interview_attempts from anon, authenticated, public;
grant all on public.laurem_interview_attempts to service_role;

create or replace function public.laurem_complete_round1(p_attempt_id uuid,p_answers jsonb,p_score integer,p_total_questions integer,p_pass_percent integer,p_second_token_hash text,p_second_expires_at timestamptz,p_actor text)
returns table(attempt_id uuid,application_id uuid,role text,score integer,total_questions integer,percent numeric,passed boolean,second_interview_id uuid,second_interview_expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare attempt_row public.laurem_interview_attempts; application_row public.laurem_recruitment_applications; second_id uuid; did_pass boolean;
begin
  select * into attempt_row from public.laurem_interview_attempts where id=p_attempt_id and round=1 for update;
  if not found then raise exception using errcode='P0002',message='ROUND1_ATTEMPT_NOT_FOUND'; end if;
  if attempt_row.status in ('submitted','passed','failed') then raise exception using errcode='P0001',message='ROUND1_ALREADY_SUBMITTED'; end if;
  if p_total_questions<=0 or p_score<0 or p_score>p_total_questions then raise exception using errcode='P0001',message='ROUND1_INVALID_SCORE'; end if;
  did_pass := ((p_score*100.0)/p_total_questions)>=p_pass_percent;
  update public.laurem_interview_attempts set answers=coalesce(p_answers,'{}'::jsonb),score=p_score,total_questions=p_total_questions,pass_percent=p_pass_percent,percent=round((p_score*100.0/p_total_questions)::numeric,2),status=case when did_pass then 'passed' else 'failed' end,submitted_at=now(),updated_at=now() where id=p_attempt_id;
  select * into application_row from public.laurem_recruitment_applications where id=attempt_row.application_id for update;
  if not found then raise exception using errcode='P0002',message='APPLICATION_NOT_FOUND'; end if;
  if did_pass then
    insert into public.laurem_recruitment_second_interviews(application_id,token_hash,status,sent_by,expires_at) values(attempt_row.application_id,p_second_token_hash,'sent',coalesce(nullif(trim(p_actor),''),'system'),p_second_expires_at) returning id into second_id;
    update public.laurem_recruitment_applications set status='Second Interview',updated_at=now() where id=attempt_row.application_id;
    update public.laurem_interview_attempts set second_interview_id=second_id,updated_at=now() where id=p_attempt_id;
    insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note) values(attempt_row.application_id,application_row.status,'Second Interview',coalesce(nullif(trim(p_actor),''),'system'),'Round 1 assessment passed automatically; second interview issued.');
  else
    update public.laurem_recruitment_applications set status='Rejected',updated_at=now() where id=attempt_row.application_id;
    insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note) values(attempt_row.application_id,application_row.status,'Rejected',coalesce(nullif(trim(p_actor),''),'system'),'Round 1 assessment did not meet the configured pass mark.');
  end if;
  attempt_id:=p_attempt_id; application_id:=attempt_row.application_id; role:=attempt_row.role; score:=p_score; total_questions:=p_total_questions; percent:=round((p_score*100.0/p_total_questions)::numeric,2); passed:=did_pass; second_interview_id:=second_id; second_interview_expires_at:=case when did_pass then p_second_expires_at else null end; return next;
end; $$;
revoke all on function public.laurem_complete_round1(uuid,jsonb,integer,integer,integer,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.laurem_complete_round1(uuid,jsonb,integer,integer,integer,text,timestamptz,text) to service_role;

create or replace function public.laurem_complete_round2(p_attempt_id uuid,p_answers jsonb,p_actor text)
returns public.laurem_interview_attempts
language plpgsql security definer set search_path=public as $$
declare attempt_row public.laurem_interview_attempts; result_row public.laurem_interview_attempts;
begin
  select * into attempt_row from public.laurem_interview_attempts where id=p_attempt_id and round=2 for update;
  if not found then raise exception using errcode='P0002',message='ROUND2_ATTEMPT_NOT_FOUND'; end if;
  if attempt_row.status='submitted' then raise exception using errcode='P0001',message='ROUND2_ALREADY_SUBMITTED'; end if;
  update public.laurem_interview_attempts set answers=coalesce(p_answers,'{}'::jsonb),status='submitted',submitted_at=now(),updated_at=now() where id=p_attempt_id returning * into result_row;
  if attempt_row.second_interview_id is not null then update public.laurem_recruitment_second_interviews set status='completed',completed_at=now() where id=attempt_row.second_interview_id and status='sent'; end if;
  insert into public.laurem_recruitment_status_history(application_id,from_status,to_status,changed_by,note) values(attempt_row.application_id,'Second Interview','Second Interview',coalesce(nullif(trim(p_actor),''),'candidate'),'Round 2 submitted for recruiter review.');
  return result_row;
end; $$;
revoke all on function public.laurem_complete_round2(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.laurem_complete_round2(uuid,jsonb,text) to service_role;