create table if not exists recruitment_nurse_interview_responses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references recruitment_invites(id) on delete cascade,
  application_id uuid references recruitment_applications(id) on delete cascade,
  pathway text not null check (pathway in ('uk','international')),
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(invite_id)
);

alter table recruitment_nurse_interview_responses
  add column if not exists application_id uuid references recruitment_applications(id) on delete cascade;

create unique index if not exists recruitment_nurse_interview_responses_application_idx
  on recruitment_nurse_interview_responses(application_id)
  where application_id is not null;

create index if not exists recruitment_nurse_interview_responses_invite_idx
  on recruitment_nurse_interview_responses(invite_id);

alter table recruitment_nurse_interview_responses enable row level security;
revoke all on recruitment_nurse_interview_responses from anon, authenticated;
