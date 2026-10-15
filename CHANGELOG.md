# Changelog

## 1.5.4 — Online Payment Accounts

- Added official payment account information to Online Registration
- Clarified Panpacific University, Inc. as Urdaneta Campus
- Added Urdaneta accounts: BPI, RCBC, Security Bank
- Added Tayug accounts: Security Bank, BDO
- Added one-click Copy buttons for account numbers
- Added payment reminder before proof-of-payment upload
- Frontend-only update
- No SQL, Edge Function, or Apps Script changes

## 1.5.3 — Dashboard / Registration / Scanner Fixes

- Archived Transactions are hidden by default on Admin and Finance
- Added Show Archive / Hide Archive toggle
- Archive data loads only when opened
- Fixed Online Registration PU Fest logo overlap with headline
- Added PU Fest logo to public registration topbar
- Fixed Scanner unlock screen text contrast and readability
- Frontend-only update
- No SQL changes
- No Supabase function redeploy
- No Apps Script changes

## 1.5.2 — Aggressive PU Fest Festival UI

- Stronger event-microsite visual treatment across all frontend pages
- Added festival ribbons and event-operation headers
- More dramatic blue/cyan/green gradients and glow effects
- Improved login landing page and public online-registration experience
- Added premium ticket-pass styling
- Upgraded scanner visuals for entrance use
- Refined Admin and Finance dashboard cards, stats, tables, and status treatments
- Added subtle motion effects without changing application behavior
- Frontend only: no SQL, Edge Function, or Apps Script changes

## 1.5.1 — PU Fest Frontend Branding Update

- Updated the frontend visual theme to match the official PU Fest 2026 look
- Added the provided PU Fest 2026 logo as the main system brand asset
- Applied the provided event background artwork across the login, public registration, ticket, and scanner views
- Refreshed topbars, cards, gradients, chips, and buttons to use the PU Fest blue-green palette
- Added a more event-branded presentation for Admin, Finance, Scanner, and public pages
- No database changes
- No Edge Function changes
- No Apps Script changes

## 1.5.0 — Online Sales, Archive, Scanner Access & Barkada Bundle

- Scanner no longer requires a staff account
- Added server-validated scanner password access
- Added `scanner-access` Edge Function
- Changed `check-in` and `ticket-lookup` to password-gated public scanner endpoints
- Added safe transaction Archive workflow for Finance/Admin/Event Admin
- Added permanent transaction archive ledger for review
- Added public `register.html` online ticket request page
- Added required proof-of-payment upload for online requests
- Added Finance online-request notification and review queue
- Online orders create no ticket until Finance approval
- Approved online orders automatically enter the existing email/Google Sheet workflow
- Rejected online requests create no tickets
- Finance-created tickets continue to email automatically as before
- Increased maximum paid ticket quantity from 5 to 50
- Added Barkada Bundle: every 10 paid tickets adds 1 FREE ticket
- Added `is_free` ticket flag and green FREE ticket indicators
- Updated ticket email to highlight Barkada Bundle tickets
- Added source categorization: Finance / Online
- Added source filtering to Finance
- Added archived transaction views to Finance and Admin
- Updated public ticket page and Scanner to identify FREE tickets

## 1.4.2 — New Supabase Project Reset

- Switched to Supabase project `vcinzohrrqvowivxkjnp`
- Kept existing marketing-email ticket delivery workflow
