-- POS phase 9: one stock number per product.
--
-- Colours and designs become choices on the product (products.option1_name is
-- the heading, e.g. "Colour"; products.choices the list). The customer or the
-- cashier picks one and it is copied onto the order, sale or invoice line, but
-- stock is counted for the product as a whole: every product has exactly one
-- stock entry in use. Earlier per-colour entries are kept, retired, only for
-- their history (stock movements are never changed or deleted).
--
-- Also: products listed twice are merged into one (the old web address
-- redirects), and the website stock sync is switched on.

-- 1. Choices, retired stock entries and redirects ---------------------------

alter table public.products add column choices text[] not null default '{}';
comment on column public.products.choices is
  'What the customer picks (colours, designs), under the heading option1_name. Not stocked separately.';
comment on column public.products.option1_name is
  'Heading for the choices, e.g. Colour. Null when the product has no choices.';

alter table public.product_variants add column retired boolean not null default false;
comment on column public.product_variants.retired is
  'An earlier stock entry (a former colour, or a merged duplicate), kept for its stock history. Never holds stock.';

create table public.product_redirects (
  old_slug text primary key check (old_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(old_slug) <= 80),
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.product_redirects is 'Web addresses of merged products, sent on to the product kept.';
create index product_redirects_product_idx on public.product_redirects (product_id);
alter table public.product_redirects enable row level security;
create policy "Anyone can read product redirects" on public.product_redirects for select using (true);
revoke all on public.product_redirects from anon, authenticated;
grant select on public.product_redirects to anon, authenticated;

-- Choices: trimmed, not empty, at most 60 characters, no repeats (ignoring case), at most 30.
create function private.valid_choices(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p), 0) <= 30
    and not exists (select 1 from unnest(p) c where c is null or c = '' or c <> btrim(c) or char_length(c) > 60)
    and (select count(distinct lower(c)) from unnest(p) c) = coalesce(cardinality(p), 0);
$$;

-- The stock entry in use for a product.
create function private.active_variant(p_product_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select v.id from public.product_variants v where v.product_id = p_product_id and not v.retired limit 1;
$$;

-- The product's own spelling of a choice (ignoring case and spaces), null for
-- none. Refuses a choice the product doesn't have.
create function private.pick_choice(p_variant_id uuid, p_value text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text;
  v_heading text;
  v_choices text[];
  v_pick text;
begin
  if nullif(btrim(p_value), '') is null then
    return null;
  end if;
  select p.name, p.option1_name, p.choices into v_name, v_heading, v_choices
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = p_variant_id;
  if not found then
    return null;
  end if;
  select c into v_pick from unnest(v_choices) c where lower(c) = lower(btrim(p_value)) limit 1;
  if v_pick is null then
    raise exception '% has no % "%".', v_name, lower(coalesce(v_heading, 'choice')), btrim(p_value) using errcode = '22023';
  end if;
  return v_pick;
end;
$$;

-- A retired entry never takes a stock movement.
create or replace function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
begin
  if exists (select 1 from public.product_variants v where v.id = new.variant_id and v.retired) then
    raise exception 'This stock entry is no longer used: the product''s stock is counted as one.'
      using errcode = '22023', detail = new.variant_id::text;
  end if;

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

-- A retired entry is never in stock on the website.
create or replace function private.variant_stock_from_shelf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
begin
  if new.retired then
    new.in_stock := false;
    new.stock_qty := 0;
  elsif private.website_stock_sync_on() then
    select on_hand into v_on_hand from public.stock_levels where variant_id = new.id;
    new.in_stock := coalesce(v_on_hand, 0) > 0;
    new.stock_qty := greatest(coalesce(v_on_hand, 0), 0);
  end if;
  return new;
end;
$$;

-- Points every order, sale, invoice, purchase and return line (and the cost and
-- codes) of one stock entry at another, then retires the first. The lines keep
-- their copied names and colours.
create function private.move_variant_history(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sku text;
  v_barcode text;
begin
  update public.order_items set variant_id = p_to where variant_id = p_from;
  update public.sale_items set variant_id = p_to where variant_id = p_from;
  update public.invoice_items set variant_id = p_to where variant_id = p_from;
  update public.purchase_items set variant_id = p_to where variant_id = p_from;
  update public.return_items set variant_id = p_to where variant_id = p_from;
  insert into public.variant_costs (variant_id, cost_price)
  select p_to, c.cost_price from public.variant_costs c where c.variant_id = p_from
  on conflict (variant_id) do nothing;

  update public.product_variants v set retired = true, sku = null, barcode = null
  from (select sku, barcode from public.product_variants where id = p_from) old
  where v.id = p_from
  returning old.sku, old.barcode into v_sku, v_barcode;
  update public.product_variants
  set sku = coalesce(sku, v_sku), barcode = coalesce(barcode, v_barcode)
  where id = p_to;
end;
$$;
revoke all on function private.move_variant_history(uuid, uuid) from public, anon, authenticated;

-- product_variants_unique_options stays: retired entries keep the colour they
-- were (option1_value), or for a merged duplicate the name it was listed under
-- (option1_value) and its old colour (option2_value), so they stay apart.

-- 2. Colours share one stock number -------------------------------------------

do $$
declare
  prod record;
  ent record;
  v_base uuid;
  v_owner uuid;
begin
  select user_id into v_owner from public.admins where role = 'owner' order by is_active desc limit 1;
  if exists (
    select 1 from public.stock_levels s
    join public.product_variants v on v.id = s.variant_id
    where s.on_hand < 0 and (v.option1_value is not null or v.option2_value is not null)
  ) then
    raise exception 'A colour shows less than zero on the shelf. Recount it, then run this again.';
  end if;

  for prod in
    select pr.id, pr.name, pr.option1_name, pr.option2_name
    from public.products pr
    where exists (select 1 from public.product_variants v
                  where v.product_id = pr.id and (v.option1_value is not null or v.option2_value is not null))
    order by pr.name
  loop
    -- The entry that keeps the stock: the one with most on the shelf.
    select v.id into v_base
    from public.product_variants v
    left join public.stock_levels s on s.variant_id = v.id
    where v.product_id = prod.id
    order by coalesce(s.on_hand, 0) desc, v.id
    limit 1;

    update public.products pr
    set option1_name = coalesce(nullif(concat_ws(' / ', prod.option1_name, prod.option2_name), ''), 'Colour'),
        option2_name = null,
        choices = (
          select array_agg(distinct btrim(concat_ws(' / ', v.option1_value, v.option2_value)))
          from public.product_variants v
          where v.product_id = prod.id and nullif(btrim(concat_ws(' / ', v.option1_value, v.option2_value)), '') is not null
        )
    where pr.id = prod.id;

    for ent in
      select v.id, coalesce(s.on_hand, 0) as on_hand, concat_ws(' / ', v.option1_value, v.option2_value) as label
      from public.product_variants v
      left join public.stock_levels s on s.variant_id = v.id
      where v.product_id = prod.id and v.id <> v_base
      order by 3
    loop
      if ent.on_hand > 0 then
        insert into public.stock_movements (variant_id, qty_change, kind, reason, created_by)
        values (ent.id, -ent.on_hand, 'adjustment', left(format('Colours now share one stock number: moved to %s', prod.name), 300), v_owner);
        insert into public.stock_movements (variant_id, qty_change, kind, reason, created_by)
        values (v_base, ent.on_hand, 'adjustment', left(format('Colours now share one stock number: %s from %s', ent.on_hand, ent.label), 300), v_owner);
      end if;
      perform private.move_variant_history(ent.id, v_base);
    end loop;

    update public.product_variants set option1_value = null, option2_value = null where id = v_base;
  end loop;

  -- A heading without choices means nothing to pick.
  update public.products set option1_name = null where cardinality(choices) = 0 and option1_name is not null;
end;
$$;

-- 3. Products listed twice ----------------------------------------------------

-- Merges a duplicate listing into the product kept. The duplicate's shelf goes
-- to zero (its stock is the kept product's stock, counted twice), its history
-- moves across, the kept product gets any photo, category, description or
-- colour it lacked, and the old web address redirects. Skips quietly when
-- either product isn't there.
create function private.merge_products(p_keep_slug text, p_dup_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.products;
  d public.products;
  v record;
  v_keep_variant uuid;
  v_owner uuid;
begin
  select * into k from public.products where slug = p_keep_slug;
  select * into d from public.products where slug = p_dup_slug;
  if k.id is null or d.id is null or k.id = d.id then
    raise notice 'Not merging % into %: one of them is missing.', p_dup_slug, p_keep_slug;
    return;
  end if;
  v_keep_variant := private.active_variant(k.id);
  select user_id into v_owner from public.admins where role = 'owner' order by is_active desc limit 1;

  for v in
    select pv.id, pv.retired, coalesce(s.on_hand, 0) as on_hand
    from public.product_variants pv
    left join public.stock_levels s on s.variant_id = pv.id
    where pv.product_id = d.id
    order by pv.retired, pv.id
  loop
    if not v.retired and v.on_hand <> 0 then
      insert into public.stock_movements (variant_id, qty_change, kind, reason, created_by)
      values (v.id, -v.on_hand, 'count', left(format('Listed twice: stock is counted on %s', k.name), 300), v_owner);
    end if;
    perform private.move_variant_history(v.id, v_keep_variant);
    update public.product_variants
    set product_id = k.id, option1_value = left(d.name, 200), option2_value = option1_value
    where id = v.id;
  end loop;

  if not exists (select 1 from public.product_images where product_id = k.id) then
    update public.product_images set product_id = k.id where product_id = d.id;
  end if;
  insert into public.product_categories (product_id, category_id)
  select k.id, pc.category_id from public.product_categories pc where pc.product_id = d.id
  on conflict do nothing;

  update public.products p
  set description = coalesce(nullif(btrim(p.description), ''), d.description),
      brand = coalesce(p.brand, d.brand),
      is_featured = p.is_featured or d.is_featured,
      option1_name = coalesce(p.option1_name, d.option1_name),
      choices = p.choices || coalesce((
        select array_agg(c order by n) from unnest(d.choices) with ordinality as x (c, n)
        where not exists (select 1 from unnest(p.choices) kc where lower(kc) = lower(x.c))
      ), '{}')
  where p.id = k.id;

  update public.product_redirects set product_id = k.id where product_id = d.id;
  insert into public.product_redirects (old_slug, product_id) values (d.slug, k.id)
  on conflict (old_slug) do update set product_id = excluded.product_id;

  delete from public.products where id = d.id;
end;
$$;
revoke all on function private.merge_products(text, text) from public, anon, authenticated;

select private.merge_products('cntronic-foldable-kettle-1-5l-cic-220', 'foldable-travel-kettle-1-5l');
select private.merge_products('cntronic-electric-kettle-4-0l-cic-248', 'electric-kettle-4l');
select private.merge_products('cntronic-10-in-1-multi-cooker-5l-cic-836', 'multi-function-electric-pot-5l');
select private.merge_products('mixdor-mx-6013', 'mixdor-2-in-1-blender-1-8l');
select private.merge_products('cntronic-3-in-1-blender', '3-in-1-stainless-steel-blender-650w-cic-306');
select private.merge_products('jikaboda-charcoal-pot-large', 'jikaboda-charcoal-stove');
select private.merge_products('steam-frying-cooking-pot-gl-2206', 'steam-frying-cooking-pot-22cm');
select private.merge_products('steam-frying-cooking-pot-gl-2206', 'fryer-pot');
select private.merge_products('sonifer-ice-maker-sf-6532-large', 'sonifer-ice-maker-2-5l');
select private.merge_products('commercial-grinder-4-5kg', 'commercial-grinder-5kg');
select private.merge_products('kids-study-table-and-chair-yj727-5', 'kids-table-and-chair');

-- The CIC-306 blender sells at GH₵ 380 (the owner's price); its model code from the description.
update public.products set price = 38000 where slug = 'cntronic-3-in-1-blender';
update public.product_variants v set sku = 'CIC-306'
from public.products p
where p.id = v.product_id and p.slug = 'cntronic-3-in-1-blender' and not v.retired and v.sku is null
  and not exists (select 1 from public.product_variants x where lower(x.sku) = 'cic-306');

-- 4. The rules from now on ------------------------------------------------------

-- One heading only: option2_name is no longer used.
update public.products set option2_name = null where option2_name is not null;
alter table public.products
  add constraint products_one_choice_heading check (option2_name is null),
  add constraint products_choices_valid check (private.valid_choices(choices)),
  add constraint products_choices_heading check ((option1_name is null) = (cardinality(choices) = 0));
create unique index product_variants_one_in_use on public.product_variants (product_id) where not retired;
alter table public.product_variants
  add constraint product_variants_no_option_values check (retired or (option1_value is null and option2_value is null));

-- 5. Stock and sales reads: one line per product --------------------------------

create or replace view public.pos_stock_rows
with (security_invoker = true)
as
select
  v.id as variant_id,
  p.id as product_id,
  p.name as product_name,
  -- Always null now (kept so the view's columns stay in place).
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
  p.updated_at,
  p.option1_name as choice_name,
  p.choices
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.stock_levels s on s.variant_id = v.id
left join lateral (
  select c.id as category_id, c.name as category_name,
    coalesce(parent.id, c.id) as top_category_id, coalesce(parent.name, c.name) as top_category_name
  from public.product_categories pc
  join public.categories c on c.id = pc.category_id
  left join public.categories parent on parent.id = c.parent_id
  where pc.product_id = p.id
  order by c.parent_id is null, coalesce(parent.sort_order, c.sort_order), c.sort_order, c.name
  limit 1
) cat on true
left join lateral (
  select i.url from public.product_images i where i.product_id = p.id order by i.sort_order limit 1
) img on true
where not v.retired;

-- Best sellers count a product once, whatever colours were picked.
create or replace function public.pos_top_products(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer default 10)
returns table(product_name text, option_values text, qty integer, revenue integer, profit integer)
language sql
stable
set search_path = ''
as $$
  select si.product_name, null::text,
    sum(si.qty)::integer,
    sum(si.line_total)::integer,
    case when private.is_owner() then sum(si.line_total - si.qty * coalesce(c.unit_cost, 0))::integer end
  from public.sale_items si
  join public.sales sa on sa.id = si.sale_id
  left join public.sale_item_costs c on c.sale_item_id = si.id
  where sa.status = 'completed'
    and si.kind = 'item'
    and coalesce(sa.completed_at, sa.created_at) >= p_from
    and coalesce(sa.completed_at, sa.created_at) < p_to
  group by si.product_name
  order by 4 desc, 3 desc, 1
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Old sales and purchases matched by name: the stock entry in use.
create or replace function private.variant_by_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then min(v.id::text)::uuid end
  from public.products p
  join public.product_variants v on v.product_id = p.id and not v.retired
  where lower(btrim(p.name)) = lower(btrim(p_name));
$$;

create or replace function public.pos_save_count_line(p_count_id uuid, p_variant_id uuid, p_counted integer)
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
  join public.product_variants v on v.id = s.variant_id and not v.retired
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

-- 6. Selling, invoices and returns carry the colour picked ----------------------

-- p_items: [{"variant_id", "qty", "choice"}]; choice is optional (a colour, design…).
create or replace function public.pos_complete_sale(p_items jsonb, p_customer_id uuid, p_discount integer, p_method text, p_delivery jsonb, p_cash_received integer default null::integer, p_note text default null::text)
returns table(sale_id uuid, code text, total integer, change_given integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_lines integer;
  v_found integer;
  v_subtotal integer;
  v_total integer;
  v_sale_id uuid;
  v_code text;
  v_item_id uuid;
  v_left integer;
  v_change integer;
  -- Lines as sold: one per item and choice.
  v_sold jsonb;
  -- One entry per stock entry, for the shelf: [{"variant_id", "qty"}, ...]
  v_basket jsonb;
  v_fee integer := 0;
  v_address text;
  v_phone text;
begin
  if not private.is_member() then
    raise exception 'Sign in again to sell.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The basket is empty.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'momo', 'bank', 'later') then
    raise exception 'Choose how the customer pays.' using errcode = '22023';
  end if;
  if p_discount is null or p_discount < 0 then
    raise exception 'The discount can''t be below zero.' using errcode = '22023';
  end if;
  if p_discount > 0 and not private.can_give_discounts() then
    raise exception 'You are not allowed to give discounts. Ask the owner.' using errcode = '42501';
  end if;
  if p_method = 'later' and p_customer_id is null then
    raise exception 'Choose the customer who will pay later.' using errcode = '22023';
  end if;
  if p_delivery is not null then
    v_fee := coalesce((p_delivery ->> 'fee')::integer, 0);
    v_address := nullif(btrim(p_delivery ->> 'address'), '');
    v_phone := nullif(btrim(p_delivery ->> 'phone'), '');
    if v_fee < 0 or v_fee > 10000000 then
      raise exception 'Enter a delivery fee from GH₵ 0.' using errcode = '22023';
    end if;
    if v_address is null or char_length(v_address) > 300 then
      raise exception 'Enter where to deliver: the area and a landmark.' using errcode = '22023';
    end if;
    if v_phone is not null and v_phone !~ '^233[235][0-9]{8}$' then
      raise exception 'Enter a Ghana phone number for the delivery.' using errcode = '22023';
    end if;
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'This customer no longer exists.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as i (variant_id uuid, qty integer)
    where i.variant_id is null or i.qty is null or i.qty < 1 or i.qty > 999
  ) then
    raise exception 'Each item needs a quantity from 1 to 999.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'choice', x.choice, 'qty', x.qty)
                   order by x.variant_id, x.choice)
  into v_sold
  from (
    select i.variant_id, private.pick_choice(i.variant_id, i.choice) as choice, sum(i.qty)::integer as qty
    from jsonb_to_recordset(p_items) as i (variant_id uuid, qty integer, choice text)
    group by 1, 2
  ) x;

  -- One entry per stock entry (the same item scanned twice, or in two colours, adds up).
  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'qty', x.qty) order by x.variant_id)
  into v_basket
  from (
    select i.variant_id, sum(i.qty)::integer as qty
    from jsonb_to_recordset(v_sold) as i (variant_id uuid, qty integer)
    group by i.variant_id
  ) x;
  if exists (select 1 from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer) where b.qty > 999) then
    raise exception 'Each item needs a quantity from 1 to 999.' using errcode = '22023';
  end if;

  -- Lock the shelf rows first, in a fixed order, so two tills can't both sell the last one.
  perform 1 from public.stock_levels s
  join jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer) on b.variant_id = s.variant_id
  order by s.variant_id
  for update of s;

  select count(*), count(v.id), coalesce(sum(coalesce(v.price_override, p.price) * b.qty), 0)
  into v_lines, v_found, v_subtotal
  from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
  left join public.product_variants v on v.id = b.variant_id and not v.retired
  left join public.products p on p.id = v.product_id;
  if v_found <> v_lines then
    raise exception 'An item in the basket is no longer sold. Remove it and try again.' using errcode = 'P0002';
  end if;
  if p_discount > v_subtotal then
    raise exception 'The discount is more than the sale.' using errcode = '22023';
  end if;
  -- The discount is on the items; the delivery fee comes on top.
  v_total := v_subtotal - p_discount + v_fee;

  -- Check the shelf before taking a sale number, so a refused sale leaves no gap
  -- in SL_ numbers. (The stock movement trigger checks again.)
  select greatest(s.on_hand, 0) as on_hand, p.name
  into v_line
  from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
  join public.stock_levels s on s.variant_id = b.variant_id
  join public.product_variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  where s.on_hand < b.qty
  order by p.name
  limit 1;
  if found then
    raise exception 'Only % left of %.', v_line.on_hand, v_line.name using errcode = 'TV001';
  end if;

  if p_method = 'cash' then
    if p_cash_received is not null and p_cash_received < v_total then
      raise exception 'The cash received is less than the total.' using errcode = '22023';
    end if;
    v_change := coalesce(p_cash_received, v_total) - v_total;
  end if;

  insert into public.sales (source, status, customer_id, subtotal, discount, total, note, completed_at)
  values ('shop', 'completed', p_customer_id, v_subtotal + v_fee, p_discount, v_total, nullif(btrim(p_note), ''), now())
  returning id, sales.code into v_sale_id, v_code;

  for v_line in
    select b.variant_id, b.qty, b.choice, p.name as product_name,
           coalesce(v.price_override, p.price) as unit_price,
           c.cost_price
    from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer, choice text)
    join public.product_variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
    left join public.variant_costs c on c.variant_id = v.id
    order by p.name, b.choice nulls first
  loop
    insert into public.sale_items (sale_id, variant_id, product_name, option_values, unit_price, qty, line_total)
    values (v_sale_id, v_line.variant_id, v_line.product_name, v_line.choice, v_line.unit_price, v_line.qty,
            v_line.unit_price * v_line.qty)
    returning id into v_item_id;

    if v_line.cost_price is not null then
      insert into public.sale_item_costs (sale_item_id, unit_cost) values (v_item_id, v_line.cost_price);
    end if;
  end loop;

  for v_line in
    select b.variant_id, b.qty, p.name as product_name
    from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
    join public.product_variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
    order by b.variant_id
  loop
    begin
      insert into public.stock_movements (variant_id, qty_change, kind, sale_id)
      values (v_line.variant_id, -v_line.qty, 'sale', v_sale_id);
    exception when sqlstate 'TV001' then
      select on_hand into v_left from public.stock_levels where variant_id = v_line.variant_id;
      raise exception 'Only % left of %.', greatest(v_left, 0), v_line.product_name
        using errcode = 'TV001', detail = v_line.variant_id::text;
    end;
  end loop;

  if p_delivery is not null then
    perform private.add_delivery(v_sale_id, v_fee, v_address, p_delivery ->> 'name', v_phone, p_delivery ->> 'note');
  end if;

  if p_method <> 'later' and v_total > 0 then
    insert into public.payments (sale_id, method, amount, cash_received, change_given)
    values (
      v_sale_id,
      p_method::public.payment_method,
      v_total,
      case when p_method = 'cash' then v_total + v_change end,
      case when p_method = 'cash' then v_change end
    );
  end if;

  return query select v_sale_id, v_code, v_total, v_change;
end;
$$;

-- p_items: [{"variant_id", "qty", "choice"}].
create or replace function public.pos_create_invoice(p_items jsonb, p_customer_id uuid, p_discount integer, p_delivery jsonb, p_valid_until date, p_note text default null::text)
returns table(invoice_id uuid, code text, total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold jsonb;
  v_lines integer;
  v_found integer;
  v_subtotal integer;
  v_fee integer := 0;
  v_address text;
  v_phone text;
  v_total integer;
  v_id uuid;
  v_code text;
begin
  if not private.is_member() then
    raise exception 'Sign in again to make an invoice.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The basket is empty.' using errcode = '22023';
  end if;
  if p_discount is null or p_discount < 0 then
    raise exception 'The discount can''t be below zero.' using errcode = '22023';
  end if;
  if p_discount > 0 and not private.can_give_discounts() then
    raise exception 'You are not allowed to give discounts. Ask the owner.' using errcode = '42501';
  end if;
  if p_valid_until is null or p_valid_until < current_date or p_valid_until > current_date + 365 then
    raise exception 'Choose a "valid until" date from today to a year ahead.' using errcode = '22023';
  end if;
  if p_delivery is not null then
    v_fee := coalesce((p_delivery ->> 'fee')::integer, 0);
    v_address := nullif(btrim(p_delivery ->> 'address'), '');
    v_phone := nullif(btrim(p_delivery ->> 'phone'), '');
    if v_fee < 0 or v_fee > 10000000 then
      raise exception 'Enter a delivery fee from GH₵ 0.' using errcode = '22023';
    end if;
    if v_address is null or char_length(v_address) > 300 then
      raise exception 'Enter where to deliver: the area and a landmark.' using errcode = '22023';
    end if;
    if v_phone is not null and v_phone !~ '^233[235][0-9]{8}$' then
      raise exception 'Enter a Ghana phone number for the delivery.' using errcode = '22023';
    end if;
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'This customer no longer exists.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as i (variant_id uuid, qty integer)
    where i.variant_id is null or i.qty is null or i.qty < 1 or i.qty > 999
  ) then
    raise exception 'Each item needs a quantity from 1 to 999.' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'choice', x.choice, 'qty', x.qty)
                   order by x.variant_id, x.choice)
  into v_sold
  from (
    select i.variant_id, private.pick_choice(i.variant_id, i.choice) as choice, sum(i.qty)::integer as qty
    from jsonb_to_recordset(p_items) as i (variant_id uuid, qty integer, choice text)
    group by 1, 2
  ) x;
  if exists (select 1 from jsonb_to_recordset(v_sold) as b (qty integer) where b.qty > 999) then
    raise exception 'Each item needs a quantity from 1 to 999.' using errcode = '22023';
  end if;

  -- Prices come from the catalogue, never from the browser.
  select count(*), count(v.id), coalesce(sum(coalesce(v.price_override, p.price) * b.qty), 0)
  into v_lines, v_found, v_subtotal
  from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer)
  left join public.product_variants v on v.id = b.variant_id and not v.retired
  left join public.products p on p.id = v.product_id;
  if v_found <> v_lines then
    raise exception 'An item in the basket is no longer sold. Remove it and try again.' using errcode = 'P0002';
  end if;
  if p_discount > v_subtotal then
    raise exception 'The discount is more than the items.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + v_fee;

  insert into public.invoices (customer_id, subtotal, discount, delivery_fee, delivery_address, delivery_name,
                               delivery_phone, delivery_note, total, valid_until, note)
  values (p_customer_id, v_subtotal, p_discount, v_fee, v_address,
          left(nullif(btrim(p_delivery ->> 'name'), ''), 100), v_phone,
          left(nullif(btrim(p_delivery ->> 'note'), ''), 300),
          v_total, p_valid_until, left(nullif(btrim(p_note), ''), 300))
  returning id, invoices.code into v_id, v_code;

  insert into public.invoice_items (invoice_id, variant_id, product_name, option_values, unit_price, qty, line_total)
  select v_id, b.variant_id, p.name, b.choice,
         coalesce(v.price_override, p.price), b.qty, coalesce(v.price_override, p.price) * b.qty
  from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer, choice text)
  join public.product_variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  order by p.name, b.choice nulls first;

  return query select v_id, v_code, v_total;
end;
$$;

-- A return without a sale names the item (and optionally its colour); with a
-- sale, lines are copied from the sale as before.
create or replace function public.pos_create_return(p jsonb)
returns table(return_id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid := (p ->> 'sale_id')::uuid;
  v_customer_id uuid := (p ->> 'customer_id')::uuid;
  v_id uuid;
  v_code text;
  v_line record;
  v_value integer := 0;
  v_refund integer := (p ->> 'refund_total')::integer;
  v_paid integer := coalesce((p -> 'refund' ->> 'amount')::integer, 0);
begin
  if not private.is_member() then
    raise exception 'Sign in again to record returns.' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'Choose what is being returned.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p -> 'lines') as l (sale_item_id uuid, variant_id uuid, qty integer, back_on_shelf boolean)
    where l.qty is null or l.qty < 1 or l.qty > 999 or l.back_on_shelf is null
       or (l.sale_item_id is null and l.variant_id is null)
       or (v_sale_id is null and l.sale_item_id is not null)
       or (v_sale_id is not null and l.sale_item_id is null)
  ) then
    raise exception 'Each returned item needs a quantity.' using errcode = '22023';
  end if;

  if v_sale_id is not null then
    perform 1 from public.sales where id = v_sale_id and status = 'completed' for update;
    if not found then
      raise exception 'Only items from a completed sale can be returned.' using errcode = '22023';
    end if;
    v_customer_id := coalesce(v_customer_id, (select customer_id from public.sales where id = v_sale_id));
    -- Not more than was sold, less what earlier returns took back.
    select l.qty, si.qty - coalesce((select sum(ri.qty) from public.return_items ri where ri.sale_item_id = si.id), 0) as left_qty,
           si.product_name
    into v_line
    from (
      select x.sale_item_id, sum(x.qty)::integer as qty
      from jsonb_to_recordset(p -> 'lines') as x (sale_item_id uuid, qty integer)
      group by x.sale_item_id
    ) l
    left join public.sale_items si on si.id = l.sale_item_id and si.sale_id = v_sale_id
    where si.id is null
       or l.qty > si.qty - coalesce((select sum(ri.qty) from public.return_items ri where ri.sale_item_id = si.id), 0)
    limit 1;
    if found then
      raise exception '%', coalesce('Only ' || v_line.left_qty || ' of ' || v_line.product_name || ' can still be returned.',
                                    'An item isn''t on this sale.') using errcode = '22023';
    end if;
  end if;
  if v_customer_id is not null and not exists (select 1 from public.customers where id = v_customer_id) then
    raise exception 'This customer no longer exists.' using errcode = 'P0002';
  end if;

  insert into public.returns (sale_id, customer_id, refund_total, note)
  values (v_sale_id, v_customer_id, 0, nullif(btrim(p ->> 'note'), ''))
  returning id, returns.code into v_id, v_code;

  if v_sale_id is not null then
    insert into public.return_items (return_id, sale_item_id, variant_id, product_name, option_values, unit_price, qty, line_total, back_on_shelf)
    select v_id, si.id, si.variant_id, si.product_name, si.option_values, si.unit_price, l.qty, si.unit_price * l.qty, l.back_on_shelf
    from jsonb_to_recordset(p -> 'lines') as l (sale_item_id uuid, qty integer, back_on_shelf boolean)
    join public.sale_items si on si.id = l.sale_item_id;
  else
    insert into public.return_items (return_id, variant_id, product_name, option_values, unit_price, qty, line_total, back_on_shelf)
    select v_id, v.id, pr.name, private.pick_choice(v.id, l.choice),
           coalesce(v.price_override, pr.price), l.qty, coalesce(v.price_override, pr.price) * l.qty, l.back_on_shelf
    from jsonb_to_recordset(p -> 'lines') as l (variant_id uuid, qty integer, back_on_shelf boolean, choice text)
    join public.product_variants v on v.id = l.variant_id and not v.retired
    join public.products pr on pr.id = v.product_id;
    if (select count(*) from public.return_items where return_items.return_id = v_id) <> jsonb_array_length(p -> 'lines') then
      raise exception 'An item is no longer in the catalogue.' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(sum(line_total), 0) into v_value from public.return_items where return_items.return_id = v_id;
  v_refund := coalesce(v_refund, v_value);
  if v_refund < 0 or v_refund > v_value then
    raise exception 'The refund can''t be more than the returned items are worth.' using errcode = '22023';
  end if;
  if v_paid < 0 or v_paid > v_refund then
    raise exception 'The money handed back can''t be more than the refund.' using errcode = '22023';
  end if;
  update public.returns set refund_total = v_refund where id = v_id;

  -- Back on the shelf of the stock entry in use (an old sale line may name a retired one).
  for v_line in
    select coalesce(case when v.retired then private.active_variant(v.product_id) end, ri.variant_id) as variant_id,
           sum(ri.qty)::integer as qty
    from public.return_items ri
    join public.product_variants v on v.id = ri.variant_id
    where ri.return_id = v_id and ri.back_on_shelf
    group by 1 order by 1
  loop
    insert into public.stock_movements (variant_id, qty_change, kind, reason, return_id)
    values (v_line.variant_id, v_line.qty, 'return', null, v_id);
  end loop;

  if v_paid > 0 then
    insert into public.refund_payments (return_id, method, amount)
    values (v_id, (p -> 'refund' ->> 'method')::public.payment_method, v_paid);
  end if;

  return query select v_id, v_code;
end;
$$;

-- Purchases name the product only: stock has no colours.
create or replace function public.pos_save_purchase(p jsonb)
returns table(purchase_id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_total integer;
  v_lines integer;
  v_found integer;
  v_amount integer := (p -> 'payment' ->> 'amount')::integer;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can record purchases.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = (p ->> 'supplier_id')::uuid) then
    raise exception 'Choose the supplier.' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'Add at least one item.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p -> 'lines') as l (variant_id uuid, qty integer, unit_cost integer)
    where l.variant_id is null or l.qty is null or l.qty < 1 or l.qty > 100000 or l.unit_cost is null or l.unit_cost < 0
  ) then
    raise exception 'Each item needs a quantity and a cost.' using errcode = '22023';
  end if;

  select count(*), count(v.id), coalesce(sum(l.qty * l.unit_cost), 0)
  into v_lines, v_found, v_total
  from jsonb_to_recordset(p -> 'lines') as l (variant_id uuid, qty integer, unit_cost integer)
  left join public.product_variants v on v.id = l.variant_id and not v.retired;
  if v_found <> v_lines then
    raise exception 'An item on this purchase is no longer in the catalogue.' using errcode = 'P0002';
  end if;
  if v_amount is not null and (v_amount < 0 or v_amount > v_total) then
    raise exception 'The amount paid can''t be more than the purchase.' using errcode = '22023';
  end if;

  insert into public.purchases (supplier_id, total, note)
  values ((p ->> 'supplier_id')::uuid, v_total, nullif(btrim(p ->> 'note'), ''))
  returning id, purchases.code into v_id, v_code;

  insert into public.purchase_items (purchase_id, variant_id, product_name, option_values, unit_cost, qty, line_total)
  select v_id, l.variant_id, pr.name, null, l.unit_cost, l.qty, l.unit_cost * l.qty
  from rows from (jsonb_to_recordset(p -> 'lines') as (variant_id uuid, qty integer, unit_cost integer))
    with ordinality as l (variant_id, qty, unit_cost, n)
  join public.product_variants v on v.id = l.variant_id
  join public.products pr on pr.id = v.product_id
  order by l.n;

  if coalesce((p ->> 'received')::boolean, false) then
    perform private.receive_purchase(v_id);
  end if;

  if coalesce(v_amount, 0) > 0 then
    insert into public.purchase_payments (purchase_id, method, amount)
    values (v_id, (p -> 'payment' ->> 'method')::public.payment_method, v_amount);
  end if;

  return query select v_id, v_code;
end;
$$;

-- Add product / save: one stock entry, with optional choices (colours…).
create or replace function public.pos_save_product(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_variant jsonb := p -> 'variant';
  v_variant_id uuid;
  v_heading text := nullif(btrim(p ->> 'choice_name'), '');
  v_choices text[];
begin
  if not private.is_owner() then
    raise exception 'Only the owner can add or edit products.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_variant) is distinct from 'object' then
    raise exception 'A product needs its stock details.' using errcode = '22023';
  end if;
  select coalesce(array_agg(btrim(c) order by n), '{}') into v_choices
  from jsonb_array_elements_text(coalesce(p -> 'choices', '[]')) with ordinality as x (c, n)
  where btrim(c) <> '';
  if v_heading is null then
    v_choices := '{}';
  elsif cardinality(v_choices) = 0 then
    v_heading := null;
  end if;

  if v_id is null then
    insert into public.products (name, slug, price, is_active, option1_name, choices)
    values (btrim(p ->> 'name'), p ->> 'slug', (p ->> 'price')::integer, (p ->> 'is_active')::boolean, v_heading, v_choices)
    returning id into v_id;
    if p ->> 'category_id' is not null then
      insert into public.product_categories (product_id, category_id) values (v_id, (p ->> 'category_id')::uuid);
    end if;
    insert into public.product_variants (product_id) values (v_id) returning id into v_variant_id;
  else
    update public.products
    set name = btrim(p ->> 'name'), price = (p ->> 'price')::integer, is_active = (p ->> 'is_active')::boolean,
        option1_name = v_heading, choices = v_choices
    where id = v_id;
    if not found then
      raise exception 'This product no longer exists.' using errcode = 'P0002';
    end if;
    v_variant_id := private.active_variant(v_id);
  end if;

  update public.product_variants
  set sku = nullif(btrim(v_variant ->> 'sku'), ''),
      barcode = nullif(btrim(v_variant ->> 'barcode'), ''),
      reorder_level = (v_variant ->> 'reorder_level')::integer,
      price_override = null
  where id = v_variant_id;
  if not found then
    raise exception 'This product no longer exists. Reload the page.' using errcode = 'P0002';
  end if;

  if v_variant ->> 'cost_price' is null then
    delete from public.variant_costs where variant_id = v_variant_id;
  else
    insert into public.variant_costs (variant_id, cost_price)
    values (v_variant_id, (v_variant ->> 'cost_price')::integer)
    on conflict (variant_id) do update
      set cost_price = excluded.cost_price, updated_by = auth.uid()
      where public.variant_costs.cost_price is distinct from excluded.cost_price;
  end if;

  return v_id;
end;
$$;

-- Import matches the stock entry in use.
create or replace function public.pos_import_products(p_rows jsonb, p_apply boolean, p_update_prices boolean, p_set_stock boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_variant uuid;
  v_product uuid;
  v_product_name text;
  v_old_price integer;
  v_count integer;
  v_how text;
  v_slug text;
  v_n integer;
  v_on_hand integer;
  v_category uuid;
  v_notes text[];
  v_out jsonb := '[]'::jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can import data.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send at most 500 rows at a time.' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x (
      "row" integer, name text, slug text, sku text, barcode text, category text,
      price integer, cost integer, qty integer, reorder integer)
  loop
    if r.name is null or btrim(r.name) = '' or r.price is null or r.price < 0
       or r.slug is null or r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or (r.cost is not null and r.cost < 0) or (r.qty is not null and abs(r.qty) > 100000)
       or (r.reorder is not null and r.reorder not between 0 and 100000) then
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error', 'message', 'This row is incomplete.');
      continue;
    end if;

    -- Match: code, then barcode, then name.
    v_variant := null;
    v_product := null;
    v_how := null;
    if nullif(btrim(r.sku), '') is not null then
      select v.id, v.product_id into v_variant, v_product
      from public.product_variants v where not v.retired and lower(btrim(v.sku)) = lower(btrim(r.sku)) limit 1;
      if found then v_how := 'code'; end if;
    end if;
    if v_variant is null and nullif(btrim(r.barcode), '') is not null then
      select v.id, v.product_id into v_variant, v_product
      from public.product_variants v where not v.retired and v.barcode = btrim(r.barcode) limit 1;
      if found then v_how := 'barcode'; end if;
    end if;
    if v_variant is null then
      select count(*) into v_count from public.products p where lower(btrim(p.name)) = lower(btrim(r.name));
      if v_count > 1 then
        v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error',
          'message', format('%s products are called “%s”. Add their codes to the file.', v_count, r.name));
        continue;
      elsif v_count = 1 then
        select p.id into v_product from public.products p where lower(btrim(p.name)) = lower(btrim(r.name));
        v_variant := private.active_variant(v_product);
        v_how := 'name';
      end if;
    end if;

    v_notes := array[]::text[];
    v_on_hand := 0;
    if v_variant is not null then
      select p.name, p.price into v_product_name, v_old_price from public.products p where p.id = v_product;
      select coalesce(s.on_hand, 0) into v_on_hand from public.stock_levels s where s.variant_id = v_variant;
      v_on_hand := coalesce(v_on_hand, 0);
      v_notes := array_append(v_notes, format('Matches “%s” by %s', v_product_name, v_how));
      if p_update_prices and v_old_price <> r.price then
        v_notes := array_append(v_notes, format('price %s → %s', trim_scale(v_old_price / 100.0), trim_scale(r.price / 100.0)));
      end if;
    else
      v_notes := array_append(v_notes, 'New product, hidden from the website');
      v_category := null;
      if nullif(btrim(r.category), '') is not null then
        -- A subcategory of that name first, then a top category.
        select c.id into v_category from public.categories c
        where lower(c.name) = lower(btrim(r.category))
        order by c.parent_id is null, c.sort_order limit 1;
        if v_category is null then
          v_notes := array_append(v_notes, format('no category called “%s”', btrim(r.category)));
        end if;
      end if;
    end if;
    if p_set_stock and r.qty is not null and r.qty <> v_on_hand then
      v_notes := array_append(v_notes, format('shelf %s → %s', v_on_hand, r.qty));
    end if;

    if p_apply then
      if v_variant is null then
        v_slug := r.slug;
        v_n := 1;
        while exists (select 1 from public.products p where p.slug = v_slug) loop
          v_n := v_n + 1;
          v_slug := left(r.slug, 74) || '-' || v_n;
        end loop;
        insert into public.products (name, slug, price, is_active)
        values (btrim(r.name), v_slug, r.price, false)
        returning id into v_product;
        insert into public.product_variants (product_id, sku, barcode)
        values (v_product, nullif(btrim(r.sku), ''), nullif(btrim(r.barcode), ''))
        returning id into v_variant;
        if v_category is not null then
          insert into public.product_categories (product_id, category_id) values (v_product, v_category);
        end if;
      else
        update public.product_variants v
        set sku = coalesce(v.sku, nullif(btrim(r.sku), '')),
            barcode = coalesce(v.barcode, nullif(btrim(r.barcode), ''))
        where v.id = v_variant;
        if p_update_prices and v_old_price <> r.price then
          update public.products p set price = r.price where p.id = v_product;
        end if;
      end if;

      if r.reorder is not null then
        update public.product_variants v set reorder_level = r.reorder where v.id = v_variant and v.reorder_level <> r.reorder;
      end if;
      if r.cost is not null then
        insert into public.variant_costs (variant_id, cost_price)
        values (v_variant, r.cost)
        on conflict (variant_id) do update
          set cost_price = excluded.cost_price, updated_by = auth.uid()
          where public.variant_costs.cost_price is distinct from excluded.cost_price;
      end if;
      if p_set_stock and r.qty is not null then
        select coalesce(s.on_hand, 0) into v_on_hand from public.stock_levels s where s.variant_id = v_variant for update;
        if r.qty <> coalesce(v_on_hand, 0) then
          insert into public.stock_movements (variant_id, qty_change, kind, reason)
          values (v_variant, r.qty - coalesce(v_on_hand, 0), 'opening', 'Imported from the old system');
        end if;
      end if;
    end if;

    v_out := v_out || jsonb_build_object('row', r."row",
      'action', case when v_how is null then 'new' else 'update' end,
      'message', array_to_string(v_notes, '; ') || '.');
  end loop;
  return v_out;
end;
$$;

-- 7. The website follows the shelf from now on -----------------------------------

update public.settings set website_stock_sync = true where id = 1 and not website_stock_sync;
