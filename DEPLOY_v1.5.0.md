# Deploy v1.5.0

For the current Supabase project `vcinzohrrqvowivxkjnp`:

## 1. Database

Run in Supabase SQL Editor:

`supabase/migration_v1.5.0_major_workflow.sql`

Expected: `Success. No rows returned`

## 2. Scanner password secret

From the v1.5.0 project folder:

```bash
npx supabase link --project-ref vcinzohrrqvowivxkjnp
npx supabase secrets set SCANNER_ACCESS_PASSWORD="!PUFEST"
```

Do not put this password in GitHub source code.

## 3. Deploy changed/new functions

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

## 4. Apps Script

Replace the current Apps Script with `google-apps-script/Code.gs`.

Do not change your existing `PU_FEST_SYNC_SECRET`.

Keep the current one-minute trigger.

## 5. GitHub

Upload all v1.5.0 files to the repository.

New public page:

`register.html`

Live URL after GitHub Pages updates:

`https://panpacificu.github.io/pu-fest-26/register.html`

## 6. Test before real sales

Use test transactions only until Finance creation, automatic email, online approval, archive, Barkada Bundle, and scanner password access have all passed once.
