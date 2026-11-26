-- =====================================================================================
-- Instrument booking: tables, Row Level Security and overlap protection
-- Run ONCE in Supabase > SQL Editor, then follow the steps at the bottom of this file.
-- =====================================================================================
-- Security model
--   * Sign-in is Supabase Auth (email + password). Only emails listed in booking_members can use the portal.
--   * Every rule below is enforced by the database, not by the web page, so the public anon key alone
--     can read or change nothing.
--   * Two roles: 'member' (books instruments they have been given access to) and 'admin'
--     (manages members, instruments and maintenance blocks, can cancel any booking).
--   * Bookings are never deleted. Cancelling sets cancelled_at, so the usage history is kept.
--   * Overlapping bookings on the same instrument are refused by an exclusion constraint.
-- All times are stored as timestamptz and interpreted in Asia/Kolkata (IST).
-- =====================================================================================

create extension if not exists btree_gist;

-- 1) Members (the allow-list) ---------------------------------------------------------
create table if not exists public.booking_members (
  email      text primary key check (email = lower(email)),
  name       text not null check (length(name) between 1 and 80),
  role       text not null default 'member' check (role in ('member','admin')),
  status     text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

-- 2) Instruments, each with its own slot setup ---------------------------------------
create table if not exists public.booking_instruments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(name) between 1 and 80),
  sub             text,
  location        text,
  photo_url       text check (photo_url is null or length(photo_url) < 250000),
  slot_minutes    int  not null check (slot_minutes between 15 and 720),
  day_start       int  not null check (day_start between 0 and 1439),     -- minutes after midnight, IST
  day_end         int  not null check (day_end between 1 and 1440),
  overnight       boolean not null default false,                         -- one extra slot from day_end to next day_start
  days            int[] not null default '{0,1,2,3,4,5,6}',                -- 0 = Sunday ... 6 = Saturday
  book_ahead_days int  not null default 2  check (book_ahead_days between 1 and 90),
  max_consecutive int  not null default 2  check (max_consecutive between 1 and 12),
  active          boolean not null default true,
  sort_order      int  not null default 0,
  check (day_end > day_start)
);

-- 3) Which member may book which instrument ------------------------------------------
create table if not exists public.booking_access (
  email         text not null references public.booking_members(email) on delete cascade on update cascade,
  instrument_id uuid not null references public.booking_instruments(id) on delete cascade,
  primary key (email, instrument_id)
);

-- 4) Bookings (and maintenance blocks) ------------------------------------------------
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.booking_instruments(id),
  member_email  text not null,
  member_name   text not null,
  kind          text not null default 'booking' check (kind in ('booking','maintenance')),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  note          text check (note is null or length(note) <= 200),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  check (ends_at > starts_at),
  constraint no_double_booking exclude using gist
    (instrument_id with =, tstzrange(starts_at, ends_at) with &&) where (cancelled_at is null)
);
create index if not exists bookings_inst_time on public.bookings (instrument_id, starts_at);
create index if not exists bookings_member on public.bookings (member_email, starts_at);

-- 5) Helpers (run as the table owner, so RLS does not loop) ---------------------------
create or replace function public.bk_email() returns text
language sql stable as $$ select lower(auth.jwt() ->> 'email') $$;

create or replace function public.bk_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from booking_members where email = lower(auth.jwt() ->> 'email') and status = 'active')
$$;

create or replace function public.bk_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from booking_members where email = lower(auth.jwt() ->> 'email') and status = 'active' and role = 'admin')
$$;

create or replace function public.bk_can_book(inst uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.bk_is_admin() or exists (
    select 1 from booking_access a join booking_members m on m.email = a.email
    where a.instrument_id = inst and m.email = lower(auth.jwt() ->> 'email') and m.status = 'active')
$$;

revoke all on function public.bk_is_member(), public.bk_is_admin(), public.bk_can_book(uuid) from public, anon;
grant execute on function public.bk_is_member(), public.bk_is_admin(), public.bk_can_book(uuid) to authenticated;

-- 6) Row Level Security ---------------------------------------------------------------
alter table public.booking_members     enable row level security;
alter table public.booking_instruments enable row level security;
alter table public.booking_access      enable row level security;
alter table public.bookings            enable row level security;
revoke all on public.booking_members, public.booking_instruments, public.booking_access, public.bookings from anon;
-- signed-in users only; RLS policies below decide which rows. (No delete on bookings: cancel is a soft update.)
grant select, insert, update, delete on public.booking_members, public.booking_instruments, public.booking_access to authenticated;
grant select, insert, update on public.bookings to authenticated;

-- members: a person reads only their own row; admins read and manage everyone
drop policy if exists bm_read   on public.booking_members;
drop policy if exists bm_admin  on public.booking_members;
create policy bm_read  on public.booking_members for select to authenticated
  using (email = public.bk_email() or public.bk_is_admin());
create policy bm_admin on public.booking_members for all to authenticated
  using (public.bk_is_admin()) with check (public.bk_is_admin());

-- instruments: every active member reads them; only admins change them
drop policy if exists bi_read  on public.booking_instruments;
drop policy if exists bi_admin on public.booking_instruments;
create policy bi_read  on public.booking_instruments for select to authenticated
  using (public.bk_is_member() and (active or public.bk_is_admin()));
create policy bi_admin on public.booking_instruments for all to authenticated
  using (public.bk_is_admin()) with check (public.bk_is_admin());

-- access list: a person sees their own rows; admins manage all
drop policy if exists ba_read  on public.booking_access;
drop policy if exists ba_admin on public.booking_access;
create policy ba_read  on public.booking_access for select to authenticated
  using (email = public.bk_email() or public.bk_is_admin());
create policy ba_admin on public.booking_access for all to authenticated
  using (public.bk_is_admin()) with check (public.bk_is_admin());

-- bookings: members see the table (names are shown to the group), book only for themselves,
-- and cancel only their own. Admins can also block maintenance and cancel anything. No deletes.
drop policy if exists bk_read   on public.bookings;
drop policy if exists bk_insert on public.bookings;
drop policy if exists bk_update on public.bookings;
create policy bk_read on public.bookings for select to authenticated using (public.bk_is_member());
create policy bk_insert on public.bookings for insert to authenticated
  with check (
    public.bk_is_member() and public.bk_can_book(instrument_id)
    and ((kind = 'booking' and member_email = public.bk_email()) or (kind = 'maintenance' and public.bk_is_admin()))
  );
create policy bk_update on public.bookings for update to authenticated
  using (member_email = public.bk_email() or public.bk_is_admin())
  with check (member_email = public.bk_email() or public.bk_is_admin());

-- 7) Booking rules, checked by the database ------------------------------------------
create or replace function public.bk_validate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i   booking_instruments;
  ls  timestamp;  le timestamp;                       -- start / end as IST wall-clock time
  sm  int;  em int;  dur int;  night int;
  me  booking_members;
begin
  if tg_op = 'UPDATE' then
    -- only cancelling is allowed; nothing else may change
    if (new.instrument_id, new.member_email, new.member_name, new.kind, new.starts_at, new.ends_at, new.note)
       is distinct from (old.instrument_id, old.member_email, old.member_name, old.kind, old.starts_at, old.ends_at, old.note) then
      raise exception 'A booking cannot be edited. Cancel it and book again.';
    end if;
    if old.cancelled_at is not null and new.cancelled_at is null then
      raise exception 'A cancelled booking cannot be restored.';
    end if;
    if new.cancelled_at is not null and old.cancelled_at is null then
      new.cancelled_at := now();
      if old.kind = 'booking' and old.starts_at <= now() and not public.bk_is_admin() then
        raise exception 'A booking that has already started cannot be cancelled.';
      end if;
    end if;
    return new;
  end if;

  -- INSERT
  select * into i from booking_instruments where id = new.instrument_id;
  if i.id is null or not i.active then raise exception 'This instrument is not available for booking.'; end if;
  select * into me from booking_members where email = lower(auth.jwt() ->> 'email');
  new.member_email := lower(auth.jwt() ->> 'email');         -- never trust what the browser sent
  new.member_name  := me.name;
  new.cancelled_at := null;

  if new.kind = 'maintenance' then return new; end if;        -- admins block any range

  if new.starts_at < now() - interval '1 minute' then raise exception 'That slot has already started.'; end if;
  if new.starts_at > now() + make_interval(days => i.book_ahead_days) then
    raise exception 'You can book up to % days ahead.', i.book_ahead_days;
  end if;

  ls := new.starts_at at time zone 'Asia/Kolkata';
  le := new.ends_at   at time zone 'Asia/Kolkata';
  sm := extract(hour from ls)::int * 60 + extract(minute from ls)::int;
  em := extract(hour from le)::int * 60 + extract(minute from le)::int;
  dur := (extract(epoch from (new.ends_at - new.starts_at)) / 60)::int;
  night := 1440 - i.day_end + i.day_start;

  if i.overnight and sm = i.day_end and dur = night then
    if not (extract(dow from ls)::int = any (i.days)) then raise exception 'This instrument is closed that day.'; end if;
    return new;                                              -- the single overnight slot
  end if;

  if not (extract(dow from ls)::int = any (i.days)) then raise exception 'This instrument is closed that day.'; end if;
  if ls::date <> le::date and not (em = 0 and le::date = ls::date + 1) then raise exception 'A booking must stay within one day.'; end if;
  if em = 0 and le::date = ls::date + 1 then em := 1440; end if;
  if sm < i.day_start or em > i.day_end or (sm - i.day_start) % i.slot_minutes <> 0 or dur % i.slot_minutes <> 0 then
    raise exception 'Please choose whole slots within the instrument hours.';
  end if;
  if dur / i.slot_minutes > i.max_consecutive then
    raise exception 'You can book at most % consecutive slots.', i.max_consecutive;
  end if;
  return new;
end $$;

drop trigger if exists bk_validate on public.bookings;
create trigger bk_validate before insert or update on public.bookings
  for each row execute function public.bk_validate();

-- 8) Starting data: the three instruments (edit or add more later in the admin panel) -----
insert into public.booking_instruments (name, sub, location, photo_url, slot_minutes, day_start, day_end, overnight, sort_order)
select * from (values
  ('ElectraSyn 2.0',            'Electrosynthesis, IKA',       'Hari Group lab', 'facilities/electrasyn.jpeg', 120,  510, 1230, true,  1),
  ('PhotoCube',                 'Photoreactor, ThalesNano',    'Hari Group lab', 'facilities/photocube.jpeg',  180,  540, 1260, false, 2),
  ('IKA RCT Screening System',  'Stirrer / reaction screening','Hari Group lab', 'facilities/rct.jpeg',         60,  540, 1020, false, 3)
) v(name, sub, location, photo_url, slot_minutes, day_start, day_end, overnight, sort_order)
where not exists (select 1 from public.booking_instruments);

-- 8b) Public list of bookable instrument names (names only) so facilities.html can show "Book" links
create or replace function public.booking_public_instruments()
returns table(name text) language sql stable security definer set search_path = public as $$
  select name from public.booking_instruments where active order by sort_order;
$$;
revoke all on function public.booking_public_instruments() from public;
grant execute on function public.booking_public_instruments() to anon, authenticated;

-- 9) FIRST ADMIN: replace the email and name, then run this line --------------------------
-- insert into public.booking_members (email, name, role) values ('YOUR_EMAIL@iisc.ac.in', 'Your Name', 'admin');

-- =====================================================================================
-- OPTIONAL but recommended when this Supabase project is used ONLY for booking:
-- refuse sign-ups from anyone who is not in booking_members. (Do NOT run it on a project
-- that other apps also use, because it would block their sign-ups too.)
-- =====================================================================================
-- create or replace function public.bk_block_unlisted_signup() returns trigger
-- language plpgsql security definer set search_path = public as $$
-- begin
--   if not exists (select 1 from public.booking_members where email = lower(new.email)) then
--     raise exception 'This email is not approved for booking.';
--   end if;
--   return new;
-- end $$;
-- drop trigger if exists bk_block_unlisted_signup on auth.users;
-- create trigger bk_block_unlisted_signup before insert on auth.users
--   for each row execute function public.bk_block_unlisted_signup();

-- =====================================================================================
-- AFTER RUNNING THIS FILE
--   1. Supabase > Authentication > Providers > Email: keep "Confirm email" ON and set a
--      minimum password length of 10.
--   2. Authentication > URL Configuration: add https://harigroup.orgchem.iisc.ac.in/booking.html
--      to the Redirect URLs (used by "Create Password" and "Forgot Password" emails).
--   3. Authentication > SMTP Settings: connect a mail service (for example Resend) so confirmation
--      and reset emails are not limited by Supabase's very low built-in email quota.
--   4. Put the project URL and anon key in js/booking-config.js.
--   5. Insert the first admin (section 9). Everyone else is added from the page: Admin panel > Members.
-- =====================================================================================
