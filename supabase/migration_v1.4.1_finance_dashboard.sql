-- PU FEST 2026 TICKETING SYSTEM
-- Migration v1.4.1
-- Finance dashboard support only.
-- Keeps the original automatic ticket email workflow.

alter table public.registrations
  add column if not exists receipt_path text;

alter table public.registrations
  alter column email_status set default 'pending';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "PU Fest receipt read" on storage.objects;
create policy "PU Fest receipt read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,
    'finance'::public.staff_role,
    'event_admin'::public.staff_role
  )
);

drop policy if exists "PU Fest receipt upload" on storage.objects;
create policy "PU Fest receipt upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,
    'finance'::public.staff_role,
    'event_admin'::public.staff_role
  )
);

drop policy if exists "PU Fest receipt update" on storage.objects;
create policy "PU Fest receipt update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,
    'finance'::public.staff_role,
    'event_admin'::public.staff_role
  )
)
with check (
  bucket_id = 'payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,
    'finance'::public.staff_role,
    'event_admin'::public.staff_role
  )
);

drop policy if exists "PU Fest receipt delete" on storage.objects;
create policy "PU Fest receipt delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,
    'finance'::public.staff_role,
    'event_admin'::public.staff_role
  )
);
