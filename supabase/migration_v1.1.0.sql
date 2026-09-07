-- PU FEST 2026 TICKETING SYSTEM
-- Migration v1.1.0
-- Adds Google Sheets backup / Apps Script email status tracking.

alter table public.registrations
  add column if not exists sheet_sync_status text not null default 'pending',
  add column if not exists sheet_synced_at timestamptz,
  add column if not exists sheet_sync_error text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;

update public.registrations
set sheet_sync_status = coalesce(nullif(sheet_sync_status,''), 'pending')
where sheet_sync_status is null or sheet_sync_status = '';

comment on column public.registrations.sheet_sync_status
  is 'Google Sheets backup status: pending, synced, or failed';

comment on column public.registrations.sheet_synced_at
  is 'Last successful Google Sheets backup sync time';

comment on column public.registrations.sheet_sync_error
  is 'Last Google Sheets backup sync error';

comment on column public.registrations.email_sent_at
  is 'Last successful ticket confirmation email time';

comment on column public.registrations.email_error
  is 'Last ticket confirmation email error';
