# Changelog

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
