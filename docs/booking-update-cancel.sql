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

-- Multiple-slot booking: allow up to 12 slots in a row (a courtesy reminder is shown in the page beyond two).
alter table public.booking_instruments alter column max_consecutive set default 12;
update public.booking_instruments set max_consecutive = 12;

-- Per-instrument booking choices (for example PhotoCube light source and vial size).
alter table public.booking_instruments add column if not exists options jsonb;
alter table public.bookings add column if not exists choices jsonb check (choices is null or length(choices::text) <= 600);

do $$
declare d text;
begin
  select pg_get_functiondef('public.bk_validate()'::regprocedure) into d;
  if d not like '%Please choose every option%' then
    d := replace(d, 'if new.kind = ''maintenance'' then return new; end if;',
      'if new.kind = ''maintenance'' then return new; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(i.options, ''[]''::jsonb)) o
             where coalesce(((coalesce(new.choices, ''{}''::jsonb) ->> (o ->> ''label'')) = any (array(select jsonb_array_elements_text(o -> ''choices'')))), false) = false) then
    raise exception ''Please choose every option for this instrument.'';
  end if;');
    if d not like '%Please choose every option%' then raise exception 'pattern not found'; end if;
    execute d;
  end if;
end $$;

update public.booking_instruments set options = '[{"label":"Light Source","choices":["UV (365 nm)","Violet (395 nm)","Blue (457 nm)","Cyan (500 nm)","Green (523 nm)","Amber (595 nm)","Red (623 nm)","White"]},{"label":"Vial Size","choices":["4 mL","30 mL"]}]'::jsonb
where name = 'PhotoCube';
