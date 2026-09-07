# PU Fest 2026 Ticketing System

**Version:** 1.0.0  
**Event:** PU Fest 2026  
**Date:** October 30, 2026  
**Time:** 1:00 PM–6:00 PM  
**Venue:** PanpacificU Events Center  
**Ticket Price:** PHP 499

A static GitHub Pages frontend backed by Supabase Auth, Postgres, Row Level Security, and Edge Functions.

## Core Features

- Finance login and payment/registration encoding
- Automatic total calculation at PHP 499 per ticket
- Up to 5 tickets per transaction by default
- One cryptographically-random QR token per ticket
- One-scan-only admission
- Duplicate/used/void ticket detection
- Mobile QR scanner for guards
- Manual ticket-number lookup/check-in
- Professional HTML confirmation email with inline QR codes
- Resend ticket email without regenerating QR codes
- OR/payment detail editing with audit logs
- Admin dashboard, ticket voiding, and staff account creation
- Ticket, check-in, email, and audit records
- Public ticket viewer without exposing student records directly

## Important Security Design

The browser contains only the Supabase **publishable key**. This is expected and safe for public web apps when Row Level Security is configured correctly.

The Supabase secret/service-role key and the Resend API key must only exist in Supabase Edge Function Secrets. Never add them to GitHub.

QR secrets are stored in `ticket_secrets`, a table unavailable to browser roles. Staff-facing `tickets` rows contain only a SHA-256 token hash.

## Setup

Follow **CONFIG.md** in order.

## Default Ticket Policy

- Ticket price: PHP 499
- Maximum quantity: 5
- Extra tickets use the purchaser name by default
- QR is valid once only
- OR/payment data may be corrected after issuance
- Ticket quantity/QR identity is not edited in-place after issuance
- To replace a ticket, void/reissue instead of changing a live QR

## Repository Structure

- `index.html` — staff login
- `finance.html` — finance registration/payment screen
- `admin.html` — admin dashboard
- `scanner.html` — guard scanner
- `ticket.html` — public ticket viewer
- `assets/` — shared styles/scripts
- `supabase/setup.sql` — database schema, RLS, functions, event seed
- `supabase/bootstrap_admin.sql` — promote the first staff user to admin
- `supabase/functions/` — secure Edge Functions

## Versioning

See `CHANGELOG.md`.
