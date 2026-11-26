-- Update for an existing booking project: the member who booked (and admins) may cancel even after the slot has started.
do $$
declare d text;
begin
  select pg_get_functiondef('public.bk_validate()'::regprocedure) into d;
  d := replace(d, E'if old.kind = ''booking'' and old.starts_at <= now() and not public.bk_is_admin() then\n        raise exception ''A booking that has already started cannot be cancelled.'';\n      end if;', 'null;');
  if d like '%already started cannot be cancelled%' then raise exception 'pattern not found'; end if;
  execute d;
end $$;

-- Lets the team-sync GitHub Action (service key) add new members and their access.
grant select, insert, update on public.booking_members, public.booking_access, public.booking_instruments to service_role;
