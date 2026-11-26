-- Update for an existing booking project: the member who booked (and admins) may cancel even after the slot has started.
do $$
declare d text;
begin
  select pg_get_functiondef('public.bk_validate()'::regprocedure) into d;
  d := replace(d, E'if old.kind = ''booking'' and old.starts_at <= now() and not public.bk_is_admin() then\n        raise exception ''A booking that has already started cannot be cancelled.'';\n      end if;', 'null;');
  if d like '%already started cannot be cancelled%' then raise exception 'pattern not found'; end if;
  execute d;
end $$;
