-- Track when the CONAGS admin team last opened each staff conversation.
-- This keeps the admin inbox's NEW indicator meaningful without creating a fake admin staff participant.
alter table public.laurem_staff_message_conversations
  add column if not exists admin_last_read_at timestamptz;

create index if not exists laurem_staff_message_conversations_unread_idx
  on public.laurem_staff_message_conversations(admin_last_read_at, last_message_at);
