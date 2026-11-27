# One login for the Invoice portal and the Booking portal

Both portals now use ONE Supabase project (kknmrxopxnhirntmnwhb). A person has one account (email + password) and the
two pages share the same signed-in session. What each person can open is decided by two lists:

| List | Table | Managed in |
|---|---|---|
| Invoice staff (with role) | `staff` | Invoice portal > Admin |
| Booking members (with instrument access) | `booking_members`, `booking_access` | Booking portal > Admin |

Nobody can create an account unless their email is on one of the two lists (`portal_block_unlisted_signup`).

## Setup order
1. SQL Editor (invoice project): run `docs/invoice-admin.sql`, then `docs/booking-setup.sql`, then
   `docs/booking-update-cancel.sql`, then `docs/single-login-setup.sql`.
2. Edge Functions: create `portal-invite` from `supabase/functions/portal-invite/index.ts` (keep "Verify JWT" ON).
3. Authentication > URL Configuration: Site URL `https://harigroup.orgchem.iisc.ac.in`; Redirect URLs: add
   `.../invoice.html` and `.../booking.html`.
4. Authentication > SMTP Settings: your sender (Gmail app password, smtp.gmail.com, 465).
5. GitHub > Settings > Secrets > Actions: `PORTAL_SUPABASE_SERVICE_KEY` = this project's service_role key.
6. Merge the PRs (admin panel first, then the cutover). Run "Sync team to booking members" once with invite_all.
7. Invite the booking admin: Authentication > Users > Invite user > dphari@iisc.ac.in.
