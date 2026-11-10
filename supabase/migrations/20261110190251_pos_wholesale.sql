-- Stock & POS: wholesale.
--
-- Each product can have a wholesale price (product_wholesale_prices; shop
-- users read it, only the owner sets it; never on the website). A till sale
-- or an invoice can be Wholesale: items with a wholesale price are sold at
-- it, others at the normal price. Only the owner and staff who may give
-- discounts can do this. Sales and invoices are flagged (wholesale), and each
-- line sold below its retail price keeps that price (list_price) so Reports
-- can say how much was given off. Same products, same stock.

create table public.product_wholesale_prices (
  product_id uuid primary key references public.products (id) on delete cascade,
  price integer check (price is null or price >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

revoke all on public.product_wholesale_prices from anon, authenticated;
grant select on public.product_wholesale_prices to authenticated;
alter table public.product_wholesale_prices enable row level security;
create policy "Shop users read wholesale prices" on public.product_wholesale_prices for select to authenticated
  using ((select private.is_member()));

alter table public.sales add column wholesale boolean not null default false;
alter table public.invoices add column wholesale boolean not null default false;
alter table public.sale_items add column list_price integer check (list_price is null or list_price >= 0);

-- Owner: set a product's wholesale price (null: none, sold at the normal price).
create function public.pos_set_wholesale_price(p_product_id uuid, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can set wholesale prices.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;
  if p_price is not null and (p_price < 0 or p_price > 100000000) then
    raise exception 'Enter a wholesale price from GH₵ 0.' using errcode = '22023';
  end if;
  insert into public.product_wholesale_prices (product_id, price, updated_at, updated_by)
  values (p_product_id, p_price, now(), auth.uid())
  on conflict (product_id) do update set price = excluded.price, updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke execute on function public.pos_set_wholesale_price(uuid, integer) from public, anon;
grant execute on function public.pos_set_wholesale_price(uuid, integer) to authenticated;

create function public.pos_complete_sale(
  p_items jsonb, p_customer_id uuid, p_discount integer, p_method text, p_delivery jsonb, p_payments jsonb,
  -- Wholesale: items with a wholesale price are sold at it (owner and discount staff only).
  p_wholesale boolean,
  p_cash_received integer default null, p_note text default null
)
returns table(sale_id uuid, code text, total integer, change_given integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record; v_lines integer; v_found integer; v_subtotal integer; v_total integer; v_sale_id uuid; v_code text;
  v_item_id uuid; v_left integer; v_change integer; v_split_sum integer; v_cash_part integer := 0; v_pay record;
  v_sold jsonb; v_basket jsonb; v_fee integer := 0; v_included boolean := false; v_address text; v_phone text;
begin
  if not private.is_member() then
    raise exception 'Sign in again to sell.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The basket is empty.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'momo', 'bank', 'later', 'split') then
    raise exception 'Choose how the customer pays.' using errcode = '22023';
  end if;
  if p_discount is null or p_discount < 0 then
    raise exception 'The discount can''t be below zero.' using errcode = '22023';
  end if;
  if p_discount > 0 and not private.can_give_discounts() then
    raise exception 'You are not allowed to give discounts. Ask the owner.' using errcode = '42501';
  end if;
  if p_wholesale and not private.can_give_discounts() then
    raise exception 'You are not allowed to sell at wholesale prices. Ask the owner.' using errcode = '42501';
  end if;
  if p_method = 'later' and p_customer_id is null then
    raise exception 'Choose the customer who will pay later.' using errcode = '22023';
  end if;
  if p_delivery is not null then
    v_fee := coalesce((p_delivery ->> 'fee')::integer, 0);
    v_included := coalesce((p_delivery ->> 'included')::boolean, false);
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
  -- Lines as sold: one per item and choice.
  select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'choice', x.choice, 'qty', x.qty) order by x.variant_id, x.choice)
  into v_sold
  from (
    select i.variant_id, private.pick_choice(i.variant_id, i.choice) as choice, sum(i.qty)::integer as qty
    from jsonb_to_recordset(p_items) as i (variant_id uuid, qty integer, choice text)
    group by 1, 2
  ) x;
  -- One entry per stock entry, for the shelf.
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
  select count(*), count(v.id), coalesce(sum(case when p_wholesale and w.price is not null then w.price else coalesce(v.price_override, p.price) end * b.qty), 0)
  into v_lines, v_found, v_subtotal
  from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
  left join public.product_variants v on v.id = b.variant_id and not v.retired
  left join public.products p on p.id = v.product_id
  left join public.product_wholesale_prices w on w.product_id = v.product_id;
  if v_found <> v_lines then
    raise exception 'An item in the basket is no longer sold. Remove it and try again.' using errcode = 'P0002';
  end if;
  if p_discount > v_subtotal then
    raise exception 'The discount is more than the sale.' using errcode = '22023';
  end if;
  -- The discount is on the items; the delivery fee comes on top unless it is in the price.
  if v_included and v_fee > v_subtotal - p_discount then
    raise exception 'The delivery fee can''t be more than the total when it is in the price.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + case when v_included then 0 else v_fee end;
  -- Check the shelf before taking a sale number, so a refused sale leaves no gap.
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
  -- Paid several ways: checked before the sale takes a number.
  if p_method = 'split' then
    if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) = 0 then
      raise exception 'Say how much is paid each way.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_payments) e
      where coalesce(e ->> 'method', '') not in ('cash', 'momo', 'bank')
         or coalesce(e ->> 'amount', '') !~ '^[0-9]{1,9}$' or (e ->> 'amount')::integer <= 0
    ) then
      raise exception 'Each part needs a way to pay and an amount above GH₵ 0.' using errcode = '22023';
    end if;
    if (select count(*) <> count(distinct e ->> 'method') from jsonb_array_elements(p_payments) e) then
      raise exception 'Put each way of paying only once.' using errcode = '22023';
    end if;
    select sum((e ->> 'amount')::integer), coalesce(sum((e ->> 'amount')::integer) filter (where e ->> 'method' = 'cash'), 0)
    into v_split_sum, v_cash_part
    from jsonb_array_elements(p_payments) e;
    if v_split_sum > v_total then
      raise exception 'The parts add up to more than the total.' using errcode = '22023';
    end if;
    if v_split_sum < v_total and p_customer_id is null then
      raise exception 'Choose the customer who will pay the rest later.' using errcode = '22023';
    end if;
    if v_cash_part > 0 then
      if p_cash_received is not null and p_cash_received < v_cash_part then
        raise exception 'The cash received is less than the cash part.' using errcode = '22023';
      end if;
      v_change := coalesce(p_cash_received, v_cash_part) - v_cash_part;
    end if;
  end if;
  insert into public.sales (source, status, customer_id, subtotal, discount, total, note, completed_at, delivery_included, wholesale)
  values ('shop', 'completed', p_customer_id, v_subtotal + case when v_included then 0 else v_fee end, p_discount, v_total,
          nullif(btrim(p_note), ''), now(), v_included and v_fee > 0, coalesce(p_wholesale, false))
  returning id, sales.code into v_sale_id, v_code;
  for v_line in
    select b.variant_id, b.qty, b.choice, p.name as product_name, case when p_wholesale and w.price is not null then w.price else coalesce(v.price_override, p.price) end as unit_price,
           -- The retail price when sold for less at wholesale, for "given off" in Reports.
           case when p_wholesale and w.price is not null and w.price < coalesce(v.price_override, p.price)
                then coalesce(v.price_override, p.price) end as list_price,
           c.cost_price
    from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer, choice text)
    join public.product_variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
    left join public.product_wholesale_prices w on w.product_id = v.product_id
    left join public.variant_costs c on c.variant_id = v.id
    order by p.name, b.choice nulls first
  loop
    insert into public.sale_items (sale_id, variant_id, product_name, option_values, unit_price, qty, line_total, list_price)
    values (v_sale_id, v_line.variant_id, v_line.product_name, v_line.choice, v_line.unit_price, v_line.qty, v_line.unit_price * v_line.qty,
            v_line.list_price)
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
      insert into public.stock_movements (variant_id, qty_change, kind, sale_id) values (v_line.variant_id, -v_line.qty, 'sale', v_sale_id);
    exception when sqlstate 'TV001' then
      select on_hand into v_left from public.stock_levels where variant_id = v_line.variant_id;
      raise exception 'Only % left of %.', greatest(v_left, 0), v_line.product_name using errcode = 'TV001', detail = v_line.variant_id::text;
    end;
  end loop;
  if p_delivery is not null then
    perform private.add_delivery(v_sale_id, v_fee, v_address, p_delivery ->> 'name', v_phone, p_delivery ->> 'note');
  end if;
  if p_method = 'split' then
    -- One payment per way, in the order given (items and delivery are split by the payments trigger).
    for v_pay in
      select e ->> 'method' as method, (e ->> 'amount')::integer as amount
      from jsonb_array_elements(p_payments) with ordinality as t(e, n)
      order by t.n
    loop
      insert into public.payments (sale_id, method, amount, cash_received, change_given)
      values (v_sale_id, v_pay.method::public.payment_method, v_pay.amount,
              case when v_pay.method = 'cash' then v_pay.amount + v_change end,
              case when v_pay.method = 'cash' then v_change end);
    end loop;
  elsif p_method <> 'later' and v_total > 0 then
    insert into public.payments (sale_id, method, amount, cash_received, change_given)
    values (v_sale_id, p_method::public.payment_method, v_total,
      case when p_method = 'cash' then v_total + v_change end,
      case when p_method = 'cash' then v_change end);
  end if;
  return query select v_sale_id, v_code, v_total, v_change;
end;
$$;

create function public.pos_create_invoice(
  p_items jsonb, p_customer_id uuid, p_discount integer, p_delivery jsonb, p_valid_until date,
  -- Wholesale prices for items that have one (owner and discount staff only).
  p_wholesale boolean,
  p_note text default null
)
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
  v_included boolean := false;
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
  if p_wholesale and not private.can_give_discounts() then
    raise exception 'You are not allowed to sell at wholesale prices. Ask the owner.' using errcode = '42501';
  end if;
  if p_valid_until is null or p_valid_until < current_date or p_valid_until > current_date + 365 then
    raise exception 'Choose a "valid until" date from today to a year ahead.' using errcode = '22023';
  end if;
  if p_delivery is not null then
    v_fee := coalesce((p_delivery ->> 'fee')::integer, 0);
    v_included := coalesce((p_delivery ->> 'included')::boolean, false);
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
  select count(*), count(v.id), coalesce(sum(case when p_wholesale and w.price is not null then w.price else coalesce(v.price_override, p.price) end * b.qty), 0)
  into v_lines, v_found, v_subtotal
  from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer)
  left join public.product_variants v on v.id = b.variant_id and not v.retired
  left join public.products p on p.id = v.product_id
  left join public.product_wholesale_prices w on w.product_id = v.product_id;
  if v_found <> v_lines then
    raise exception 'An item in the basket is no longer sold. Remove it and try again.' using errcode = 'P0002';
  end if;
  if p_discount > v_subtotal then
    raise exception 'The discount is more than the items.' using errcode = '22023';
  end if;
  if v_included and v_fee > v_subtotal - p_discount then
    raise exception 'The delivery fee can''t be more than the total when it is in the price.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + case when v_included then 0 else v_fee end;

  -- Fee in the price: subtotal holds the items' part only (the lines less the
  -- fee), so total = subtotal - discount + fee still holds.
  insert into public.invoices (customer_id, subtotal, discount, delivery_fee, delivery_address, delivery_name,
                               delivery_phone, delivery_note, total, valid_until, note, delivery_included, wholesale)
  values (p_customer_id, v_subtotal - case when v_included then v_fee else 0 end, p_discount, v_fee, v_address,
          left(nullif(btrim(p_delivery ->> 'name'), ''), 100), v_phone,
          left(nullif(btrim(p_delivery ->> 'note'), ''), 300),
          v_total, p_valid_until, left(nullif(btrim(p_note), ''), 300), v_included and v_fee > 0, coalesce(p_wholesale, false))
  returning id, invoices.code into v_id, v_code;

  insert into public.invoice_items (invoice_id, variant_id, product_name, option_values, unit_price, qty, line_total)
  select v_id, b.variant_id, p.name, b.choice,
         case when p_wholesale and w.price is not null then w.price else coalesce(v.price_override, p.price) end, b.qty, case when p_wholesale and w.price is not null then w.price else coalesce(v.price_override, p.price) end * b.qty
  from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer, choice text)
  join public.product_variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  left join public.product_wholesale_prices w on w.product_id = v.product_id
  order by p.name, b.choice nulls first;

  return query select v_id, v_code, v_total;
end;
$$;

-- The earlier signatures: the same sale or invoice, at retail prices.
create or replace function public.pos_complete_sale(
  p_items jsonb, p_customer_id uuid, p_discount integer, p_method text, p_delivery jsonb, p_payments jsonb,
  p_cash_received integer default null, p_note text default null
)
returns table(sale_id uuid, code text, total integer, change_given integer)
language sql
security definer
set search_path = ''
as $$
  select * from public.pos_complete_sale(p_items, p_customer_id, p_discount, p_method, p_delivery, p_payments, false, p_cash_received, p_note);
$$;

create or replace function public.pos_create_invoice(p_items jsonb, p_customer_id uuid, p_discount integer, p_delivery jsonb, p_valid_until date, p_note text default null::text)
returns table(invoice_id uuid, code text, total integer)
language sql
security definer
set search_path = ''
as $$
  select * from public.pos_create_invoice(p_items, p_customer_id, p_discount, p_delivery, p_valid_until, false, p_note);
$$;

revoke execute on function
  public.pos_complete_sale(jsonb, uuid, integer, text, jsonb, jsonb, boolean, integer, text),
  public.pos_create_invoice(jsonb, uuid, integer, jsonb, date, boolean, text)
from public, anon;
grant execute on function
  public.pos_complete_sale(jsonb, uuid, integer, text, jsonb, jsonb, boolean, integer, text),
  public.pos_create_invoice(jsonb, uuid, integer, jsonb, date, boolean, text)
to authenticated;

create or replace function public.pos_report_overview(p_from timestamptz, p_to timestamptz)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v json;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can see reports.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Choose a start date before the end date.' using errcode = '22023';
  end if;

  with s as (
    select sa.id, sa.source, sa.total, sa.discount, sa.created_by, sa.wholesale,
      coalesce((select sum(i.line_total) from public.sale_items i where i.sale_id = sa.id and i.kind = 'delivery'), 0) as delivery,
      coalesce((select sum(i.qty) from public.sale_items i where i.sale_id = sa.id and i.kind = 'item'), 0) as qty
    from public.sales sa
    where sa.status = 'completed'
      and coalesce(sa.completed_at, sa.created_at) >= p_from and coalesce(sa.completed_at, sa.created_at) < p_to
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
    select re.refund_total,
      (select coalesce(sum(ri.qty * coalesce(c.unit_cost, vc.cost_price)), 0)
       from public.return_items ri
       left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
       left join public.variant_costs vc on vc.variant_id = ri.variant_id and ri.sale_item_id is null
       where ri.return_id = re.id and ri.back_on_shelf)::bigint as cost_back
    from public.returns re
    where re.created_at >= p_from and re.created_at < p_to
  ),
  stock as (
    select r.on_hand, r.price, vc.cost_price, r.stock_state
    from public.pos_stock_rows r
    left join public.variant_costs vc on vc.variant_id = r.variant_id
  )
  select json_build_object(
    'sales', json_build_object(
      'count', (select count(*) from s),
      'items', (select coalesce(sum(s.total - s.delivery), 0) from s),
      'qty', (select coalesce(sum(s.qty), 0) from s),
      'discount', (select coalesce(sum(s.discount), 0) from s),
      'delivery', (select coalesce(sum(s.delivery), 0) from s),
      'deliveries', (select count(*) from s where exists (select 1 from public.deliveries d where d.sale_id = s.id)),
      'shop', (select coalesce(sum(s.total - s.delivery), 0) from s where s.source = 'shop'),
      'website', (select coalesce(sum(s.total - s.delivery), 0) from s where s.source = 'website'),
      'imported', (select coalesce(sum(s.total - s.delivery), 0) from s where s.source = 'import'),
      'profit', ((select coalesce(sum(s.total - s.delivery - coalesce(sc.cost, 0)), 0) from s left join s_cost sc on sc.sale_id = s.id)
                 - (select coalesce(sum(ret.refund_total - ret.cost_back), 0) from ret)),
      'missing_costs', (select coalesce(sum(sc.missing), 0) from s_cost sc),
      'wholesale_count', (select count(*) from s where s.wholesale),
      'wholesale_items', (select coalesce(sum(s.total - s.delivery), 0) from s where s.wholesale),
      'retail_items', (select coalesce(sum(s.total - s.delivery), 0) from s where not s.wholesale),
      'wholesale_off', (select coalesce(sum((i.list_price - i.unit_price) * i.qty), 0) from public.sale_items i
                        join s on s.id = i.sale_id where s.wholesale and i.list_price is not null),
      'cancelled_count', (select count(*) from public.sales x where x.status in ('voided', 'cancelled') and x.source <> 'website'
                            and x.created_at >= p_from and x.created_at < p_to),
      'cancelled_value', (select coalesce(sum(x.total), 0) from public.sales x where x.status in ('voided', 'cancelled') and x.source <> 'website'
                            and x.created_at >= p_from and x.created_at < p_to)
    ),
    'by_staff', coalesce((
      select json_agg(json_build_object('user_id', t.created_by, 'count', t.n, 'total', t.total) order by t.total desc)
      from (select s.created_by, count(*) as n, sum(s.total) as total from s where s.source = 'shop' group by s.created_by) t
    ), '[]'::json),
    'money_in', coalesce((
      select json_object_agg(t.method, t.amount)
      from (select p.method, sum(p.amount) as amount from public.payments p
            where p.paid_at >= p_from and p.paid_at < p_to group by p.method) t
    ), '{}'::json),
    'refunds_out', coalesce((
      select json_object_agg(t.method, t.amount)
      from (select p.method, sum(p.amount) as amount from public.refund_payments p
            where p.paid_at >= p_from and p.paid_at < p_to group by p.method) t
    ), '{}'::json),
    'suppliers_out', coalesce((
      select json_object_agg(t.method, t.amount)
      from (select p.method, sum(p.amount) as amount from public.purchase_payments p
            where p.paid_at >= p_from and p.paid_at < p_to group by p.method) t
    ), '{}'::json),
    'purchases', json_build_object(
      'count', (select count(*) from public.purchases p where p.status <> 'cancelled' and p.created_at >= p_from and p.created_at < p_to),
      'total', (select coalesce(sum(p.total), 0) from public.purchases p where p.status <> 'cancelled' and p.created_at >= p_from and p.created_at < p_to)
    ),
    'returns', json_build_object(
      'count', (select count(*) from ret),
      'total', (select coalesce(sum(ret.refund_total), 0) from ret)
    ),
    'invoices', json_build_object(
      'count', (select count(*) from public.invoices i where i.created_at >= p_from and i.created_at < p_to),
      'total', (select coalesce(sum(i.total), 0) from public.invoices i where i.created_at >= p_from and i.created_at < p_to),
      'sold', (select count(*) from public.invoices i where i.status = 'sold' and i.created_at >= p_from and i.created_at < p_to)
    ),
    'customers_new', (select count(*) from public.customers c where c.created_at >= p_from and c.created_at < p_to),
    'now', json_build_object(
      'customers_owe', (select coalesce(sum(l.owed), 0) from public.pos_sales_list l),
      'customers_owing', (select count(distinct coalesce(l.customer_id::text, l.id::text)) from public.pos_sales_list l where l.owed > 0),
      'suppliers_owed', (select coalesce(sum(l.owed), 0) from public.pos_purchases_list l),
      'stock_units', (select coalesce(sum(stock.on_hand), 0) from stock where stock.on_hand > 0),
      'stock_cost', (select coalesce(sum(stock.on_hand::bigint * stock.cost_price), 0) from stock where stock.on_hand > 0),
      'stock_price', (select coalesce(sum(stock.on_hand::bigint * stock.price), 0) from stock where stock.on_hand > 0),
      'stock_no_cost', (select count(*) from stock where stock.on_hand > 0 and stock.cost_price is null),
      'out_of_stock', (select count(*) from stock where stock.stock_state = 'out'),
      'low_stock', (select count(*) from stock where stock.stock_state = 'low'),
      'recount', (select count(*) from stock where stock.stock_state = 'recount'),
      'invoices_open', (select count(*) from public.invoices i where i.status = 'open' and i.valid_until >= current_date),
      'invoices_open_total', (select coalesce(sum(i.total), 0) from public.invoices i where i.status = 'open' and i.valid_until >= current_date),
      'deliveries_waiting', (select count(*) from public.deliveries d join public.sales x on x.id = d.sale_id
                             where d.status <> 'delivered' and x.status not in ('voided', 'cancelled'))
    )
  ) into v;
  return v;
end;
$$;

-- Products with their wholesale price (appended column).
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
  p.choices,
  w.price as wholesale_price
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.stock_levels s on s.variant_id = v.id
left join public.product_wholesale_prices w on w.product_id = p.id
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

-- The Sales list: whether a sale was wholesale (appended).
create or replace view public.pos_sales_list
with (security_invoker = true)
as
select
  s.id, s.code, s.source, s.status, s.created_at, s.created_by, s.total, s.discount, s.order_id,
  s.customer_id, c.name as customer_name, c.phone as customer_phone,
  coalesce(p.paid, 0)::integer as paid,
  case when s.status in ('voided', 'cancelled') then 0
       else greatest(s.total - coalesce(p.paid, 0), 0) end::integer as owed,
  coalesce(d.delivery, 0)::integer as delivery,
  nullif(btrim(dl.rider), '') as rider,
  dl.address as delivery_address,
  p.methods as payment_methods,
  coalesce(p.delivery_paid, 0)::integer as delivery_paid,
  s.delivery_included,
  s.wholesale
from public.sales s
left join public.customers c on c.id = s.customer_id
left join (
  select sale_id, sum(amount) as paid, string_agg(distinct method::text, ',' order by method::text) as methods,
    sum(delivery_amount) as delivery_paid
  from public.payments group by sale_id
) p on p.sale_id = s.id
left join (select sale_id, sum(line_total) as delivery from public.sale_items where kind = 'delivery' group by sale_id) d
  on d.sale_id = s.id
left join public.deliveries dl on dl.sale_id = s.id;

-- The Sales list's cards: as pos_records_totals for sales, with the
-- Retail / Wholesale filter (null: both).
create function public.pos_sales_totals(p_search text, p_from timestamptz, p_to timestamptz, p_rider text, p_wholesale boolean)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select lower(btrim(coalesce(p_search, ''))) as term, lower(btrim(coalesce(p_rider, ''))) as rider),
  rows as (
    select l.total, l.paid, l.owed, l.status::text as status, l.delivery, l.delivery_paid
    from public.pos_sales_list l, q
    where (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0)
      and (q.rider = '' or lower(l.rider) = q.rider)
      and (p_wholesale is null or l.wholesale = p_wholesale)
  )
  select json_build_object(
    'total', coalesce(sum(total) filter (where status not in ('voided', 'cancelled')), 0),
    'paid', coalesce(sum(paid) filter (where status not in ('voided', 'cancelled')), 0),
    'owed', coalesce(sum(owed), 0),
    'delivery', coalesce(sum(delivery) filter (where status not in ('voided', 'cancelled')), 0),
    'delivery_paid', coalesce(sum(delivery_paid) filter (where status not in ('voided', 'cancelled')), 0),
    'counts', json_build_object(
      'sales', (select count(*) from public.sales),
      'purchases', (select count(*) from public.purchases),
      'returns', (select count(*) from public.returns)
    )
  )
  from rows;
$$;

revoke execute on function public.pos_sales_totals(text, timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.pos_sales_totals(text, timestamptz, timestamptz, text, boolean) to authenticated;
