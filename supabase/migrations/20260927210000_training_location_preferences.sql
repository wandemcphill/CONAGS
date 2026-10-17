alter table public.laurem_staff_rota_requests
  add column if not exists preferred_training_location text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.laurem_staff_rota_requests'::regclass
      and conname='laurem_staff_rota_requests_training_location_chk'
  ) then
    alter table public.laurem_staff_rota_requests
      add constraint laurem_staff_rota_requests_training_location_chk
      check (preferred_training_location is null or preferred_training_location in ('Birmingham','London','Glasgow','Manchester'));
  end if;
end $$;

create index if not exists laurem_staff_rota_requests_training_location_idx
  on public.laurem_staff_rota_requests(preferred_training_location)
  where preferred_training_location is not null;
