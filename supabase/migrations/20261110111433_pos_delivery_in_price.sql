-- Stock & POS: a delivery fee that is already in the price agreed.
--
-- Some customers agree one price with delivery in it. At the till, on an
-- invoice and at Mark as paid, the fee can now be "already in the price": the
-- total stays as it is and the fee is part of it, so the sale still shows
-- money for items and for delivery apart (items = total - fee). The sale
-- keeps its "Delivery" line; only the total is not raised. Flagged on the
-- sale and the invoice (delivery_included) for receipts and screens.
--
-- Sales: subtotal stays the items (total = subtotal - discount, as the table
-- requires). Invoices: subtotal holds the items' part only, so the existing
-- check total = subtotal - discount + delivery_fee still holds.

alter table public.sales add column delivery_included boolean not null default false;
alter table public.invoices add column delivery_included boolean not null default false;

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
  -- The fee is already in the price agreed: it is carved out of the total, not added.
  v_included boolean := false;
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
  -- The discount is on the items; the delivery fee comes on top, unless it is
  -- already in the price: then the total stays and the fee is part of it.
  if v_included and v_fee > v_subtotal - p_discount then
    raise exception 'The delivery fee can''t be more than the total when it is in the price.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + case when v_included then 0 else v_fee end;

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

  insert into public.sales (source, status, customer_id, subtotal, discount, total, note, completed_at, delivery_included)
  values ('shop', 'completed', p_customer_id, v_subtotal + case when v_included then 0 else v_fee end, p_discount, v_total,
          nullif(btrim(p_note), ''), now(), v_included and v_fee > 0)
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
  if v_included and v_fee > v_subtotal - p_discount then
    raise exception 'The delivery fee can''t be more than the total when it is in the price.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + case when v_included then 0 else v_fee end;

  -- Fee in the price: subtotal holds the items' part only (the lines less the
  -- fee), so total = subtotal - discount + fee still holds.
  insert into public.invoices (customer_id, subtotal, discount, delivery_fee, delivery_address, delivery_name,
                               delivery_phone, delivery_note, total, valid_until, note, delivery_included)
  values (p_customer_id, v_subtotal - case when v_included then v_fee else 0 end, p_discount, v_fee, v_address,
          left(nullif(btrim(p_delivery ->> 'name'), ''), 100), v_phone,
          left(nullif(btrim(p_delivery ->> 'note'), ''), 300),
          v_total, p_valid_until, left(nullif(btrim(p_note), ''), 300), v_included and v_fee > 0)
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

create or replace function public.pos_mark_order_paid(p_sale_id uuid, p_method text, p_delivery jsonb, p_cash_received integer default null)
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
  v_included boolean := false;
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
    v_included := coalesce((p_delivery ->> 'included')::boolean, false);
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
    if v_included and v_fee > v_sale.total then
      raise exception 'The delivery fee can''t be more than the order total when it is in the price.' using errcode = '22023';
    end if;
    -- Fee in the price agreed: the customer pays the order total, part of it delivery.
    v_sale.total := v_sale.total + case when v_included then 0 else v_fee end;
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

  if p_delivery is not null then
    -- The fee goes on the sale as a "Delivery" line; the order keeps its items total.
    if v_included then
      update public.sales s set delivery_included = v_fee > 0 where s.id = p_sale_id;
    else
      update public.sales s set subtotal = s.subtotal + v_fee, total = s.total + v_fee where s.id = p_sale_id;
    end if;
    perform private.add_delivery(p_sale_id, v_fee, v_address,
      coalesce(nullif(btrim(p_delivery ->> 'name'), ''), v_order.customer_name), v_phone, p_delivery ->> 'note');
  end if;

  -- Paid in full, fee included: the payment comes after the fee is on the sale.
  if v_sale.total > 0 then
    insert into public.payments (sale_id, method, amount, cash_received, change_given)
    values (p_sale_id, p_method::public.payment_method, v_sale.total,
            case when p_method = 'cash' then coalesce(p_cash_received, v_sale.total) end, v_change);
  end if;

  update public.sales set status = 'completed', completed_at = now() where id = p_sale_id;
  update public.orders set status = 'paid' where id = v_sale.order_id;

  return query select v_sale.code, v_sale.total, v_change;
end;
$$;

-- The Sales list: whether the fee was in the price (appended).
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
  s.delivery_included
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
