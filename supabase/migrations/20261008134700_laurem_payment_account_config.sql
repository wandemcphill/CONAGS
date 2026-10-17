create table if not exists public.laurem_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  account_key text not null unique,
  account_name text not null,
  bank_name text not null,
  account_number text,
  sort_code text,
  iban text,
  bic_swift text,
  bank_address text,
  currency text not null default 'GBP',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.laurem_payment_accounts enable row level security;
alter table public.laurem_payment_accounts force row level security;

revoke all on table public.laurem_payment_accounts from anon, authenticated;
