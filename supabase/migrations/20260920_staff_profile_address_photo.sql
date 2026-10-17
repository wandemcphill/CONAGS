alter table public.laurem_staff_profiles
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists county text,
  add column if not exists postcode text,
  add column if not exists country text,
  add column if not exists profile_photo_path text,
  add column if not exists profile_photo_updated_at timestamptz;
