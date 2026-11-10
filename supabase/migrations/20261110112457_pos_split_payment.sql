-- Stock & POS: a till sale paid several ways (e.g. part Mobile Money, the
-- rest cash; or part now, the rest owed). pos_complete_sale gets a method
-- "split" with the amounts in p_payments, saved with the sale in one go;
-- change is worked out on the cash part. A new required argument, so the
-- seven-argument version stays and now hands over to this one.
--
-- p_method: cash | momo | bank | later | split
-- p_payments (split only): [{"method": "momo", "amount": 5000}, {"method": "cash", "amount": 2000}];
--   what they don't cover is owed (needs a customer). null otherwise.
-- p_cash_received: cash, or the cash part of a split: what was handed over, for change.

create function public.pos_complete_sale(
  p_items jsonb, p_customer_id uuid, p_discount integer, p_method text, p_delivery jsonb, p_payments jsonb,
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
  insert into public.sales (source, status, customer_id, subtotal, discount, total, note, completed_at, delivery_included)
  values ('shop', 'completed', p_customer_id, v_subtotal + case when v_included then 0 else v_fee end, p_discount, v_total,
          nullif(btrim(p_note), ''), now(), v_included and v_fee > 0)
  returning id, sales.code into v_sale_id, v_code;
  for v_line in
    select b.variant_id, b.qty, b.choice, p.name as product_name, coalesce(v.price_override, p.price) as unit_price, c.cost_price
    from jsonb_to_recordset(v_sold) as b (variant_id uuid, qty integer, choice text)
    join public.product_variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
    left join public.variant_costs c on c.variant_id = v.id
    order by p.name, b.choice nulls first
  loop
    insert into public.sale_items (sale_id, variant_id, product_name, option_values, unit_price, qty, line_total)
    values (v_sale_id, v_line.variant_id, v_line.product_name, v_line.choice, v_line.unit_price, v_line.qty, v_line.unit_price * v_line.qty)
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

-- The earlier signature: the same sale, never split.
create or replace function public.pos_complete_sale(p_items jsonb, p_customer_id uuid, p_discount integer, p_method text, p_delivery jsonb, p_cash_received integer default null::integer, p_note text default null::text)
returns table(sale_id uuid, code text, total integer, change_given integer)
language sql
security definer
set search_path = ''
as $$
  select * from public.pos_complete_sale(p_items, p_customer_id, p_discount, p_method, p_delivery, null::jsonb, p_cash_received, p_note);
$$;

revoke execute on function public.pos_complete_sale(jsonb, uuid, integer, text, jsonb, jsonb, integer, text) from public, anon;
grant execute on function public.pos_complete_sale(jsonb, uuid, integer, text, jsonb, jsonb, integer, text) to authenticated;
