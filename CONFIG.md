# PU Fest 2026 Ticketing System — v1.5.0

## Supabase project

Project ref: `vcinzohrrqvowivxkjnp`

Frontend URL: `https://panpacificu.github.io/pu-fest-26`

Online public registration page:

`https://panpacificu.github.io/pu-fest-26/register.html`

## What changed

### Scanner

`scanner.html` no longer requires a staff account.

It is protected by a scanner password prompt. The requested password is:

`!PUFEST`

The password is validated by Supabase, not hard-coded into the public website files.

Set it as an Edge Function secret:

```bash
npx supabase secrets set SCANNER_ACCESS_PASSWORD="!PUFEST"
```

The scanner functions must be deployed with `--no-verify-jwt` because there is no staff login on the scanner page. They still require the correct scanner password before lookup/check-in succeeds.

### Archive instead of delete

Finance, Admin, and Event Admin can archive a transaction.

Archiving:
- keeps a permanent snapshot for review
- removes the transaction from active lists
- makes its tickets inactive
- preserves audit/check-in history
- queues a Google Sheet refresh

Archived records appear in the **Archived Transactions** section.

### Finance-created tickets

No change to the working email behavior.

Finance creates a ticket → the registration immediately enters the existing Apps Script queue → the buyer receives the ticket from `marketing.staff@panpacificu.edu.ph`.

### Online registration

`register.html` is a public page for outside buyers.

Buyer submits:
- name
- email
- contact number
- organization/school (optional)
- number of paid tickets
- payment method/reference
- proof of payment

No QR ticket is created yet.

Finance receives a notification in `finance.html` and reviews the request. Only after Finance clicks **Confirm Payment & Issue Tickets** are the real QR tickets created and automatically queued for email.

### Ticket quantity

Maximum: **50 paid tickets** per transaction.

The interface now uses a number input instead of a 1–5 dropdown.

### Barkada Bundle

For every 10 paid tickets, 1 FREE ticket is added automatically.

Examples:
- 9 paid → 9 total
- 10 paid → 11 total
- 20 paid → 22 total
- 50 paid → 55 total

The buyer only pays `₱499 × paid tickets`.

FREE tickets are marked with a green **FREE • BARKADA BUNDLE** label in Finance, the public ticket page, Scanner results, and ticket emails.

## Upgrade an existing v1.4.2 database

Run this file in Supabase SQL Editor:

`supabase/migration_v1.5.0_major_workflow.sql`

Do not run `setup.sql` over an already-running database.

## Edge Functions to deploy

```bash
npx supabase functions deploy issue-tickets --use-api
npx supabase functions deploy archive-transaction --use-api
npx supabase functions deploy review-online-order --use-api
npx supabase functions deploy apps-script-pull --no-verify-jwt --use-api
npx supabase functions deploy ticket-view --no-verify-jwt --use-api

npx supabase functions deploy scanner-access --no-verify-jwt --use-api
npx supabase functions deploy check-in --no-verify-jwt --use-api
npx supabase functions deploy ticket-lookup --no-verify-jwt --use-api
npx supabase functions deploy online-order-submit --no-verify-jwt --use-api
```

`update-registration`, `resend-ticket`, `retry-sync`, `void-ticket`, and `admin-create-user` can remain deployed from the previous release.

## Google Apps Script

Replace the current Apps Script code with:

`google-apps-script/Code.gs`

This update keeps the same email sender and worker architecture. It only adds Barkada Bundle information to ticket emails.

Keep the existing `PU_FEST_SYNC_SECRET` Script Property and the existing one-minute `processPUFestQueue` trigger.

## Recommended tests

1. Open `scanner.html` without logging in and unlock it with the scanner password.
2. Finance creates 10 paid tickets → confirm 11 tickets are produced and email is queued automatically.
3. Archive a test transaction → confirm it disappears from active records and appears in Archive.
4. Submit one request through `register.html` with proof of payment.
5. Confirm Finance receives a pending notification.
6. Approve the online request → confirm tickets are created only then and email is automatically queued.
7. Reject a second online test → confirm no tickets are created.
8. Scan one normal and one FREE Barkada ticket.
