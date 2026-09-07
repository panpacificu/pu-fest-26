# PU Fest 2026 Ticketing System — Setup Notes (v1.0.1)

## 1. Supabase Project

Configured project:

- Project URL: `https://kimhqlenfulaflyfhrez.supabase.co`
- Publishable key: already placed in `assets/js/config.js`

The publishable key is designed for browser use. Do **not** place any secret/service-role key in the repository.

## 2. Run the Database Setup

Open:

**Supabase Dashboard → SQL Editor → New query**

Paste the complete contents of:

`supabase/setup.sql`

Run it once.

This creates:

- profiles
- events
- registrations
- tickets
- ticket_secrets
- checkin_logs
- email_logs
- audit_logs
- role helpers
- RLS policies
- atomic ticket redemption function
- atomic registration/ticket creation function
- PU Fest 2026 event seed

## 3. Configure Authentication

Go to:

**Authentication → Providers → Email**

Use email/password authentication for staff.

Recommended production setting:

- Disable public user sign-ups
- Staff accounts are created by Admin through the system or manually in Supabase

For the very first administrator:

1. Go to **Authentication → Users**
2. Add a user manually with email + password
3. Copy `supabase/bootstrap_admin.sql`
4. Replace `YOUR_ADMIN_EMAIL@panpacificu.edu.ph`
5. Run the SQL

After that, the Admin page can create Finance, Event Admin, Scanner, and Viewer accounts.

## 4. Configure Resend

The system is prepared for professional transactional email through Resend.

Before production sending:

1. Create a Resend account
2. Verify `panpacificu.edu.ph` or an approved sending subdomain
3. Complete the required DNS records (SPF/DKIM)
4. Create an API key

Configured sender:

- Display name: `Panpacific University | PU Fest 2026`
- Email: `marketing.staff@panpacificu.edu.ph`
- Reply-To: `marketing.staff@panpacificu.edu.ph`

Resend requires the sending domain to be verified before this address can be used reliably in production.

## 5. Supabase Edge Function Secrets

In:

**Supabase Dashboard → Edge Functions → Secrets**

Add:

```text
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=Panpacific University | PU Fest 2026 <marketing.staff@panpacificu.edu.ph>
EMAIL_REPLY_TO=marketing.staff@panpacificu.edu.ph
SITE_URL=https://panpacificu.github.io/pu-fest-26
ALLOWED_ORIGINS=https://panpacificu.github.io,http://localhost:5500,http://127.0.0.1:5500
```

Supabase automatically provides the project URL and server credentials to deployed functions. The function helpers support both current Supabase secret/publishable key environment variables and legacy service-role/anon variables.

## 6. Deploy Edge Functions

Using Supabase CLI from the project root:

```bash
supabase login
supabase link --project-ref kimhqlenfulaflyfhrez

supabase functions deploy issue-tickets
supabase functions deploy check-in
supabase functions deploy ticket-view --no-verify-jwt
supabase functions deploy ticket-lookup
supabase functions deploy resend-ticket
supabase functions deploy update-registration
supabase functions deploy admin-create-user
```

`ticket-view` is intentionally public because students are not required to log in. It only returns limited ticket/event information after validating the high-entropy QR token.

All staff mutation functions verify the signed-in Supabase user and role inside the function.

## 7. GitHub Pages

Repository:

`https://github.com/panpacificu/pu-fest-26`

Upload the contents of this ZIP into the repository root.

Then:

**GitHub → Settings → Pages**

Set:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

Expected site URL:

`https://panpacificu.github.io/pu-fest-26/`

## 8. Ticket Policy Defaults

Configured in `assets/js/config.js` and the event seed:

```text
Ticket Price: PHP 499
Maximum Tickets: 5
Collect individual ticket-holder names: OFF
```

When individual attendee names are OFF, all tickets in a transaction display the purchaser name.

To enable holder names later, set:

```js
collectTicketHolderNames: true
```

in `assets/js/config.js`.

The database already supports a separate `holder_name` on every ticket.

## 9. OR / Finance Editing

Finance can update:

- OR/reference number
- amount paid
- payment date
- payment method
- notes

These changes are recorded in `audit_logs`.

For safety, ticket quantity and QR identity are not modified through the edit screen after ticket issuance.

## 10. QR Behavior

A QR contains a URL like:

```text
https://panpacificu.github.io/pu-fest-26/ticket.html?t=<random-token>
```

The random token itself contains no student name, course, email, or payment details.

On scan:

1. Scanner extracts the token
2. Secure Edge Function validates it
3. Postgres locks the ticket row
4. If UNUSED → it becomes USED
5. If already USED → duplicate is rejected
6. If VOID → entry is rejected
7. Every attempt is logged

Because the database redemption is performed under a row lock, near-simultaneous scans of the same QR cannot both succeed.

## 11. Email QR Codes

The ticket email uses inline CID QR images, so the QR appears directly in compatible email clients.

The email also contains a large `View Ticket` button and ticket number as fallbacks.

## 12. Branding

Current V1 uses a clean PanpacificU-inspired navy/blue/gold visual system.

When final PU Fest artwork/logo is available, replace or extend:

- `assets/css/app.css`
- email header in `supabase/functions/_shared/email.ts`

No database changes are required for a visual refresh.

## 13. Production Test Checklist

Before selling tickets:

1. Create one Admin account
2. Create one Finance account
3. Create one Scanner account
4. Issue a PHP 499 test ticket to a real email
5. Confirm QR appears in email
6. Open `ticket.html`
7. Scan QR on phone
8. Confirm first scan = VALID
9. Scan again
10. Confirm second scan = ALREADY USED
11. Test OR correction
12. Test resend email
13. Test void ticket from database/admin workflow before event day
14. Test scanner on venue Wi-Fi and mobile data

## 14. Internet Requirement

V1 is an online validation system. Guards need working internet to validate/check in tickets.

For a future version, an offline-safe queue can be designed, but one-time redemption across multiple gates is most reliable when scanners remain connected to Supabase.

## 15. Role Routing

After login:

- `admin` → `admin.html`
- `event_admin` → `admin.html`
- `viewer` → `admin.html`
- `finance` → `finance.html`
- `scanner` → `scanner.html`

If an active user manually opens a page outside their role, the system redirects them to their assigned module instead of signing them out.
