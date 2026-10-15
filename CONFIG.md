# PU Fest 2026 Ticketing System — v1.4.2

## New Supabase Project

Project URL:

`https://vcinzohrrqvowivxkjnp.supabase.co`

Project ref:

`vcinzohrrqvowivxkjnp`

The frontend publishable key is already configured in:

`assets/js/config.js`

## Fresh database

Run only:

`supabase/setup.sql`

on the new empty database.

Then create the first Auth user and run:

`supabase/bootstrap_admin.sql`

Do not run historical migrations after `setup.sql` on a new database.

## Google Apps Script

The existing ticket-email system is retained.

`google-apps-script/Code.gs` has only been updated so the worker connects to the new Supabase project.

The sender remains:

`marketing.staff@panpacificu.edu.ph`

## Full instructions

See:

`NEW_SUPABASE_SETUP.md`
