-- Stock & POS, phase 1: app users (owner and staff), stock per variant kept as
-- a ledger of movements, stock counts and cost prices.
--
-- A variant's stock on the shelf is the sum of its stock_movements, never a
-- number edited by hand. stock_levels caches that sum and only the movement
-- trigger writes it. A movement may never take the shelf below zero, except an
-- 'opening' figure imported from the old system (those show "Recount").
--
-- Nothing here changes what shop visitors see: products.is_active and
-- product_variants.in_stock still drive the website until the website sync.

-- ---------------------------------------------------------------------------
-- App users: the existing admins table, with staff permissions
-- ---------------------------------------------------------------------------

alter table public.admins
  add column display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  add column is_active boolean not null default true,
  -- The owner can always do both; these switch them on or off for staff.
  add column can_give_discounts boolean not null default true,
  add column can_adjust_stock boolean not null default false,
  add column created_at timestamptz not null default now();

-- All are SECURITY DEFINER so they can read admins whatever the caller's RLS.

-- Owner only (it used to be anyone in admins). Every existing policy that calls
-- is_admin() — catalogue writes, orders, settings, banners — stays owner-only.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid()) and role = 'owner' and is_active
  );
$$;

create function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

-- Owner or active staff.
create function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = (select auth.uid()) and is_active
  );
$$;

create function private.can_adjust_stock()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid()) and is_active and (role = 'owner' or can_adjust_stock)
  );
$$;

create function private.can_give_discounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid()) and is_active and (role = 'owner' or can_give_discounts)
  );
$$;

revoke execute on function private.is_owner(), private.is_member(), private.can_adjust_stock(), private.can_give_discounts()
  from public;
grant execute on function private.is_owner(), private.is_member(), private.can_adjust_stock(), private.can_give_discounts()
  to anon, authenticated, service_role;

-- Staff see hidden products too (they sell things that are not on the website).
-- Variants, images and category links follow, as their policies check the product.
alter policy "Anyone can read active products; admins read all" on public.products
  using (is_active or (select private.is_member()));
alter policy "Anyone can read active products; admins read all" on public.products
  rename to "Anyone can read active products; shop users read all";

-- ---------------------------------------------------------------------------
-- Catalogue additions
-- ---------------------------------------------------------------------------

alter table public.product_variants
  -- What a barcode scanner types. sku stays the shop's own code (RDCM, NBP10…).
  add column barcode text unique check (barcode is null or barcode ~ '^\S{1,64}$'),
  -- "Running low" at or below this many on the shelf.
  add column reorder_level integer not null default 2 check (reorder_level between 0 and 100000);

-- What the shop pays for one, for profit and stock value. Owner only: never on
-- products or product_variants, which the public can read.
create table public.variant_costs (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  cost_price integer not null check (cost_price >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create trigger variant_costs_set_updated_at
  before update on public.variant_costs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Stock ledger
-- ---------------------------------------------------------------------------

create type public.stock_movement_kind as enum (
  'opening',       -- figure imported from the old system; may be below zero
  'sale',
  'sale_void',
  'purchase',
  'purchase_void',
  'return',
  'adjustment',    -- by hand with a reason: damaged, found, gift…
  'count'          -- recount or stock count: brings the shelf to the counted number
);

create type public.stock_count_status as enum ('open', 'finished', 'cancelled');

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  status public.stock_count_status not null default 'open',
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_by uuid references auth.users (id) on delete set null,
  finished_at timestamptz
);

-- One count in progress at a time, so two people don't count the same shelf twice.
create unique index stock_counts_one_open_idx on public.stock_counts ((true)) where status = 'open';
create index stock_counts_created_idx on public.stock_counts (created_at desc);

-- expected is the shelf figure when the line was saved, so sales made while the
-- count is still open are not undone when it is finished.
create table public.stock_count_lines (
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  expected integer not null,
  counted integer not null check (counted between 0 and 100000),
  counted_by uuid default auth.uid() references auth.users (id) on delete set null,
  counted_at timestamptz not null default now(),
  primary key (count_id, variant_id)
);

create table public.stock_levels (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  on_hand integer not null default 0,
  updated_at timestamptz not null default now()
);

create index stock_levels_on_hand_idx on public.stock_levels (on_hand);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  -- restrict: a variant with stock history can't be deleted (hide it instead).
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  qty_change integer not null check (qty_change <> 0 and qty_change between -100000 and 100000),
  kind public.stock_movement_kind not null,
  reason text check (reason is null or char_length(reason) <= 300),
  -- Shelf figure after this movement; set by the trigger.
  balance_after integer not null,
  count_id uuid references public.stock_counts (id) on delete restrict,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_reason_required
    check (kind not in ('adjustment', 'count') or char_length(btrim(reason)) > 0)
);

create index stock_movements_variant_created_idx on public.stock_movements (variant_id, created_at desc, id desc);
create index stock_movements_created_idx on public.stock_movements (created_at desc);
create index stock_movements_count_idx on public.stock_movements (count_id) where count_id is not null;

-- Every variant has a stock_levels row (0 until stock is recorded).
create function private.create_stock_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger product_variants_create_stock_level
  after insert on public.product_variants
  for each row execute function private.create_stock_level();

insert into public.stock_levels (variant_id)
select id from public.product_variants
on conflict do nothing;

-- Applies a movement to stock_levels, under a row lock so two tills selling
-- the last one at the same moment can't both succeed.
-- Error TV001 = "would go below zero"; the app shows its message as is.
create function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
begin
  select on_hand into v_on_hand
  from public.stock_levels
  where variant_id = new.variant_id
  for update;

  if not found then
    insert into public.stock_levels (variant_id) values (new.variant_id) on conflict do nothing;
    select on_hand into v_on_hand from public.stock_levels where variant_id = new.variant_id for update;
  end if;

  if new.qty_change < 0 and v_on_hand + new.qty_change < 0 and new.kind <> 'opening' then
    raise exception 'Only % left on the shelf.', greatest(v_on_hand, 0)
      using errcode = 'TV001', detail = new.variant_id::text;
  end if;

  new.balance_after := v_on_hand + new.qty_change;
  update public.stock_levels
  set on_hand = new.balance_after, updated_at = now()
  where variant_id = new.variant_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  before insert on public.stock_movements
  for each row execute function private.apply_stock_movement();

-- The ledger is append-only: a mistake is corrected with a new movement.
create function private.forbid_stock_movement_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Stock movements are never changed or deleted. Record a new movement instead.'
    using errcode = '42501';
end;
$$;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function private.forbid_stock_movement_change();

-- stock_levels is only ever written by the triggers above (trigger depth 2),
-- never directly, not even with the secret key.
create function private.guard_stock_levels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 2 and (tg_op = 'UPDATE' or new.on_hand <> 0) then
    raise exception 'Stock levels come from stock movements and cannot be set directly.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger stock_levels_guard
  before insert or update on public.stock_levels
  for each row execute function private.guard_stock_levels();

-- Variants whose cached level doesn't match the sum of their movements. Should
-- always be empty; for checks and tests.
create function private.stock_drift()
returns table (variant_id uuid, on_hand integer, movements_total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.variant_id, s.on_hand, coalesce(m.total, 0)
  from public.stock_levels s
  left join (
    select variant_id, sum(qty_change) as total from public.stock_movements group by variant_id
  ) m on m.variant_id = s.variant_id
  where s.on_hand <> coalesce(m.total, 0);
$$;

revoke execute on function private.create_stock_level(), private.apply_stock_movement(),
  private.forbid_stock_movement_change(), private.guard_stock_levels(), private.stock_drift()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stock list for the app: one row per variant (security_invoker, so RLS applies)
-- ---------------------------------------------------------------------------

create view public.pos_stock_rows
with (security_invoker = true)
as
select
  v.id as variant_id,
  p.id as product_id,
  p.name as product_name,
  nullif(concat_ws(' / ', v.option1_value, v.option2_value), '') as option_label,
  v.sku,
  v.barcode,
  coalesce(v.price_override, p.price) as price,
  p.is_active as on_website,
  v.reorder_level,
  coalesce(s.on_hand, 0) as on_hand,
  case
    when coalesce(s.on_hand, 0) < 0 then 'recount'
    when coalesce(s.on_hand, 0) = 0 then 'out'
    when s.on_hand <= v.reorder_level then 'low'
    else 'ok'
  end as stock_state,
  -- Needs attention first: recount, out, low, then in stock.
  case
    when coalesce(s.on_hand, 0) < 0 then 0
    when coalesce(s.on_hand, 0) = 0 then 1
    when s.on_hand <= v.reorder_level then 2
    else 3
  end as state_rank,
  cat.category_id,
  cat.category_name,
  cat.top_category_id,
  cat.top_category_name,
  img.url as image_url,
  p.updated_at
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.stock_levels s on s.variant_id = v.id
left join lateral (
  select
    c.id as category_id,
    c.name as category_name,
    coalesce(parent.id, c.id) as top_category_id,
    coalesce(parent.name, c.name) as top_category_name
  from public.product_categories pc
  join public.categories c on c.id = pc.category_id
  left join public.categories parent on parent.id = c.parent_id
  where pc.product_id = p.id
  order by c.parent_id is null, coalesce(parent.sort_order, c.sort_order), c.sort_order, c.name
  limit 1
) cat on true
left join lateral (
  select i.url from public.product_images i
  where i.product_id = p.id
  order by i.sort_order
  limit 1
) img on true;

-- Summary cards on Products and stock. value (at cost) only for the owner.
create function public.pos_stock_summary()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'products', (select count(*) from public.products),
    'low', count(*) filter (where r.stock_state in ('low', 'out')),
    'recount', count(*) filter (where r.stock_state = 'recount'),
    'value', case when (select private.is_owner()) then (
      select coalesce(sum(greatest(s.on_hand, 0)::bigint * c.cost_price), 0)
      from public.stock_levels s
      join public.variant_costs c on c.variant_id = s.variant_id
    ) end
  )
  from public.pos_stock_rows r;
$$;

-- ---------------------------------------------------------------------------
-- Stock changes. SECURITY DEFINER (nobody may insert movements directly);
-- each checks the caller's permission first. auth.uid() is still the caller,
-- so created_by records who did it.
-- ---------------------------------------------------------------------------

-- Recount one variant: records a 'count' movement that brings the shelf to the
-- counted number. Returns the change (0 when it already matched).
create function public.pos_recount(p_variant_id uuid, p_counted integer, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
  v_change integer;
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 or p_counted > 100000 then
    raise exception 'Enter how many are on the shelf (0 or more).' using errcode = '22023';
  end if;

  select on_hand into v_on_hand from public.stock_levels where variant_id = p_variant_id for update;
  if not found then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;

  v_change := p_counted - v_on_hand;
  if v_change <> 0 then
    insert into public.stock_movements (variant_id, qty_change, kind, reason)
    values (p_variant_id, v_change, 'count', coalesce(nullif(btrim(p_reason), ''), 'Recount'));
  end if;
  return v_change;
end;
$$;

-- Adds or takes away stock by hand, with a reason (damaged, found, gift…).
create function public.pos_adjust_stock(p_variant_id uuid, p_change integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  if p_change is null or p_change = 0 or abs(p_change) > 100000 then
    raise exception 'Enter how many to add or take away.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why the stock is changing.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant_id) then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;

  insert into public.stock_movements (variant_id, qty_change, kind, reason)
  values (p_variant_id, p_change, 'adjustment', btrim(p_reason))
  returning balance_after into v_balance;
  return v_balance;
end;
$$;

create function public.pos_start_count(p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  if exists (select 1 from public.stock_counts where status = 'open') then
    raise exception 'A stock count is already in progress. Finish or cancel it first.' using errcode = '23505';
  end if;
  insert into public.stock_counts (note) values (nullif(btrim(p_note), '')) returning id into v_id;
  return v_id;
end;
$$;

-- Saves (or, with p_counted null, clears) one line of an open count.
create function public.pos_save_count_line(p_count_id uuid, p_variant_id uuid, p_counted integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  perform 1 from public.stock_counts where id = p_count_id and status = 'open' for update;
  if not found then
    raise exception 'This stock count is already finished.' using errcode = '22023';
  end if;

  if p_counted is null then
    delete from public.stock_count_lines where count_id = p_count_id and variant_id = p_variant_id;
    return;
  end if;
  if p_counted < 0 or p_counted > 100000 then
    raise exception 'Enter how many are on the shelf (0 or more).' using errcode = '22023';
  end if;

  insert into public.stock_count_lines (count_id, variant_id, expected, counted)
  select p_count_id, s.variant_id, s.on_hand, p_counted
  from public.stock_levels s
  where s.variant_id = p_variant_id
  on conflict (count_id, variant_id) do update
    set expected = excluded.expected,
        counted = excluded.counted,
        counted_by = auth.uid(),
        counted_at = now();
  if not found then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- Finishes a count: each line where counted differs from expected becomes a
-- 'count' movement of (counted - expected). Returns how many lines changed stock.
create function public.pos_finish_count(p_count_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_line record;
  v_changed integer := 0;
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  select note into v_note from public.stock_counts where id = p_count_id and status = 'open' for update;
  if not found then
    raise exception 'This stock count is already finished.' using errcode = '22023';
  end if;

  -- Variant order, so concurrent sales lock rows in the same order.
  for v_line in
    select l.variant_id, l.counted - l.expected as change, p.name
    from public.stock_count_lines l
    join public.product_variants v on v.id = l.variant_id
    join public.products p on p.id = v.product_id
    where l.count_id = p_count_id and l.counted <> l.expected
    order by l.variant_id
  loop
    begin
      insert into public.stock_movements (variant_id, qty_change, kind, reason, count_id)
      values (v_line.variant_id, v_line.change, 'count', coalesce('Stock count: ' || v_note, 'Stock count'), p_count_id);
    exception when sqlstate 'TV001' then
      raise exception '% sold since it was counted. Count it again, then finish.', v_line.name
        using errcode = 'TV001';
    end;
    v_changed := v_changed + 1;
  end loop;

  update public.stock_counts
  set status = 'finished', finished_by = auth.uid(), finished_at = now()
  where id = p_count_id;
  return v_changed;
end;
$$;

create function public.pos_cancel_count(p_count_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_adjust_stock() then
    raise exception 'You are not allowed to count or adjust stock.' using errcode = '42501';
  end if;
  update public.stock_counts
  set status = 'cancelled', finished_by = auth.uid(), finished_at = now()
  where id = p_count_id and status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- Products from the app (owner). SECURITY INVOKER: RLS checks every write.
-- p: {"id": uuid|null, "name", "slug" (new only), "price", "is_active",
--     "category_id" (new only), "variants": [{"id" (existing only), "sku",
--     "barcode", "reorder_level", "price_override", "cost_price"}]}
-- A new product has one variant without options; options are added in the
-- website editor. Categories of an existing product are kept as they are.
-- ---------------------------------------------------------------------------

create function public.pos_save_product(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_variant jsonb;
  v_variant_id uuid;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can add or edit products.' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'variants') is distinct from 'array' or jsonb_array_length(p -> 'variants') = 0 then
    raise exception 'A product needs at least one stock entry.' using errcode = '22023';
  end if;

  if v_id is null then
    if jsonb_array_length(p -> 'variants') <> 1 then
      raise exception 'A new product starts with a single stock entry.' using errcode = '22023';
    end if;
    insert into public.products (name, slug, price, is_active)
    values (btrim(p ->> 'name'), p ->> 'slug', (p ->> 'price')::integer, (p ->> 'is_active')::boolean)
    returning id into v_id;
    if p ->> 'category_id' is not null then
      insert into public.product_categories (product_id, category_id) values (v_id, (p ->> 'category_id')::uuid);
    end if;
    insert into public.product_variants (product_id) values (v_id) returning id into v_variant_id;
    p := jsonb_set(p, '{variants,0,id}', to_jsonb(v_variant_id));
  else
    update public.products
    set name = btrim(p ->> 'name'), price = (p ->> 'price')::integer, is_active = (p ->> 'is_active')::boolean
    where id = v_id;
    if not found then
      raise exception 'This product no longer exists.' using errcode = 'P0002';
    end if;
  end if;

  for v_variant in select * from jsonb_array_elements(p -> 'variants')
  loop
    update public.product_variants
    set sku = nullif(btrim(v_variant ->> 'sku'), ''),
        barcode = nullif(btrim(v_variant ->> 'barcode'), ''),
        reorder_level = (v_variant ->> 'reorder_level')::integer,
        price_override = (v_variant ->> 'price_override')::integer
    where id = (v_variant ->> 'id')::uuid and product_id = v_id;
    if not found then
      raise exception 'This option no longer exists. Reload the page.' using errcode = 'P0002';
    end if;

    if v_variant ->> 'cost_price' is null then
      delete from public.variant_costs where variant_id = (v_variant ->> 'id')::uuid;
    else
      insert into public.variant_costs (variant_id, cost_price)
      values ((v_variant ->> 'id')::uuid, (v_variant ->> 'cost_price')::integer)
      on conflict (variant_id) do update
        set cost_price = excluded.cost_price, updated_by = auth.uid()
        where public.variant_costs.cost_price is distinct from excluded.cost_price;
    end if;
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- People: names for "who did it", and the owner's user management.
-- ---------------------------------------------------------------------------

-- Names and roles of everyone who uses the app (no emails), for members.
create function public.pos_people()
returns table (user_id uuid, display_name text, role text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.display_name, a.role, a.is_active
  from public.admins a
  where (select private.is_member());
$$;

-- Everyone with their email and permissions, for the owner's Settings page.
create function public.pos_list_users()
returns table (
  user_id uuid, email text, display_name text, role text, is_active boolean,
  can_give_discounts boolean, can_adjust_stock boolean, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can manage people.' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, a.display_name, a.role, a.is_active,
           a.can_give_discounts, a.can_adjust_stock, a.created_at, u.last_sign_in_at
    from public.admins a
    join auth.users u on u.id = a.user_id
    order by a.role = 'owner' desc, a.is_active desc, a.created_at;
end;
$$;

-- The owner changes a person's name and staff permissions. The owner can't
-- switch themself off or change their own role.
create function public.pos_update_user(
  p_user_id uuid,
  p_display_name text,
  p_is_active boolean,
  p_can_give_discounts boolean,
  p_can_adjust_stock boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can manage people.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_is_active then
    raise exception 'You cannot switch off your own account.' using errcode = '22023';
  end if;
  update public.admins
  set display_name = nullif(btrim(p_display_name), ''),
      is_active = p_is_active,
      can_give_discounts = p_can_give_discounts,
      can_adjust_stock = p_can_adjust_stock
  where user_id = p_user_id;
  if not found then
    raise exception 'This person no longer has access.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.variant_costs, public.stock_counts, public.stock_count_lines,
  public.stock_levels, public.stock_movements, public.pos_stock_rows
from anon, authenticated;

grant select on public.stock_counts, public.stock_count_lines, public.stock_levels,
  public.stock_movements, public.pos_stock_rows
to authenticated;
grant select, insert, update, delete on public.variant_costs to authenticated;

alter table public.variant_costs enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;

create policy "Owner reads costs" on public.variant_costs for select to authenticated
  using ((select private.is_owner()));
create policy "Owner adds costs" on public.variant_costs for insert to authenticated
  with check ((select private.is_owner()));
create policy "Owner edits costs" on public.variant_costs for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "Owner deletes costs" on public.variant_costs for delete to authenticated
  using ((select private.is_owner()));

create policy "Shop users read stock levels" on public.stock_levels for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read stock movements" on public.stock_movements for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read stock counts" on public.stock_counts for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read stock count lines" on public.stock_count_lines for select to authenticated
  using ((select private.is_member()));

revoke execute on function
  public.pos_stock_summary(),
  public.pos_recount(uuid, integer, text),
  public.pos_adjust_stock(uuid, integer, text),
  public.pos_start_count(text),
  public.pos_save_count_line(uuid, uuid, integer),
  public.pos_finish_count(uuid),
  public.pos_cancel_count(uuid),
  public.pos_save_product(jsonb),
  public.pos_people(),
  public.pos_list_users(),
  public.pos_update_user(uuid, text, boolean, boolean, boolean)
from public, anon, authenticated;

grant execute on function
  public.pos_stock_summary(),
  public.pos_recount(uuid, integer, text),
  public.pos_adjust_stock(uuid, integer, text),
  public.pos_start_count(text),
  public.pos_save_count_line(uuid, uuid, integer),
  public.pos_finish_count(uuid),
  public.pos_cancel_count(uuid),
  public.pos_save_product(jsonb),
  public.pos_people(),
  public.pos_list_users(),
  public.pos_update_user(uuid, text, boolean, boolean, boolean)
to authenticated;
