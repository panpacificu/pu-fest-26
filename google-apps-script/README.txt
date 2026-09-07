PU FEST 2026 — APPS SCRIPT QUICK SETUP

1. Open:
   PU-Fest-Tickets 2026 (Backup)

2. Extensions → Apps Script

3. Paste:
   Code.gs

4. Save.

5. Run:
   setupPUFestSystem()

6. Authorize with the Workspace account that should send the official email.

7. Copy the generated Sync Secret.

8. Deploy → New deployment → Web app
   Execute as: Me
   Who has access: Anyone

9. Copy the /exec Web App URL.

10. Add BOTH of these to Supabase Edge Function Secrets:
    APPS_SCRIPT_WEBAPP_URL
    PU_FEST_SYNC_SECRET

See the root CONFIG.md for the full instructions.
