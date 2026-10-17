create table if not exists recruitment_onboarding_checklist (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  item_key text not null,
  title text not null,
  description text not null,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','completed','waived')),
  completed_at timestamptz,
  completed_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id, item_key)
);

create index if not exists recruitment_onboarding_checklist_application_idx
  on recruitment_onboarding_checklist(application_id, created_at);

alter table recruitment_onboarding_checklist enable row level security;
revoke all on recruitment_onboarding_checklist from anon, authenticated;

create or replace function public.laurem_onboarding_checklist_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recruitment_onboarding_checklist_updated_at on recruitment_onboarding_checklist;
create trigger recruitment_onboarding_checklist_updated_at
before update on recruitment_onboarding_checklist
for each row execute function public.laurem_onboarding_checklist_set_updated_at();
