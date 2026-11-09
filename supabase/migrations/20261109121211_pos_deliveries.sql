-- Stock & POS: deliveries.
--
-- A sale at the till, or a website order when it is marked paid, can be a
-- delivery: where to take it, who to call, and a fee typed by the cashier.
-- The fee is a "Delivery" line on the sale (sale_items.kind = 'delivery'), so
-- totals, what is owed, receipts and downloads include it, while sales
-- figures, profit and best sellers count items only and show delivery apart.
-- deliveries holds the address and follows the trip: to deliver, out (with
-- the rider), delivered. Pay on delivery is Pay later, settled on return.
--
-- The website is unchanged: no delivery fees there (CLAUDE.md rule 4).
-- The old pos_complete_sale and pos_mark_order_paid signatures stay, as
-- wrappers, so the till keeps working until the new version is deployed.

alter table public.sale_items
  add column kind text not null default 'item' check (kind in ('item', 'delivery'));

create index sale_items_delivery_idx on public.sale_items (sale_id) where kind = 'delivery';

create type public.delivery_status as enum ('to_deliver', 'out', 'delivered');

create table public.deliveries (
  sale_id uuid primary key references public.sales (id) on delete cascade,
  address text not null check (char_length(btrim(address)) between 1 and 300),
  contact_name text check (contact_name is null or char_length(contact_name) <= 100),
  contact_phone text check (contact_phone is null or contact_phone ~ '^233[235][0-9]{8}$'),
  note text check (note is null or char_length(note) <= 300),
  status public.delivery_status not null default 'to_deliver',
  rider text check (rider is null or char_length(btrim(rider)) between 1 and 60),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  out_at timestamptz,
  delivered_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null
);

create index deliveries_open_idx on public.deliveries (status, created_at) where status <> 'delivered';

-- A delivery fee isn't an item that can come back: cancel the sale instead.
create function private.no_delivery_returns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sale_item_id is not null and exists (
    select 1 from public.sale_items where id = new.sale_item_id and kind = 'delivery'
  ) then
    raise exception 'The delivery fee can''t be returned. Cancel the sale, or give the money back as a payment note.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger return_items_no_delivery
  before insert on public.return_items
  for each row execute function private.no_delivery_returns();

-- The fee line and the delivery record for a sale.
create function private.add_delivery(p_sale_id uuid, p_fee integer, p_address text, p_name text, p_phone text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fee > 0 then
    insert into public.sale_items (sale_id, variant_id, product_name, unit_price, qty, line_total, kind)
    values (p_sale_id, null, 'Delivery', p_fee, 1, p_fee, 'delivery');
  end if;
  insert into public.deliveries (sale_id, address, contact_name, contact_phone, note)
  values (p_sale_id, btrim(p_address), left(nullif(btrim(p_name), ''), 100), nullif(btrim(p_phone), ''),
          left(nullif(btrim(p_note), ''), 300));
end;
$$;

-- The till's sale, now with an optional delivery.
create function public.pos_complete_sale(
  p_items jsonb,
  p_customer_id uuid,
  p_discount integer,
  p_method text,
  -- null: the customer takes it; or {"fee", "address", "name", "phone", "note"}.
  p_delivery jsonb,
  p_cash_received integer default null,
  p_note text default null
)
returns table (sale_id uuid, code text, total integer, change_given integer)
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
  -- The basket with one entry per variant: [{"variant_id", "qty"}, ...]
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

  -- One entry per variant (the same item scanned twice adds up).
  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'qty', x.qty) order by x.variant_id)
  into v_basket
  from (
    select i.variant_id, sum(i.qty)::integer as qty
    from jsonb_to_recordset(p_items) as i (variant_id uuid, qty integer)
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
  left join public.product_variants v on v.id = b.variant_id
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
  select greatest(s.on_hand, 0) as on_hand,
         p.name || coalesce(' (' || nullif(concat_ws(' / ', v.option1_value, v.option2_value), '') || ')', '') as name
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
    select b.variant_id, b.qty, p.name as product_name,
           nullif(concat_ws(' / ', v.option1_value, v.option2_value), '') as option_values,
           coalesce(v.price_override, p.price) as unit_price,
           c.cost_price
    from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
    join public.product_variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
    left join public.variant_costs c on c.variant_id = v.id
    order by b.variant_id
  loop
    insert into public.sale_items (sale_id, variant_id, product_name, option_values, unit_price, qty, line_total)
    values (v_sale_id, v_line.variant_id, v_line.product_name, v_line.option_values, v_line.unit_price, v_line.qty,
            v_line.unit_price * v_line.qty)
    returning id into v_item_id;

    if v_line.cost_price is not null then
      insert into public.sale_item_costs (sale_item_id, unit_cost) values (v_item_id, v_line.cost_price);
    end if;

    begin
      insert into public.stock_movements (variant_id, qty_change, kind, sale_id)
      values (v_line.variant_id, -v_line.qty, 'sale', v_sale_id);
    exception when sqlstate 'TV001' then
      select on_hand into v_left from public.stock_levels where variant_id = v_line.variant_id;
      raise exception 'Only % left of %.', greatest(v_left, 0),
        v_line.product_name || coalesce(' (' || v_line.option_values || ')', '')
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

-- Mark as paid on a website order, now with an optional delivery.
-- p_delivery: null, or {"fee", "address", "name", "phone", "note"}; the
-- address and phone default to the order's location and phone.
create function public.pos_mark_order_paid(p_sale_id uuid, p_method text, p_delivery jsonb, p_cash_received integer default null)
returns table (code text, total integer, change_given integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_order_status public.order_status;
  v_line record;
  v_change integer;
  v_order public.orders;
  v_fee integer := 0;
  v_address text;
  v_phone text;
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash', 'momo', 'bank') then
    raise exception 'Choose how the customer paid.' using errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = p_sale_id and source = 'website' for update;
  if not found then
    raise exception 'This website order no longer exists.' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_sale.order_id for update;
  v_order_status := v_order.status;
  if not (v_sale.status in ('ordered', 'pending') or (v_sale.status = 'cancelled' and v_order_status = 'not_sent')) then
    raise exception '% can''t be marked as paid (it is %).', v_sale.code, v_sale.status using errcode = '22023';
  end if;

  if p_delivery is not null then
    v_fee := coalesce((p_delivery ->> 'fee')::integer, 0);
    v_address := coalesce(nullif(btrim(p_delivery ->> 'address'), ''), nullif(btrim(v_order.location), ''));
    v_phone := coalesce(nullif(btrim(p_delivery ->> 'phone'), ''), v_order.phone);
    if v_fee < 0 or v_fee > 10000000 then
      raise exception 'Enter a delivery fee from GH₵ 0.' using errcode = '22023';
    end if;
    if v_address is null or char_length(v_address) > 300 then
      raise exception 'Enter where to deliver: the area and a landmark.' using errcode = '22023';
    end if;
    if v_phone !~ '^233[235][0-9]{8}$' then
      raise exception 'Enter a Ghana phone number for the delivery.' using errcode = '22023';
    end if;
    if exists (select 1 from public.deliveries where sale_id = p_sale_id) then
      raise exception 'This order already has a delivery.' using errcode = '22023';
    end if;
    v_sale.total := v_sale.total + v_fee;
  end if;

  if p_method = 'cash' then
    if p_cash_received is not null and p_cash_received < v_sale.total then
      raise exception 'The cash received is less than the total.' using errcode = '22023';
    end if;
    v_change := coalesce(p_cash_received, v_sale.total) - v_sale.total;
  end if;

  -- Lock the shelf rows in a fixed order, then check every item is there.
  perform 1 from public.stock_levels s
  where s.variant_id in (select variant_id from public.sale_items where sale_id = p_sale_id)
  order by s.variant_id
  for update of s;

  select greatest(coalesce(s.on_hand, 0), 0) as on_hand, need.qty,
         min(i.product_name || coalesce(' (' || i.option_values || ')', '')) as name
  into v_line
  from (select variant_id, sum(qty)::integer as qty from public.sale_items
        where sale_id = p_sale_id and variant_id is not null group by variant_id) need
  join public.sale_items i on i.sale_id = p_sale_id and i.variant_id = need.variant_id
  left join public.stock_levels s on s.variant_id = need.variant_id
  where coalesce(s.on_hand, 0) < need.qty
  group by s.on_hand, need.qty, need.variant_id
  order by 3
  limit 1;
  if found then
    raise exception 'Only % left of %. Record the delivery or recount it before marking this order paid.',
      v_line.on_hand, v_line.name using errcode = 'TV001';
  end if;

  -- Cost at the moment of sale, for profit.
  insert into public.sale_item_costs (sale_item_id, unit_cost)
  select i.id, c.cost_price
  from public.sale_items i
  join public.variant_costs c on c.variant_id = i.variant_id
  where i.sale_id = p_sale_id
  on conflict (sale_item_id) do nothing;

  for v_line in
    select variant_id, sum(qty)::integer as qty from public.sale_items
    where sale_id = p_sale_id and variant_id is not null
    group by variant_id order by variant_id
  loop
    insert into public.stock_movements (variant_id, qty_change, kind, sale_id)
    values (v_line.variant_id, -v_line.qty, 'sale', p_sale_id);
  end loop;

  if v_sale.total > 0 then
    insert into public.payments (sale_id, method, amount, cash_received, change_given)
    values (p_sale_id, p_method::public.payment_method, v_sale.total,
            case when p_method = 'cash' then coalesce(p_cash_received, v_sale.total) end, v_change);
  end if;

  if p_delivery is not null then
    -- The fee goes on the sale as a "Delivery" line; the order keeps its items total.
    update public.sales s set subtotal = s.subtotal + v_fee, total = s.total + v_fee where s.id = p_sale_id;
    perform private.add_delivery(p_sale_id, v_fee, v_address,
      coalesce(nullif(btrim(p_delivery ->> 'name'), ''), v_order.customer_name), v_phone, p_delivery ->> 'note');
  end if;

  update public.sales set status = 'completed', completed_at = now() where id = p_sale_id;
  update public.orders set status = 'paid' where id = v_sale.order_id;

  return query select v_sale.code, v_sale.total, v_change;
end;
$$;

-- The signatures the till used before deliveries: walk-in (no delivery).
create or replace function public.pos_complete_sale(
  p_items jsonb,
  p_customer_id uuid,
  p_discount integer,
  p_method text,
  p_cash_received integer default null,
  p_note text default null
)
returns table (sale_id uuid, code text, total integer, change_given integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.pos_complete_sale(p_items, p_customer_id, p_discount, p_method, null::jsonb, p_cash_received, p_note);
end;
$$;

create or replace function public.pos_mark_order_paid(p_sale_id uuid, p_method text, p_cash_received integer default null)
returns table (code text, total integer, change_given integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.pos_mark_order_paid(p_sale_id, p_method, null::jsonb, p_cash_received);
end;
$$;

-- Out for delivery (with the rider), delivered, or back to "to deliver";
-- the address and note can be corrected. Anyone at the till.
create function public.pos_update_delivery(p_sale_id uuid, p_status text, p_rider text default null, p_address text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.delivery_status;
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  if p_status not in ('to_deliver', 'out', 'delivered') then
    raise exception 'Choose where the delivery is.' using errcode = '22023';
  end if;
  if p_address is not null and char_length(btrim(p_address)) not between 1 and 300 then
    raise exception 'Enter where to deliver: the area and a landmark.' using errcode = '22023';
  end if;
  if p_rider is not null and char_length(btrim(p_rider)) > 60 then
    raise exception 'The rider''s name is too long.' using errcode = '22023';
  end if;
  perform 1 from public.deliveries d
  join public.sales s on s.id = d.sale_id
  where d.sale_id = p_sale_id and s.status = 'completed'
  for update of d;
  if not found then
    raise exception 'Only a delivery on a completed sale can be updated.' using errcode = '22023';
  end if;
  v_status := p_status::public.delivery_status;
  update public.deliveries d
  set status = v_status,
      rider = case when p_rider is null then d.rider else nullif(btrim(p_rider), '') end,
      address = coalesce(nullif(btrim(p_address), ''), d.address),
      note = case when p_note is null then d.note else left(nullif(btrim(p_note), ''), 300) end,
      out_at = case when v_status = 'to_deliver' then null else coalesce(d.out_at, now()) end,
      delivered_at = case when v_status = 'delivered' then coalesce(d.delivered_at, now()) else null end,
      updated_by = auth.uid()
  where d.sale_id = p_sale_id;
end;
$$;

-- The Deliveries screen: each delivery with its sale, fee and what is owed.
create view public.pos_deliveries_list
with (security_invoker = true)
as
select
  d.sale_id, d.status, d.address, d.contact_name, d.contact_phone, d.note, d.rider,
  d.created_at, d.out_at, d.delivered_at,
  l.code, l.status as sale_status, l.source, l.total, l.paid, l.owed, l.customer_name, l.customer_phone,
  coalesce((select sum(i.line_total) from public.sale_items i where i.sale_id = d.sale_id and i.kind = 'delivery'), 0)::integer as fee
from public.deliveries d
join public.pos_sales_list l on l.id = d.sale_id;

-- ---------------------------------------------------------------------------
-- Figures: items and delivery apart
-- ---------------------------------------------------------------------------

create or replace function public.pos_period_figures(p_bounds timestamptz[], p_prev_from timestamptz, p_prev_to timestamptz)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select i, p_bounds[i] as lo, p_bounds[i + 1] as hi
    from generate_series(1, coalesce(array_length(p_bounds, 1), 1) - 1) as i
  ),
  r as (select p_bounds[1] as lo, p_bounds[array_length(p_bounds, 1)] as hi),
  owner as (select private.is_owner() as yes),
  s as (
    select sa.id, sa.total, coalesce(sa.completed_at, sa.created_at) as at,
      coalesce((select sum(i.line_total) from public.sale_items i where i.sale_id = sa.id and i.kind = 'delivery'), 0) as delivery
    from public.sales sa
    where sa.status = 'completed'
      and ((coalesce(sa.completed_at, sa.created_at) >= (select lo from r) and coalesce(sa.completed_at, sa.created_at) < (select hi from r))
        or (coalesce(sa.completed_at, sa.created_at) >= p_prev_from and coalesce(sa.completed_at, sa.created_at) < p_prev_to))
  ),
  s_cost as (
    select si.sale_id, sum(si.qty * c.unit_cost)::bigint as cost,
      count(*) filter (where c.sale_item_id is null and si.kind = 'item') as missing
    from public.sale_items si
    left join public.sale_item_costs c on c.sale_item_id = si.id
    where si.sale_id in (select id from s)
    group by si.sale_id
  ),
  ret as (
    select re.created_at as at, re.refund_total,
      (select coalesce(sum(ri.qty * coalesce(c.unit_cost, vc.cost_price)), 0)
       from public.return_items ri
       left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
       left join public.variant_costs vc on vc.variant_id = ri.variant_id and ri.sale_item_id is null
       where ri.return_id = re.id and ri.back_on_shelf)::bigint as cost_back
    from public.returns re
    where re.created_at >= (select lo from r) and re.created_at < (select hi from r)
  ),
  pu as (
    select p.total, p.created_at as at
    from public.purchases p
    where p.status <> 'cancelled' and p.created_at >= (select lo from r) and p.created_at < (select hi from r)
  ),
  per as (
    select b.i,
      (select coalesce(sum(s.total - s.delivery), 0) from s where s.at >= b.lo and s.at < b.hi)::bigint as sales,
      (select coalesce(sum(s.delivery), 0) from s where s.at >= b.lo and s.at < b.hi)::bigint as delivery,
      (select count(*) from s where s.at >= b.lo and s.at < b.hi) as sales_count,
      (select coalesce(sum(pu.total), 0) from pu where pu.at >= b.lo and pu.at < b.hi)::bigint as purchases,
      ((select coalesce(sum(s.total - s.delivery - coalesce(sc.cost, 0)), 0) from s left join s_cost sc on sc.sale_id = s.id where s.at >= b.lo and s.at < b.hi)
        - (select coalesce(sum(ret.refund_total - ret.cost_back), 0) from ret where ret.at >= b.lo and ret.at < b.hi))::bigint as profit,
      (select coalesce(sum(sc.missing), 0) from s join s_cost sc on sc.sale_id = s.id where s.at >= b.lo and s.at < b.hi)::bigint as missing
    from b
  )
  select json_build_object(
    'periods', coalesce((select json_agg(json_build_object(
        'sales', per.sales, 'delivery', per.delivery, 'count', per.sales_count, 'purchases', per.purchases,
        'profit', case when (select yes from owner) then per.profit end) order by per.i) from per), '[]'::json),
    'prev_sales', (select coalesce(sum(s.total - s.delivery), 0) from s where s.at >= p_prev_from and s.at < p_prev_to),
    'missing_costs', case when (select yes from owner) then (select coalesce(sum(per.missing), 0) from per) end
  );
$$;

create or replace function public.pos_top_products(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (product_name text, option_values text, qty integer, revenue integer, profit integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select si.product_name, si.option_values,
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
  group by si.product_name, si.option_values
  order by 4 desc, 3 desc, 1
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.deliveries, public.pos_deliveries_list from anon, authenticated;
grant select on public.deliveries, public.pos_deliveries_list to authenticated;
alter table public.deliveries enable row level security;
create policy "Shop users read deliveries" on public.deliveries for select to authenticated
  using ((select private.is_member()));

revoke execute on function private.no_delivery_returns(), private.add_delivery(uuid, integer, text, text, text, text)
from public, anon, authenticated;

revoke execute on function
  public.pos_complete_sale(jsonb, uuid, integer, text, jsonb, integer, text),
  public.pos_mark_order_paid(uuid, text, jsonb, integer),
  public.pos_update_delivery(uuid, text, text, text, text)
from public, anon;
grant execute on function
  public.pos_complete_sale(jsonb, uuid, integer, text, jsonb, integer, text),
  public.pos_mark_order_paid(uuid, text, jsonb, integer),
  public.pos_update_delivery(uuid, text, text, text, text)
to authenticated;
