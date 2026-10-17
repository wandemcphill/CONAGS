create table if not exists public.laurem_staff_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.laurem_staff_profiles(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists laurem_staff_notifications_staff_created_idx
  on public.laurem_staff_notifications (staff_id, created_at desc);

create index if not exists laurem_staff_notifications_unread_idx
  on public.laurem_staff_notifications (staff_id, created_at desc)
  where read_at is null;

alter table public.laurem_staff_notifications enable row level security;
revoke all on public.laurem_staff_notifications from anon, authenticated;
grant all on public.laurem_staff_notifications to service_role;