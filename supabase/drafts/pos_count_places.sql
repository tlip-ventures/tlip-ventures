-- Stock & POS: stock counts in any place (the shop or the warehouse).
--
-- A count belongs to one place (stock_counts.location_id; earlier ones were
-- the shop's). Each place can have one count open at a time. Lines compare
-- with that place's number, and finishing corrects that place only.

alter table public.stock_counts add column location_id smallint not null default 1 references public.locations (id);

drop index public.stock_counts_one_open_idx;
create unique index stock_counts_one_open_per_place_idx on public.stock_counts (location_id) where status = 'open';

-- Start a count of one place.
create function public.pos_start_count(p_note text, p_location smallint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_place text;
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  select lower(name) into v_place from public.locations where id = p_location;
  if v_place is null then
    raise exception 'Choose the place to count.' using errcode = '22023';
  end if;
  if exists (select 1 from public.stock_counts where status = 'open' and location_id = p_location) then
    raise exception 'A count of the % is already in progress. Finish or cancel it first.', v_place using errcode = '23505';
  end if;
  insert into public.stock_counts (note, location_id) values (nullif(btrim(p_note), ''), p_location) returning id into v_id;
  return v_id;
end;
$$;

-- The earlier version counts the shop.
create or replace function public.pos_start_count(p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.pos_start_count(p_note, private.shop_location());
end;
$$;

-- Saving a line: what the app says is that place's number (0 when nothing
-- has been there yet). Edits the live function in place.
do $m$
declare
  v_def text := replace(pg_get_functiondef('public.pos_save_count_line(uuid, uuid, integer)'::regprocedure), E'\r\n', E'\n');
  v_pairs text[][] := array[
    array[E'AS $function$\nbegin\n', E'AS $function$\ndeclare\n  v_place smallint;\nbegin\n'],
    array['  perform 1 from public.stock_counts where id = p_count_id and status = ''open'' for update;',
          '  select location_id into v_place from public.stock_counts where id = p_count_id and status = ''open'' for update;'],
    array['  select p_count_id, s.variant_id, s.on_hand, p_counted
  from public.stock_levels s
  join public.product_variants v on v.id = s.variant_id and not v.retired
  where s.variant_id = p_variant_id', '  select p_count_id, v.id, coalesce(l.on_hand, 0), p_counted
  from public.product_variants v
  left join public.stock_place_levels l on l.variant_id = v.id and l.location_id = v_place
  where v.id = p_variant_id and not v.retired']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if strpos(v_def, v_pairs[i][1]) = 0 then
      raise exception 'pos_save_count_line has changed: part % was not found.', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$m$;

-- Finishing corrects the count's own place.
do $m$
declare
  v_def text := replace(pg_get_functiondef('public.pos_finish_count(uuid)'::regprocedure), E'\r\n', E'\n');
  v_pairs text[][] := array[
    array[E'  v_changed integer := 0;\n', E'  v_changed integer := 0;\n  v_place smallint;\n'],
    array['  select note into v_note from public.stock_counts where id = p_count_id and status = ''open'' for update;',
          '  select note, location_id into v_note, v_place from public.stock_counts where id = p_count_id and status = ''open'' for update;'],
    array['      insert into public.stock_movements (variant_id, qty_change, kind, reason, count_id)
      values (v_line.variant_id, v_line.change, ''count'', coalesce(''Stock count: '' || v_note, ''Stock count''), p_count_id);',
          '      insert into public.stock_movements (variant_id, qty_change, kind, reason, count_id, location_id)
      values (v_line.variant_id, v_line.change, ''count'', coalesce(''Stock count: '' || v_note, ''Stock count''), p_count_id, v_place);'],
    array['raise exception ''% sold since it was counted. Count it again, then finish.''',
          'raise exception ''% was sold or moved since it was counted. Count it again, then finish.''']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if strpos(v_def, v_pairs[i][1]) = 0 then
      raise exception 'pos_finish_count has changed: part % was not found.', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$m$;

revoke execute on function public.pos_start_count(text, smallint) from public, anon;
grant execute on function public.pos_start_count(text, smallint) to authenticated;
