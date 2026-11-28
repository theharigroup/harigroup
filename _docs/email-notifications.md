# E-mail notifications (Gmail SMTP)

| Portal | Event | Who gets the mail |
|---|---|---|
| Invoice | an invoice is submitted (new, or a rejected one re-submitted) | every **active Lab Accountant** in Members |
| Booking | a slot is booked | the person who booked (only them) |
| Booking | a booking is cancelled (by them or an admin) | the person whose booking it was |

Maintenance blocks send nothing. Sender is the Gmail account below ("Hari Group Portal").

## Set-up (once)
1. Supabase (invoice_management) > Edge Functions > **portal-notify** > create, paste `supabase/functions/portal-notify/index.ts`, switch **Verify JWT OFF**, Deploy.
2. Edge Functions > Secrets, add: `GMAIL_USER` (the Gmail address), `GMAIL_APP_PASSWORD` (16-letter app password), `WEBHOOK_SECRET` (any long random text).
3. SQL editor: open `_docs/portal-notify.sql`, replace `REPLACE_WITH_WEBHOOK_SECRET` with the same text, Run.
4. Test: book and cancel a slot; submit a test invoice. Check Edge Functions > portal-notify > Logs if nothing arrives.

Gmail allows about 500 mails a day on a normal account, far above what the lab needs.
