-- =====================================================================================
-- Invoice portal: secure login + Row Level Security (run ONCE in Supabase > SQL Editor)
-- =====================================================================================
-- BEFORE the new invoice.html goes live:
--   1. Run this whole file.
--   2. Supabase > Authentication > Users > "Add user" for each staff email below
--      (set a NEW strong password for each; tick "Auto Confirm User").
--      Supabase > Authentication > URL Configuration: add the site URL
--      https://harigroup.orgchem.iisc.ac.in/invoice.html to the Redirect URLs (for "Forgot password").
--   3. Change/retire the old passwords that were visible in the old page source.
-- After this, the public anon key alone can no longer read or change any invoice data.
-- =====================================================================================

-- 1) Who is allowed in, and with which role -----------------------------------------
create table if not exists public.staff (
  email text primary key,
  name  text not null,
  role  text not null check (role in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Lab Accountant','Office Staff','Administrator')),
  title text
);

insert into public.staff (email, name, role, title) values
  ('bibhasbiswal@iisc.ac.in',  'Bibhas Ranjan',   'Solvent Manager',   'Lab Consumable Receiver'),
  ('anupamdutta@iisc.ac.in',   'Anupam Dutta',    'Chemical Manager',  'Lab Consumable Receiver'),
  ('rwishanyadas@iisc.ac.in',  'Rwishanya Das',   'Chemical Manager',  'Lab Consumable Receiver'),
  ('athmananda@iisc.ac.in',    'Athmanand Anchi', 'Glassware Manager', 'Lab Consumable Receiver'),
  ('binadas@iisc.ac.in',       'Bina Das',        'Lab Accountant',    'Financial Manager'),
  ('oc.office@iisc.ac.in',     'Office Staff',    'Office Staff',      'University Finance Admin'),
  ('tushraas@iisc.ac.in',      'Tushar Singha',   'Administrator',     'Administrator')
on conflict (email) do update set name = excluded.name, role = excluded.role, title = excluded.title;

-- 2) Helper: role of the signed-in user (null when not staff) ------------------------
create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where lower(email) = lower(auth.jwt() ->> 'email')
$$;
revoke all on function public.staff_role() from public, anon;
grant execute on function public.staff_role() to authenticated;

-- 3) Lock the tables, then open them only to signed-in staff -------------------------
alter table public.staff         enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

drop policy if exists staff_read_self on public.staff;
create policy staff_read_self on public.staff for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));            -- nobody can edit staff from the browser

drop policy if exists inv_select on public.invoices;
create policy inv_select on public.invoices for select to authenticated
  using (public.staff_role() is not null);

drop policy if exists inv_insert on public.invoices;
create policy inv_insert on public.invoices for insert to authenticated
  with check (public.staff_role() in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Administrator'));

drop policy if exists inv_update on public.invoices;
create policy inv_update on public.invoices for update to authenticated
  using (public.staff_role() is not null) with check (public.staff_role() is not null);
  -- note: Postgres RLS cannot restrict single columns; the page limits who sees which buttons.

drop policy if exists inv_delete on public.invoices;
create policy inv_delete on public.invoices for delete to authenticated
  using (public.staff_role() in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Administrator')
         and status in ('SUBMITTED','REJECTED'));

drop policy if exists items_select on public.invoice_items;
create policy items_select on public.invoice_items for select to authenticated
  using (public.staff_role() is not null);

drop policy if exists items_write on public.invoice_items;
create policy items_write on public.invoice_items for all to authenticated
  using (public.staff_role() in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Lab Accountant','Administrator'))
  with check (public.staff_role() in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Lab Accountant','Administrator'));

-- 4) The anonymous (logged-out) key gets nothing ---------------------------------------
revoke all on public.staff, public.invoices, public.invoice_items from anon;
