-- CONAGS CARE private workforce identity + internal messaging.
-- Internal addresses are application identities, not internet email.
create extension if not exists pgcrypto;

alter table staff_profiles
  add column if not exists laurem_id text,
  add column if not exists password_hash text,
  add column if not exists session_version integer not null default 1,
  add column if not exists activation_token_hash text,
  add column if not exists activation_expires_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists portal_handle text,
  add column if not exists department_namespace text,
  add column if not exists portal_address text;

create sequence if not exists laurem_staff_number_seq start 1000;

create or replace function assign_laurem_staff_identity()
returns trigger language plpgsql as $$
begin
  if new.laurem_id is null or btrim(new.laurem_id) = '' then
    new.laurem_id := 'LAU-' || lpad(nextval('laurem_staff_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists laurem_staff_identity_trigger on staff_profiles;
create trigger laurem_staff_identity_trigger
before insert on staff_profiles
for each row execute function assign_laurem_staff_identity();

create unique index if not exists staff_profiles_laurem_id_idx on staff_profiles(laurem_id);
create unique index if not exists staff_profiles_portal_handle_idx on staff_profiles(lower(portal_handle)) where portal_handle is not null;
create unique index if not exists staff_profiles_portal_address_idx on staff_profiles(lower(portal_address)) where portal_address is not null;

create table if not exists staff_internal_mailboxes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references staff_profiles(id) on delete cascade,
  handle text not null,
  namespace text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_internal_mailbox_address_idx on staff_internal_mailboxes(lower(handle || '@' || namespace));

create table if not exists staff_message_conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text unique not null,
  created_by_staff_id uuid references staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists staff_message_participants (
  conversation_id uuid not null references staff_message_conversations(id) on delete cascade,
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key(conversation_id, staff_id)
);
create index if not exists staff_message_participants_staff_idx on staff_message_participants(staff_id, joined_at desc);

create table if not exists staff_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references staff_message_conversations(id) on delete cascade,
  sender_staff_id uuid references staff_profiles(id) on delete restrict,
  sender_admin_email text,
  body text not null check(length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check((sender_staff_id is not null) or (sender_admin_email is not null))
);
create index if not exists staff_messages_conversation_idx on staff_messages(conversation_id, created_at asc);
create index if not exists staff_messages_sender_idx on staff_messages(sender_staff_id, created_at desc);

alter table staff_internal_mailboxes enable row level security;
alter table staff_message_conversations enable row level security;
alter table staff_message_participants enable row level security;
alter table staff_messages enable row level security;
revoke all on staff_internal_mailboxes, staff_message_conversations, staff_message_participants, staff_messages from anon, authenticated;
