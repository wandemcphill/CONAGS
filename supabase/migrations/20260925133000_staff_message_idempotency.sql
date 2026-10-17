-- Make CONAGS message delivery idempotent across retries and concurrent requests.
alter table staff_messages
  add column if not exists idempotency_key text;

create unique index if not exists staff_messages_staff_idempotency_idx
  on staff_messages(sender_staff_id, idempotency_key)
  where sender_staff_id is not null and idempotency_key is not null;

create unique index if not exists staff_messages_admin_idempotency_idx
  on staff_messages(lower(sender_admin_email), idempotency_key)
  where sender_admin_email is not null and idempotency_key is not null;

create index if not exists staff_messages_idempotency_lookup_idx
  on staff_messages(idempotency_key)
  where idempotency_key is not null;
