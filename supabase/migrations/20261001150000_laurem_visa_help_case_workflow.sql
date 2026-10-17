-- CONAGS Visa Help case tasks, case-linked evidence review, and case-specific staff/admin messaging.
create extension if not exists pgcrypto;

create table if not exists public.laurem_staff_visa_help_tasks (
  id uuid primary key default gen_random_uuid(),
  visa_help_case_id uuid not null references public.laurem_staff_visa_help_cases(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  task_type text not null check (task_type in ('information','document','action')),
  visibility text not null default 'staff' check (visibility in ('staff','internal')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  required boolean not null default true,
  status text not null default 'open' check (status in ('open','submitted','verified','rejected','cancelled')),
  response_text text,
  response_document_id uuid references public.laurem_staff_documents(id) on delete set null,
  requested_by_actor_type text not null check (requested_by_actor_type in ('admin','legal','system')),
  requested_by text not null,
  due_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laurem_staff_visa_help_tasks_case_idx
  on public.laurem_staff_visa_help_tasks(visa_help_case_id, status, required, created_at desc);
create index if not exists laurem_staff_visa_help_tasks_staff_idx
  on public.laurem_staff_visa_help_tasks(staff_id, status, created_at desc);
create index if not exists laurem_staff_visa_help_tasks_visibility_idx
  on public.laurem_staff_visa_help_tasks(visa_help_case_id, visibility, status, created_at desc);

create table if not exists public.laurem_staff_visa_help_documents (
  id uuid primary key default gen_random_uuid(),
  visa_help_case_id uuid not null references public.laurem_staff_visa_help_cases(id) on delete cascade,
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  document_id uuid not null references public.laurem_staff_documents(id) on delete cascade,
  checklist_key text,
  status text not null default 'submitted' check (status in ('submitted','accepted','rejected')),
  reviewer_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(visa_help_case_id, document_id)
);

create index if not exists laurem_staff_visa_help_documents_case_idx
  on public.laurem_staff_visa_help_documents(visa_help_case_id, checklist_key, status);

alter table public.laurem_staff_visa_help_cases
  add column if not exists conversation_id uuid references public.laurem_staff_message_conversations(id) on delete set null;

create unique index if not exists laurem_staff_visa_help_cases_conversation_idx
  on public.laurem_staff_visa_help_cases(conversation_id)
  where conversation_id is not null;

alter table public.laurem_staff_visa_help_tasks
  add column if not exists visibility text not null default 'staff';

DO 'BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=''public.laurem_staff_visa_help_tasks''::regclass
      AND conname=''laurem_staff_visa_help_tasks_visibility_check''
  ) THEN
    ALTER TABLE public.laurem_staff_visa_help_tasks
      ADD CONSTRAINT laurem_staff_visa_help_tasks_visibility_check
      CHECK (visibility IN (''staff'',''internal''));
  END IF;
END';
alter table public.laurem_staff_visa_help_cases
  add column if not exists confirmed_route text,
  add column if not exists legal_review_completed boolean not null default false,
  add column if not exists legal_review_completed_by text,
  add column if not exists legal_review_completed_at timestamptz,
  add column if not exists submission_ready_at timestamptz;

alter table public.laurem_staff_messages
  add column if not exists idempotency_key text;

create unique index if not exists laurem_staff_messages_staff_idempotency_idx
  on public.laurem_staff_messages(sender_staff_id, idempotency_key)
  where sender_staff_id is not null and idempotency_key is not null;

create unique index if not exists laurem_staff_messages_admin_idempotency_idx
  on public.laurem_staff_messages(lower(sender_admin_email), idempotency_key)
  where sender_admin_email is not null and idempotency_key is not null;

create index if not exists laurem_staff_messages_idempotency_lookup_idx
  on public.laurem_staff_messages(idempotency_key)
  where idempotency_key is not null;

alter table public.laurem_staff_visa_help_tasks enable row level security;
alter table public.laurem_staff_visa_help_documents enable row level security;

revoke all on public.laurem_staff_visa_help_tasks, public.laurem_staff_visa_help_documents
from anon, authenticated;
