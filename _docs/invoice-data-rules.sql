-- Invoice data rules (added after the 2026-11-28 audit). Run once in the SQL editor; safe to run again.
-- NOT VALID = checked for every new or changed row, existing rows are left as they are.
alter table public.invoice_items drop constraint if exists items_sane;
alter table public.invoice_items add constraint items_sane check (quantity > 0 and quantity <= 100000 and unit_price >= 0 and unit_price <= 100000000 and length(item_name) <= 200) not valid;
alter table public.invoices drop constraint if exists inv_sane;
alter table public.invoices add constraint inv_sane check (coalesce(total_price, 0) >= 0 and length(coalesce(vendor, '')) <= 120 and length(coalesce(invoice_number, '')) <= 60 and pg_column_size(comments) < 200000) not valid;

-- The same vendor + invoice number cannot be recorded twice (checked for NEW invoices; the app also checks in the browser).
create or replace function public.inv_no_dup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.invoices
             where lower(trim(vendor)) = lower(trim(new.vendor)) and lower(trim(invoice_number)) = lower(trim(new.invoice_number)) and id <> new.id) then
    raise exception 'Invoice % from % is already recorded.', new.invoice_number, new.vendor;
  end if;
  return new;
end $$;
revoke all on function public.inv_no_dup() from public, anon, authenticated;
drop trigger if exists inv_no_dup on public.invoices;
create trigger inv_no_dup before insert on public.invoices for each row execute function public.inv_no_dup();
