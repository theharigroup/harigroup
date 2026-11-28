-- =====================================================================================
-- Invoice portal: Admin panel support (staff management) + one sign-up gate for the whole project.
-- Run ONCE in Supabase > SQL Editor (project kknmrxopxnhirntmnwhb). Safe to re-run. Additive only:
-- no invoice data is touched.
-- After this, an Administrator can add staff, change roles, switch people on/off and email
-- "set your password" links from the Admin panel in invoice.html (no more editing SQL).
-- =====================================================================================

-- 1) Staff can be switched off without deleting them ---------------------------------
alter table public.staff add column if not exists active boolean not null default true;

-- a switched-off person has no role, so Row Level Security already locks them out of everything
create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where lower(email) = lower(auth.jwt() ->> 'email') and active
$$;
revoke all on function public.staff_role() from public, anon;
grant execute on function public.staff_role() to authenticated;

-- 2) Only an Administrator may read everyone and add / edit staff (never delete) -------
grant select, insert, update on public.staff to authenticated;
drop policy if exists staff_admin_read   on public.staff;
drop policy if exists staff_admin_insert on public.staff;
drop policy if exists staff_admin_update on public.staff;
create policy staff_admin_read   on public.staff for select to authenticated
  using (public.staff_role() = 'Administrator');
create policy staff_admin_insert on public.staff for insert to authenticated
  with check (public.staff_role() = 'Administrator' and email = lower(email) and active);
create policy staff_admin_update on public.staff for update to authenticated
  using (public.staff_role() = 'Administrator') with check (public.staff_role() = 'Administrator');

-- 3) Guard rails: email never changes; an admin cannot demote or switch off themself;
--    at least one active Administrator always remains --------------------------------
create or replace function public.staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.email <> old.email then raise exception 'The email of a staff member cannot be changed.'; end if;
    if lower(old.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and (new.role <> old.role or new.active is distinct from old.active) then
      raise exception 'You cannot change your own role or switch yourself off.';
    end if;
    if old.role = 'Administrator' and old.active and (new.role <> 'Administrator' or not new.active)
       and not exists (select 1 from public.staff where role = 'Administrator' and active and email <> old.email) then
      raise exception 'At least one active Administrator is required.';
    end if;
  end if;
  new.email := lower(new.email);
  return new;
end $$;
drop trigger if exists staff_guard on public.staff;
create trigger staff_guard before insert or update on public.staff
  for each row execute function public.staff_guard();

-- 4) One sign-up gate for the whole project -------------------------------------------
-- A login account can only be created for an email that is an active staff member OR an active
-- booking member (booking tables are checked only if they exist). This is what keeps "anyone with
-- an IISc email" out, for the invoice portal and the booking portal alike.
create or replace function public.portal_block_unlisted_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare ok boolean := false;
begin
  select exists (select 1 from public.staff where lower(email) = lower(new.email) and active) into ok;
  if not ok and to_regclass('public.booking_members') is not null then
    execute 'select exists (select 1 from public.booking_members where email = lower($1) and status = ''active'')'
      into ok using new.email;
  end if;
  if not ok then raise exception 'This email is not approved for this portal.'; end if;
  return new;
end $$;
drop trigger if exists portal_block_unlisted_signup on auth.users;
create trigger portal_block_unlisted_signup before insert on auth.users
  for each row execute function public.portal_block_unlisted_signup();
-- (if you ever ran the old booking-only trigger in this project, remove it:)
drop trigger if exists bk_block_unlisted_signup on auth.users;
