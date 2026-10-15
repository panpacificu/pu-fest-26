# PU Fest 2026 — Fresh Supabase Setup (v1.5.0)

Use this only for a completely new Supabase project.

Current project ref: `vcinzohrrqvowivxkjnp`

## 1. Database

Run the full contents of:

`supabase/setup.sql`

This file already includes the complete v1.5.0 schema. Do not run the historical migration files afterward on a fresh database.

## 2. First Admin

Create the user in Supabase Authentication, then run:

`supabase/bootstrap_admin.sql`

with the correct Admin email.

## 3. Link CLI

```bash
npx supabase link --project-ref vcinzohrrqvowivxkjnp
```

The package now includes `supabase/config.toml`, so `npx supabase init` should not be needed.

## 4. Secrets

Keep the existing Apps Script worker secret aligned with Supabase:

```bash
npx supabase secrets set PU_FEST_SYNC_SECRET="YOUR_PRIVATE_SECRET" SITE_URL="https://panpacificu.github.io/pu-fest-26" ALLOWED_ORIGINS="https://panpacificu.github.io,http://localhost:5500,http://127.0.0.1:5500"
```

Set the scanner password requested for event staff:

```bash
npx supabase secrets set SCANNER_ACCESS_PASSWORD="!PUFEST"
```

Never commit private secrets to GitHub.

## 5. Deploy all Edge Functions

```bash
npx supabase functions deploy admin-create-user --use-api
npx supabase functions deploy issue-tickets --use-api
npx supabase functions deploy resend-ticket --use-api
npx supabase functions deploy retry-sync --use-api
npx supabase functions deploy update-registration --use-api
npx supabase functions deploy void-ticket --use-api
npx supabase functions deploy archive-transaction --use-api
npx supabase functions deploy review-online-order --use-api

npx supabase functions deploy ticket-view --no-verify-jwt --use-api
npx supabase functions deploy apps-script-pull --no-verify-jwt --use-api
npx supabase functions deploy scanner-access --no-verify-jwt --use-api
npx supabase functions deploy check-in --no-verify-jwt --use-api
npx supabase functions deploy ticket-lookup --no-verify-jwt --use-api
npx supabase functions deploy online-order-submit --no-verify-jwt --use-api
```

## 6. Google Apps Script

Replace the current code with `google-apps-script/Code.gs`.

Keep `PU_FEST_SYNC_SECRET` in Script Properties and keep one `processPUFestQueue` time trigger running every minute.

## 7. GitHub Pages

Upload the package contents to the repository root.

Public pages:
- Staff login: `/index.html`
- Online buyer form: `/register.html`
- Scanner: `/scanner.html`

## 8. End-to-end test

Before production, test:
- Finance sale → automatic email
- 10 paid → 11 total tickets
- Online request → Finance notification → approval → automatic email
- Online rejection → no ticket created
- Transaction archive → removed from active lists and retained in Archive
- Scanner password → successful unlock → first scan valid → duplicate rejected
