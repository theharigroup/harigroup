-- Sends booking / cancellation emails to the member concerned (and nobody else).
-- Run AFTER deploying docs/booking-email-function.ts. Replace the two placeholders below.
create extension if not exists pg_net with schema extensions;

create or replace function public.bk_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.kind = 'booking' then
    perform net.http_post(
      url     := 'https://crbbfatqtfyvdqeqairm.supabase.co/functions/v1/booking-email',
      headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret','REPLACE_WITH_WEBHOOK_SECRET'),
      body    := jsonb_build_object('type', tg_op, 'record', to_jsonb(new),
                   'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end));
  end if;
  return new;
end $$;

drop trigger if exists bk_notify on public.bookings;
create trigger bk_notify after insert or update on public.bookings
  for each row execute function public.bk_notify();
