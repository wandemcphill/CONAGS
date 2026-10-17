-- CONAGS: replace the legacy Stripe payment link on the £500 UK visa-switch invoice.
-- Keeps existing £500 invoices and future invoices on the shared Payssion checkout.

alter table public.laurem_staff_visa_invoices
  add column if not exists payment_url text;

do $$
declare
  definition text;
  old_url text := 'https://buy.stripe.com/4gMcN63sc39823A6OYbAs0m';
  new_url text := 'https://www.payssion.com/checkout/live_d5a43be9bff6d1a2';
begin
  select pg_get_functiondef(p.oid)
    into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'laurem_request_staff_visa_sponsorship'
    and pg_get_function_identity_arguments(p.oid) = 'p_staff_id uuid, p_requested_pathway text';

  if definition is null then
    raise exception 'laurem_request_staff_visa_sponsorship(uuid,text) not found';
  end if;

  if position(old_url in definition) > 0 then
    definition := replace(definition, old_url, new_url);
    execute definition;
  end if;
end $$;

update public.laurem_staff_visa_invoices
set payment_url = 'https://www.payssion.com/checkout/live_d5a43be9bff6d1a2',
    updated_at = clock_timestamp()
where amount_pence = 50000;
