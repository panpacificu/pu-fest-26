# PU Fest 2026 Ticketing System — Setup Notes (v1.3.0)

## What v1.3.0 changes

This release fixes the Admin Dashboard "Loading..." bug and adds Admin/Finance usability features.

The bug was caused by `admin.js` referencing Tickets UI elements that were missing from `admin.html`. The JavaScript stopped before dashboard data loaders ran.

v1.3.0 adds the missing Ticket panel and makes every dashboard section handle errors independently.

## New features

- Working Admin Dashboard
- Registrations search + delivery filters
- Ticket search + status filters
- Resend ticket email button
- Retry Google Sheet backup button
- Void unused ticket button
- Gate check-in statistics
- Recent scanner activity
- Recent audit activity
- Registration CSV export
- Backup/email status badges
- Finance resend + backup retry controls
- Compact responsive mobile UI
- Dashboard panels no longer all freeze if one query fails

## Backend architecture

- Supabase: source of truth
- Apps Script worker: pulls pending jobs every minute
- Google Sheet: backup
- MailApp: professional ticket email

No architecture change from v1.2.0.

## SQL

No new SQL migration is required for v1.3.0 if `migration_v1.1.0.sql` was already run.

## GitHub

Upload/replace the v1.3.0 frontend files in:

`https://github.com/panpacificu/pu-fest-26`

## Edge Functions to deploy/redeploy

From the extracted v1.3.0 project folder:

```bash
npx supabase link --project-ref kimhqlenfulaflyfhrez

npx supabase functions deploy retry-sync --use-api
npx supabase functions deploy void-ticket --use-api
npx supabase functions deploy resend-ticket --use-api
npx supabase functions deploy update-registration --use-api
```

`retry-sync` is new.

`void-ticket` is redeployed so voiding an unused ticket also queues a Google Sheet backup refresh.

The other already-working v1.2.0 functions do not need to be redeployed for this UI release.

## Apps Script

No Apps Script code change is required from v1.2.0.

Keep the existing `processPUFestQueue` one-minute trigger active.

## Recommended verification

1. Refresh `admin.html`
2. Confirm stats populate
3. Confirm Registrations table loads
4. Confirm Tickets table loads
5. Search/filter registrations
6. Queue a test resend
7. Queue a backup retry
8. Void an unused test ticket only if safe to do so
9. Confirm Gate Activity updates after scans
10. Export registrations CSV
