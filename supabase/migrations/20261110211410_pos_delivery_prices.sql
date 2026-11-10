-- Stock & POS: delivery prices by distance (motorbike).
--
-- The fee depends only on the road distance from the shop (lib/delivery.ts):
-- a base fee for the first few km, a rate per km up to a middle point, a lower
-- rate after it, rounded up; a flat fee for very close drops; no price beyond
-- the furthest distance (agreed on WhatsApp). Free delivery takes an amount
-- off for orders of at least a set amount. The numbers live on settings
-- (owner edits them in /pos/settings/delivery); the shop's position is the
-- start of every distance.
--
-- delivery_areas is the price list's areas, each with its road distance from
-- the shop. Anyone may read the areas in use (the website will show them at
-- checkout); shop users read all. Any shop user can add an area found on the
-- map at the till (pos_add_delivery_area); only the owner changes or hides one
-- (pos_update_delivery_area). Money in pesewas, distances in km to 0.1.

alter table public.settings
  add column delivery_base_fee integer not null default 2000 check (delivery_base_fee between 0 and 10000000),
  add column delivery_base_km numeric(5, 1) not null default 3 check (delivery_base_km between 0 and 999.9),
  add column delivery_mid_rate integer not null default 300 check (delivery_mid_rate between 0 and 10000000),
  add column delivery_mid_end_km numeric(5, 1) not null default 10 check (delivery_mid_end_km between 0 and 999.9),
  add column delivery_far_rate integer not null default 150 check (delivery_far_rate between 0 and 10000000),
  add column delivery_round_to integer not null default 500 check (delivery_round_to between 1 and 10000000),
  add column delivery_close_km numeric(5, 1) not null default 1 check (delivery_close_km between 0 and 999.9),
  add column delivery_close_fee integer not null default 1000 check (delivery_close_fee between 0 and 10000000),
  add column delivery_max_km numeric(5, 1) not null default 65 check (delivery_max_km between 0 and 999.9),
  add column delivery_free_from integer default 100000 check (delivery_free_from is null or delivery_free_from between 0 and 1000000000),
  add column delivery_free_off integer not null default 4000 check (delivery_free_off between 0 and 10000000),
  add column shop_lat double precision check (shop_lat between -90 and 90),
  add column shop_lng double precision check (shop_lng between -180 and 180);

-- The shop at Dansoman Sharp Curve (the owner's Google Maps pin).
update public.settings set shop_lat = 5.5674903, shop_lng = -0.2566589 where id = 1;

create table public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  km numeric(5, 1) not null check (km between 0 and 999.9),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create unique index delivery_areas_name_key on public.delivery_areas (lower(btrim(name)));
create index delivery_areas_created_by_idx on public.delivery_areas (created_by);

create trigger delivery_areas_set_updated_at
  before update on public.delivery_areas
  for each row execute function public.set_updated_at();

revoke all on public.delivery_areas from anon, authenticated;
grant select on public.delivery_areas to anon, authenticated;
alter table public.delivery_areas enable row level security;
create policy "Anyone can read areas in use; shop users read all" on public.delivery_areas for select to anon, authenticated
  using (is_active or (select private.is_member()));

-- Any shop user: add an area found on the map at the till. An area with the
-- same name is left as it is and its id returned.
create function public.pos_add_delivery_area(p_name text, p_km numeric, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not private.is_member() then
    raise exception 'Sign in again to add an area.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Give the area a name of up to 80 characters.' using errcode = '22023';
  end if;
  if p_km is null or p_km < 0 or p_km > 999.9 then
    raise exception 'Enter the distance in km, like 12.5.' using errcode = '22023';
  end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'That position on the map is not valid.' using errcode = '22023';
  end if;
  select id into v_id from public.delivery_areas where lower(btrim(name)) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;
  insert into public.delivery_areas (name, km, lat, lng)
  values (v_name, round(p_km, 1), p_lat, p_lng)
  on conflict ((lower(btrim(name)))) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.delivery_areas where lower(btrim(name)) = lower(v_name);
  end if;
  return v_id;
end;
$$;

-- Owner: rename an area, change its distance, or take it off the list.
create function public.pos_update_delivery_area(
  p_id uuid, p_name text, p_km numeric, p_is_active boolean
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
  if exists (select 1 from public.delivery_areas where lower(btrim(name)) = lower(v_name) and id <> p_id) then
    raise exception 'There is already an area called %.', v_name using errcode = '22023';
  end if;
  update public.delivery_areas
  set name = v_name, km = round(p_km, 1), is_active = coalesce(p_is_active, true)
  where id = p_id;
  if not found then
    raise exception 'This area no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.pos_add_delivery_area(text, numeric, double precision, double precision) from public, anon;
grant execute on function public.pos_add_delivery_area(text, numeric, double precision, double precision) to authenticated;
revoke execute on function public.pos_update_delivery_area(uuid, text, numeric, boolean) from public, anon;
grant execute on function public.pos_update_delivery_area(uuid, text, numeric, boolean) to authenticated;
