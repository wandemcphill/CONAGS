-- Harden the retired CONAGS legacy contract-signature table.
-- It is not a public Data API surface and must not be readable/writable by anon/authenticated.
-- BIMED/shared recruitment tables are intentionally untouched.

alter table public.laurem_legacy_contract_signatures enable row level security;
revoke all privileges on table public.laurem_legacy_contract_signatures from anon, authenticated;
grant all privileges on table public.laurem_legacy_contract_signatures to service_role;
