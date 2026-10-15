# Changelog

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
