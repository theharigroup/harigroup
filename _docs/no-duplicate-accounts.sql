-- One person = one account. Emails are stored trimmed + lower-case and must look like an e-mail, in both member lists.
-- (Sign-in accounts themselves are already unique: Supabase Auth refuses a second account for the same e-mail.)
-- Safe to run more than once.
update public.staff set email = lower(btrim(email)) where email <> lower(btrim(email));
update public.booking_members set email = lower(btrim(email)) where email <> lower(btrim(email));

alter table public.staff drop constraint if exists staff_email_clean;
alter table public.staff add constraint staff_email_clean
  check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;

alter table public.booking_members drop constraint if exists booking_members_email_clean;
alter table public.booking_members add constraint booking_members_email_clean
  check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
