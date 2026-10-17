-- Ensure CONAGS private employment-document storage exists and is constrained.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  updated_at
)
values (
  'laurem-private-documents',
  'laurem-private-documents',
  false,
  10485760,
  array['application/pdf','text/plain','text/markdown','image/png','image/jpeg'],
  now()
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();
