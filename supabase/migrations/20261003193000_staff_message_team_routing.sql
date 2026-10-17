-- Route staff-to-team conversations into distinct Admin, Management and Recruitment inboxes.
alter table public.laurem_staff_message_conversations
  add column if not exists inbox_team text not null default 'admin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'laurem_staff_message_conversations_inbox_team_check'
      and conrelid = 'public.laurem_staff_message_conversations'::regclass
  ) then
    alter table public.laurem_staff_message_conversations
      add constraint laurem_staff_message_conversations_inbox_team_check
      check (inbox_team in ('admin','management','recruitment'));
  end if;
end $$;

create index if not exists laurem_staff_message_conversations_team_idx
  on public.laurem_staff_message_conversations(inbox_team, last_message_at desc);
