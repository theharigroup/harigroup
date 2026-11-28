-- Run in the invoice project (kknmrxopxnhirntmnwhb) AFTER invoice-admin.sql, booking-setup.sql and
-- booking-update-cancel.sql. Creates the first booking admin + gives them every instrument.
insert into public.booking_members (email, name, role, status)
values ('YOUR_EMAIL@iisc.ac.in', 'Your Name', 'admin', 'active')
on conflict (email) do nothing;

insert into public.booking_access (email, instrument_id)
select 'YOUR_EMAIL@iisc.ac.in', id from public.booking_instruments where active
on conflict do nothing;
