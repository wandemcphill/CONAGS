create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_id uuid,
  channel text not null check (channel in ('email')),
  recipient_key text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sending','retrying','sent','failed','not_configured')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_id text,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_entity_idx
  on notification_deliveries(event_type, entity_id, created_at desc);
create index if not exists notification_deliveries_status_idx
  on notification_deliveries(status, updated_at);

alter table notification_deliveries enable row level security;
revoke all on notification_deliveries from anon, authenticated;

comment on table notification_deliveries is 'Server-side transactional notification ledger. No message body or credential-bearing payloads are persisted here.';
