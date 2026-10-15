# PU Fest 2026 — Fresh Supabase Setup (v1.4.2)

This package is configured for the new Supabase project:

- Project URL: `https://vcinzohrrqvowivxkjnp.supabase.co`
- Project ref: `vcinzohrrqvowivxkjnp`
- GitHub Pages: `https://panpacificu.github.io/pu-fest-26`

The browser uses only the Supabase publishable key. Never place a service-role or secret key in GitHub.

## Important: old tickets

A new Supabase database starts empty.

Old QR tickets from the previous database cannot be validated by this new database unless their original private QR secrets are restored. Those secrets were intentionally never stored in Google Sheets.

If the old records were only tests, simply start fresh.

If real tickets were already issued, reissue them from the new system and send the new tickets to their owners.

---

## STEP 1 — Set up the new database

Open the new Supabase project.

Go to:

SQL Editor → New query

Run the complete contents of:

`supabase/setup.sql`

For a fresh database, **do not run the older migration files afterward**. `setup.sql` already contains the current schema through v1.4.1/v1.4.2.

Expected:

`Success. No rows returned`

---

## STEP 2 — Create your first Admin account

In Supabase:

Authentication → Users → Add user

Create your Admin login.

Then open:

`supabase/bootstrap_admin.sql`

Replace:

`YOUR_ADMIN_EMAIL@panpacificu.edu.ph`

with the email you just created.

Run that SQL in the SQL Editor.

The result should show the account with:

`role = admin`
`active = true`

---

## STEP 3 — Link your local project to the new Supabase project

From the extracted v1.4.2 folder:

```bash
npx supabase link --project-ref vcinzohrrqvowivxkjnp
```

---

## STEP 4 — Configure the private worker secret

The Apps Script worker and Supabase must use the **same** `PU_FEST_SYNC_SECRET`.

If you still have the current value saved in Google Apps Script → Project Settings → Script Properties, you can reuse it.

Set that exact same value in the NEW Supabase project:

```bash
npx supabase secrets set PU_FEST_SYNC_SECRET="YOUR_PRIVATE_SECRET" SITE_URL="https://panpacificu.github.io/pu-fest-26" ALLOWED_ORIGINS="https://panpacificu.github.io,http://localhost:5500,http://127.0.0.1:5500"
```

Do not send the private secret to anyone or commit it to GitHub.

If the old secret is no longer available, create a new strong secret and set the new value in BOTH:
- Supabase Edge Function secrets
- Google Apps Script Script Properties → `PU_FEST_SYNC_SECRET`

---

## STEP 5 — Deploy ALL Edge Functions

Because this is a new Supabase project, deploy every function:

```bash
npx supabase functions deploy admin-create-user --use-api
npx supabase functions deploy check-in --use-api
npx supabase functions deploy issue-tickets --use-api
npx supabase functions deploy resend-ticket --use-api
npx supabase functions deploy retry-sync --use-api
npx supabase functions deploy ticket-lookup --use-api
npx supabase functions deploy update-registration --use-api
npx supabase functions deploy void-ticket --use-api

npx supabase functions deploy ticket-view --no-verify-jwt --use-api
npx supabase functions deploy apps-script-pull --no-verify-jwt --use-api
```

`ticket-view` is public because ticket owners need to open their ticket link.

`apps-script-pull` is public at the Supabase JWT layer because Google Apps Script calls it directly, but it still validates the private shared worker secret.

---

## STEP 6 — Update Google Apps Script

Keep using the SAME Google Sheet and the SAME marketing email account.

Open:

Google Sheet → Extensions → Apps Script

Replace the current `Code.gs` with:

`google-apps-script/Code.gs`

The email sender remains:

`Panpacific University | PU Fest 2026`
`marketing.staff@panpacificu.edu.ph`

The only infrastructure change is that the worker now talks to the NEW Supabase project.

Save.

If your one-minute trigger already exists, you can keep it.

You may run:

`setupPUFestWorker`

once to make sure exactly one `processPUFestQueue` trigger exists.

Then manually run:

`processPUFestQueue`

once after the first test ticket.

---

## STEP 7 — Replace GitHub repository files

Since you plan to clear the repository, upload the **contents** of this v1.4.2 folder to the repository root.

Do not upload the ZIP itself as the website.

The repository root should contain:

- `index.html`
- `finance.html`
- `admin.html`
- `scanner.html`
- `ticket.html`
- `assets/`
- `supabase/`
- `google-apps-script/`
- `README.md`
- `CONFIG.md`
- `CHANGELOG.md`

The site configuration in `assets/js/config.js` is already set to the new Supabase project.

---

## STEP 8 — Final test

Test one ticket from start to finish:

1. Sign in as Admin/Finance.
2. Create one ticket.
3. Confirm the new randomized ticket number is created.
4. Confirm Finance shows the ticket.
5. Confirm Google Sheet backup appears.
6. Confirm the marketing email sends the QR ticket.
7. Open the emailed ticket.
8. Scan it with Scanner.
9. Confirm the first scan succeeds.
10. Scan it again and confirm duplicate entry is rejected.

After that, the new database is ready for production use.
