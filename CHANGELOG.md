# Changelog

## 1.4.2 — New Supabase Project Reset

- Switched frontend to new Supabase project `vcinzohrrqvowivxkjnp`
- Updated publishable browser key
- Updated Google Apps Script worker URL to the new Supabase project
- Kept existing marketing-email ticket delivery workflow
- Kept Finance table dashboard from v1.4.1
- Added clean fresh-database installation guide
- `setup.sql` now represents the current complete schema for a new database
- No old ticket data is bundled or migrated

## 1.4.1 — Finance Dashboard Correction

- Restored the original automatic ticket-email workflow
- Ticket emails continue to be sent by the existing Google Apps Script / marketing email setup
- Creating a ticket automatically queues the email as before
- Finance remains table-first for easier day-to-day use
- Shows ticket/student, Control/OR, receipt, ticket status, and email status
- Action button is now `Resend Ticket`, not the primary sending workflow
- Receipt photo support remains optional
- Email status continues to update automatically from Pending/Processing to Sent
- No Apps Script changes required

## 1.4.0 — Finance Table Workflow

- Redesigned Finance into a table-first workflow
- New Ticket form moved into a popup
- One row per issued ticket
- Added Control / OR number column
- Added optional payment receipt photo
- Added private `payment-receipts` storage bucket
- Receipt thumbnails can be viewed from the table
- Payment/control/receipt details can be updated from the row
- New tickets no longer email automatically
- Added explicit `Send Ticket` action
- Email status now moves from `NOT SENT` → `QUEUED` → `SENDING` → `SENT`
- Sent tickets can still be resent when necessary
- Finance table auto-refreshes while an email is being processed
- Google Sheet backup still happens automatically after ticket creation
- Requires v1.4.0 SQL migration
- Requires redeploying `issue-tickets` and `update-registration`

## 1.3.2 — Supabase pgcrypto Hotfix

- Fixed `gen_random_bytes(integer) does not exist`
- Qualified Supabase pgcrypto call as `extensions.gen_random_bytes(...)`
- Added `extensions` to the generator function search path
- No Edge Function redeployment required
- No Apps Script changes required
- Existing tickets remain valid

## 1.3.1 — Ticket ID Security Hardening

- Replaced predictable sequential public ticket numbers for all NEW tickets
- New format: `PUF26-XXXX-XXXX-XXXX`
- Ticket public codes are generated from cryptographically secure random bytes
- Approx. 64 bits of randomness in the visible ticket code
- Existing issued tickets remain valid and unchanged
- QR admission token remains the stronger 256-bit secret credential
- Transaction numbers remain sequential because they are administrative references only
- Updated scanner manual lookup placeholder and verification instructions
- No Edge Function redeployment required
- Requires one SQL migration

## 1.3.0 — Admin + Finance Polish

- Fixed Admin Dashboard stuck on `Loading...`
- Added missing Tickets dashboard section
- Switched dashboard startup to independent `Promise.allSettled` loaders
- Added per-panel error states
- Added registration search and delivery-status filters
- Added ticket search and status filters
- Added Resend Email controls
- Added Retry Backup controls
- Added new `retry-sync` Edge Function
- Improved Void Ticket workflow and queued Sheet refresh after void
- Added Gate Activity statistics
- Added recent administrative activity
- Added registration CSV export
- Added attendance percentage stat
- Added backup/email status to Finance recent transactions
- Added compact responsive Admin/Finance controls
- No new SQL migration required

## 1.2.0 — Pull-Based Google Worker

- Reversed Google integration direction to avoid Apps Script HTTP 401 from Supabase-origin requests
- Added `apps-script-pull` Supabase Edge Function
- Google Apps Script now polls Supabase every minute
- Added automatic one-minute worker trigger setup
- Added LockService protection against overlapping Apps Script worker runs
- Ticket creation no longer waits for Google Sheets/email
- New tickets are queued as PENDING for backup/email
- Finance payment edits queue a Google Sheet refresh
- Resend action queues email for the worker
- Existing QR security and one-time admission remain unchanged
- No new SQL migration required beyond v1.1.0 migration

## 1.1.1 — Apps Script Bridge Hotfix

- Simplified Supabase → Apps Script POST request
- Removed custom User-Agent header
- Changed request body content type to simple `text/plain;charset=utf-8`
- Retained JSON payload parsing through Apps Script `e.postData.contents`
- Added HTTP status and response preview to bridge diagnostics
- No database migration required

## 1.1.0 — Google Sheets Backup + Apps Script Email

- Switched transactional ticket email from Resend to Google Apps Script MailApp
- Added Google Sheets backup bridge
- Configured `PU-Fest-Tickets 2026 (Backup)`
- Added automatic Registrations, Tickets, Email Logs, and Sync Logs tabs
- Added secure shared-secret authentication between Supabase and Apps Script
- Raw QR secrets remain excluded from Google Sheets
- QR images are generated server-side in Supabase and embedded in email
- Added Sheet sync status fields to Supabase registrations
- Added email sent/error timestamps to Supabase
- Finance OR/payment corrections now re-sync to Google Sheets
- Admin dashboard now shows both Backup and Email status
- Ticket creation remains successful even when backup/email delivery temporarily fails
- Added v1.1.0 migration SQL
- Removed Resend dependency from ticket email workflow

## 1.0.1 — Compact UI & Role Routing

- Inter font applied across the entire system
- Simplified, compact visual design
- Improved spacing, form density, and readability
- Mobile-first form controls and larger tap targets
- Better phone layout for Finance
- Cleaner Admin dashboard cards and tables
- More focused Scanner interface
- Compact digital ticket layout
- Role-based routing retained after login
- Unauthorized active users are redirected to their own module instead of being signed out
- Finance users no longer need to navigate through Admin
- Scanner/Guard accounts land directly on Scanner
- Admin/Event Admin accounts land on Dashboard
- Viewer accounts remain limited to Dashboard

## 1.0.0 — Initial Build

- PU Fest 2026 event configuration
- Supabase Auth staff login
- Role model: Admin, Finance, Event Admin, Scanner, Viewer
- Finance registration/payment entry
- PHP 499 automatic ticket pricing
- Default maximum of 5 tickets
- Unique per-ticket QR token
- One-time atomic ticket redemption
- Duplicate/used/void result handling
- Camera QR scanner
- Manual ticket-number lookup
- Professional HTML ticket confirmation email
- Inline QR images using CID attachments
- Resend email support
- OR/payment correction workflow
- Audit logging
- Admin dashboard
- Staff user creation Edge Function
- Public ticket viewer
- SQL/RLS setup scripts
- GitHub Pages configuration
