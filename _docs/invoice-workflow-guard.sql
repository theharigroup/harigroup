-- Invoice workflow guard (added after the 2026-11-28 audit). Run once in the SQL editor; safe to run again.
-- (Bookings are already protected: the existing bk_validate trigger only lets a booking be cancelled, never edited.)
-- Row rules (RLS) say WHO may touch a table. These triggers say WHICH CHANGES each role may make, so the
-- workflow cannot be skipped by calling the database directly. SQL editor / service role (no signed-in user) is not limited.

-- 1) Invoices: who may move an invoice from one status to the next --------------------------------------
create or replace function public.inv_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := public.staff_role();
  mgr boolean := r in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver');
  pst text;
begin
  if auth.uid() is null or r = 'Administrator' then return coalesce(new, old); end if;

  if tg_table_name = 'invoices' then
    if tg_op = 'INSERT' then
      if new.status <> 'SUBMITTED' then raise exception 'A new invoice must start as SUBMITTED.'; end if;
      return new;
    end if;
    -- UPDATE
    if (to_jsonb(new) - 'comments') = (to_jsonb(old) - 'comments') then return new; end if;   -- comment only: any staff
    if new.status = old.status then
      if old.status in ('SUBMITTED','REJECTED') and (mgr or r = 'Lab Accountant') then return new; end if;
      if old.status not in ('SUBMITTED','REJECTED') and r = 'Lab Accountant' then return new; end if;
    elsif r = 'Lab Accountant' and ((old.status = 'SUBMITTED' and new.status in ('ACCOUNTANT_RECEIVED','REJECTED'))
                                 or (old.status = 'ACCOUNTANT_RECEIVED' and new.status = 'OFFICE_RECEIVED')) then
      return new;
    elsif r = 'Office Staff' and old.status = 'OFFICE_RECEIVED' and new.status = 'COMPLETED' then
      return new;
    elsif mgr and old.status = 'REJECTED' and new.status = 'SUBMITTED' then
      return new;
    end if;
    raise exception 'Your role cannot make this change at this step.';
  end if;

  -- invoice_items: managers only while the invoice is still with them; the accountant any time
  select status into pst from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if r = 'Lab Accountant' then return coalesce(new, old); end if;
  if mgr and (pst is null or pst in ('SUBMITTED','REJECTED')) then return coalesce(new, old); end if;
  raise exception 'These invoice lines can no longer be changed by your role.';
end $$;
revoke all on function public.inv_guard() from public, anon, authenticated;

drop trigger if exists inv_guard on public.invoices;
create trigger inv_guard before insert or update on public.invoices for each row execute function public.inv_guard();
drop trigger if exists inv_items_guard on public.invoice_items;
create trigger inv_items_guard before insert or update or delete on public.invoice_items for each row execute function public.inv_guard();
