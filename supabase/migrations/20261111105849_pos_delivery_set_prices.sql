-- Stock & POS: set prices for delivery areas, and delivery discounts by order.
--
-- delivery_areas.fixed_fee: the owner can give an area its own price (pesewas)
-- that the till uses instead of the distance formula (null: the formula).
--
-- settings.delivery_discounts: discount levels by order size, as
-- [{"from": <pesewas>, "off": <pesewas or null>}], at most 5. An order whose
-- items (after any discount) reach "from" gets "off" taken off the delivery
-- fee, or free delivery when "off" is null; the highest level reached counts.
-- It replaces delivery_free_from / delivery_free_off (copied across here and
-- no longer read; they stay until the till that reads them is replaced).

alter table public.delivery_areas
  add column fixed_fee integer check (fixed_fee is null or fixed_fee between 0 and 10000000);

alter table public.settings
  add column delivery_discounts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(delivery_discounts) = 'array' and jsonb_array_length(delivery_discounts) <= 5);

update public.settings
set delivery_discounts = case
  when delivery_free_from is null or delivery_free_off <= 0 then '[]'::jsonb
  else jsonb_build_array(jsonb_build_object('from', delivery_free_from, 'off', delivery_free_off))
end
where id = 1;

comment on column public.settings.delivery_free_from is 'Superseded by delivery_discounts.';
comment on column public.settings.delivery_free_off is 'Superseded by delivery_discounts.';

-- Owner: rename an area, change its distance or set price, or take it off the list.
-- (The four-argument version, without the set price, stays for the till until it is replaced.)
create function public.pos_update_delivery_area(
  p_id uuid, p_name text, p_km numeric, p_is_active boolean, p_fixed_fee integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change delivery areas.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Give the area a name of up to 80 characters.' using errcode = '22023';
  end if;
  if p_km is null or p_km < 0 or p_km > 999.9 then
    raise exception 'Enter the distance in km, like 12.5.' using errcode = '22023';
  end if;
  if p_fixed_fee is not null and (p_fixed_fee < 0 or p_fixed_fee > 10000000) then
    raise exception 'Enter the price like 50, or leave it empty to use the formula.' using errcode = '22023';
  end if;
  if exists (select 1 from public.delivery_areas where lower(btrim(name)) = lower(v_name) and id <> p_id) then
    raise exception 'There is already an area called %.', v_name using errcode = '22023';
  end if;
  update public.delivery_areas
  set name = v_name, km = round(p_km, 1), is_active = coalesce(p_is_active, true), fixed_fee = p_fixed_fee
  where id = p_id;
  if not found then
    raise exception 'This area no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.pos_update_delivery_area(uuid, text, numeric, boolean, integer) from public, anon;
grant execute on function public.pos_update_delivery_area(uuid, text, numeric, boolean, integer) to authenticated;
