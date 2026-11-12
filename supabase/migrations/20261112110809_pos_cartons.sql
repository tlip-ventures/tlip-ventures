-- Stock & POS: cartons. Each product can say how many single items are in a
-- carton (product_variants.units_per_carton, on its stock entry in use).
-- Stock is still kept in single items; screens show it as cartons + singles,
-- and a stock count line can be typed as cartons + singles (the database
-- works out the total and keeps the two parts to show them again).

alter table public.product_variants
  add column units_per_carton integer check (units_per_carton is null or units_per_carton between 2 and 10000);

alter table public.stock_count_lines
  add column cartons integer check (cartons is null or cartons between 0 and 100000),
  add column singles integer check (singles is null or singles between 0 and 100000);

-- Products list and every stock screen: the carton size.
do $m$
declare
  v_def text := pg_get_viewdef('public.pos_stock_rows'::regclass);
  v_old text := 'AS total_on_hand
   FROM';
  v_new text := 'AS total_on_hand,
    v.units_per_carton
   FROM';
begin
  if strpos(v_def, v_old) = 0 then
    raise exception 'pos_stock_rows has changed: its last column was not found.';
  end if;
  execute 'create or replace view public.pos_stock_rows with (security_invoker = true) as ' || replace(v_def, v_old, v_new);
end
$m$;

-- Set (or clear, with null) how many single items are in a carton. Whoever
-- may count stock can set it, so it can be filled in during a count.
create function public.pos_set_carton_size(p_variant_id uuid, p_units integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  if p_units is not null and (p_units < 2 or p_units > 10000) then
    raise exception 'A carton holds 2 to 10,000 items.' using errcode = '22023';
  end if;
  update public.product_variants set units_per_carton = p_units where id = p_variant_id and not retired;
  if not found then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- A count line typed as cartons + singles: the total is cartons times the
-- product's carton size plus the singles. Both empty clears the line.
create function public.pos_save_count_line(p_count_id uuid, p_variant_id uuid, p_cartons integer, p_singles integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_size integer;
  v_total integer;
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  if (p_cartons is not null and (p_cartons < 0 or p_cartons > 100000)) or (p_singles is not null and (p_singles < 0 or p_singles > 100000)) then
    raise exception 'Enter how many cartons and single items (0 or more).' using errcode = '22023';
  end if;
  if p_cartons is null and p_singles is null then
    perform public.pos_save_count_line(p_count_id, p_variant_id, null::integer);
    return null;
  end if;
  select units_per_carton into v_size from public.product_variants where id = p_variant_id and not retired;
  if not found then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;
  if coalesce(p_cartons, 0) > 0 and v_size is null then
    raise exception 'Set how many items are in a carton first.' using errcode = '22023';
  end if;
  v_total := coalesce(p_cartons, 0) * coalesce(v_size, 0) + coalesce(p_singles, 0);
  if v_total > 100000 then
    raise exception 'That is more than 100,000 items.' using errcode = '22023';
  end if;
  perform public.pos_save_count_line(p_count_id, p_variant_id, v_total);
  update public.stock_count_lines
  set cartons = case when coalesce(p_cartons, 0) > 0 then p_cartons end, singles = coalesce(p_singles, 0)
  where count_id = p_count_id and variant_id = p_variant_id;
  return v_total;
end;
$$;

revoke execute on function
  public.pos_set_carton_size(uuid, integer),
  public.pos_save_count_line(uuid, uuid, integer, integer)
from public, anon;
grant execute on function
  public.pos_set_carton_size(uuid, integer),
  public.pos_save_count_line(uuid, uuid, integer, integer)
to authenticated;
