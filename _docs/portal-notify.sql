-- E-mail triggers for BOTH portals (run in the invoice_management Supabase project SQL editor).
-- 1) Deploy the Edge Function "portal-notify" (Verify JWT OFF) and set its secrets first.
-- 2) Replace REPLACE_WITH_WEBHOOK_SECRET below with the same long random text you set as WEBHOOK_SECRET.
-- Mail is sent in the background (pg_net): if Gmail is down the booking / invoice is still saved.
create extension if not exists pg_net with schema extensions;

create or replace function public.portal_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare k text := tg_argv[0];
begin
  if (k = 'booking' and to_jsonb(new) ->> 'kind' = 'booking') or k = 'invoice' then
    perform net.http_post(
      url     := 'https://kknmrxopxnhirntmnwhb.supabase.co/functions/v1/portal-notify',
      headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret','REPLACE_WITH_WEBHOOK_SECRET'),
      body    := jsonb_build_object('kind', k, 'type', tg_op, 'record', to_jsonb(new),
                   'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end));
  end if;
  return new;
end $$;

drop trigger if exists bk_notify on public.bookings;
create trigger bk_notify after insert or update on public.bookings
  for each row execute function public.portal_notify('booking');

drop trigger if exists inv_notify on public.invoices;
create trigger inv_notify after insert or update on public.invoices
  for each row execute function public.portal_notify('invoice');
