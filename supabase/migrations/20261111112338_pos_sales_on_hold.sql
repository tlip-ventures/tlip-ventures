-- Stock & POS: sales On hold, and website orders paid in parts or several ways.
--
-- At the till, pos_hold_sale saves the basket like a sale (prices, shelf,
-- delivery) with what the customer pays now (any mix of cash, MoMo and bank,
-- or nothing) and puts it On hold for the customer: its items come off the
-- shelf at once and the rest is owed.
--
-- A website order takes pos_take_order_payment: one or more payments (any mix
-- of ways). Paid in full it is completed and the order is paid, as Mark as paid
-- did; part paid it is On hold (items off the shelf, order confirmed).
--
-- pos_record_payment now also takes payments on held sales, and a held sale
-- whose last money comes in is completed (and its website order paid). An
-- owner can cancel a held sale like a completed one (pos_void_sale: items back
-- on the shelf); deliveries and invoices work on held sales too. A held
-- website order can't be paid or cancelled from /admin: it changes in /pos.

-- Till: save the basket On hold for a customer, with what is paid now.
create function public.pos_hold_sale(
  p_items jsonb, p_customer_id uuid, p_discount integer, p_delivery jsonb, p_payments jsonb,
  p_wholesale boolean, p_cash_received integer default null, p_note text default null
)
returns table(sale_id uuid, code text, total integer, change_given integer, owed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale record;
  v_paid integer;
  v_parts boolean := jsonb_typeof(p_payments) = 'array' and jsonb_array_length(p_payments) > 0;
begin
  if not private.is_member() then
    raise exception 'Sign in again to sell.' using errcode = '42501';
  end if;
  if p_customer_id is null then
    raise exception 'Choose the customer the sale is held for.' using errcode = '22023';
  end if;
  -- The sale itself is made exactly like a till sale (and checked the same way).
  select * into v_sale
  from public.pos_complete_sale(p_items, p_customer_id, p_discount, case when v_parts then 'split' else 'later' end,
                                p_delivery, case when v_parts then p_payments end, p_wholesale, p_cash_received, p_note);
  select coalesce(sum(amount), 0)::integer into v_paid from public.payments where payments.sale_id = v_sale.sale_id;
  if v_paid >= v_sale.total then
    raise exception 'That pays it all: complete the sale instead of holding it.' using errcode = '22023';
  end if;
  update public.sales set status = 'on_hold', completed_at = null where id = v_sale.sale_id;
  return query select v_sale.sale_id, v_sale.code, v_sale.total, v_sale.change_given, v_sale.total - v_paid;
end;
$$;

-- Website order: take what the customer paid (one or more ways). In full: paid.
-- In part: On hold, the rest owed. Either way the items come off the shelf now.
create function public.pos_take_order_payment(
  p_sale_id uuid, p_payments jsonb, p_delivery jsonb default null, p_cash_received integer default null
)
returns table(code text, total integer, change_given integer, owed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_order public.orders;
  v_line record;
  v_pay record;
  v_change integer;
  v_paid integer;
  v_cash_part integer;
  v_fee integer := 0;
  v_included boolean := false;
  v_address text;
  v_phone text;
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Enter how much the customer paid.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_payments) e
    where coalesce(e ->> 'method', '') not in ('cash', 'momo', 'bank')
       or coalesce(e ->> 'amount', '') !~ '^[0-9]{1,9}$' or (e ->> 'amount')::integer <= 0) then
    raise exception 'Each part needs a way to pay and an amount above GH₵ 0.' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct e ->> 'method') from jsonb_array_elements(p_payments) e) then
    raise exception 'Put each way of paying only once.' using errcode = '22023';
  end if;
  select sum((e ->> 'amount')::integer), coalesce(sum((e ->> 'amount')::integer) filter (where e ->> 'method' = 'cash'), 0)
  into v_paid, v_cash_part from jsonb_array_elements(p_payments) e;

  select * into v_sale from public.sales where id = p_sale_id and source = 'website' for update;
  if not found then
    raise exception 'This website order no longer exists.' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_sale.order_id for update;
  if not (v_sale.status in ('ordered', 'pending') or (v_sale.status = 'cancelled' and v_order.status = 'not_sent')) then
    raise exception '% can''t take this payment (it is %).', v_sale.code, v_sale.status using errcode = '22023';
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
    if exists (select 1 from public.deliveries where deliveries.sale_id = p_sale_id) then
      raise exception 'This order already has a delivery.' using errcode = '22023';
    end if;
    if v_included and v_fee > v_sale.total then
      raise exception 'The delivery fee can''t be more than the order total when it is in the price.' using errcode = '22023';
    end if;
    v_sale.total := v_sale.total + case when v_included then 0 else v_fee end;
  end if;

  if v_paid > v_sale.total then
    raise exception 'That is more than the % to pay.', v_sale.total using errcode = '22023';
  end if;
  if v_cash_part > 0 then
    if p_cash_received is not null and p_cash_received < v_cash_part then
      raise exception 'The cash received is less than the cash part.' using errcode = '22023';
    end if;
    v_change := coalesce(p_cash_received, v_cash_part) - v_cash_part;
  end if;

  -- Lock the shelf rows in a fixed order, then check every item is there.
  perform 1 from public.stock_levels s
  where s.variant_id in (select variant_id from public.sale_items where sale_items.sale_id = p_sale_id)
  order by s.variant_id
  for update of s;

  select greatest(coalesce(s.on_hand, 0), 0) as on_hand, need.qty,
         min(i.product_name || coalesce(' (' || i.option_values || ')', '')) as name
  into v_line
  from (select variant_id, sum(qty)::integer as qty from public.sale_items
        where sale_items.sale_id = p_sale_id and variant_id is not null group by variant_id) need
  join public.sale_items i on i.sale_id = p_sale_id and i.variant_id = need.variant_id
  left join public.stock_levels s on s.variant_id = need.variant_id
  where coalesce(s.on_hand, 0) < need.qty
  group by s.on_hand, need.qty, need.variant_id
  order by 3
  limit 1;
  if found then
    raise exception 'Only % left of %. Record the delivery or recount it before taking this payment.',
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
    where sale_items.sale_id = p_sale_id and variant_id is not null
    group by variant_id order by variant_id
  loop
    insert into public.stock_movements (variant_id, qty_change, kind, sale_id)
    values (v_line.variant_id, -v_line.qty, 'sale', p_sale_id);
  end loop;

  if p_delivery is not null then
    if v_included then
      update public.sales s set delivery_included = v_fee > 0 where s.id = p_sale_id;
    else
      update public.sales s set subtotal = s.subtotal + v_fee, total = s.total + v_fee where s.id = p_sale_id;
    end if;
    perform private.add_delivery(p_sale_id, v_fee, v_address,
      coalesce(nullif(btrim(p_delivery ->> 'name'), ''), v_order.customer_name), v_phone, p_delivery ->> 'note');
  end if;

  -- One payment per way, after the fee is on the sale (the trigger splits items and delivery).
  for v_pay in
    select e ->> 'method' as method, (e ->> 'amount')::integer as amount
    from jsonb_array_elements(p_payments) with ordinality as t(e, n) order by t.n
  loop
    insert into public.payments (sale_id, method, amount, cash_received, change_given)
    values (p_sale_id, v_pay.method::public.payment_method, v_pay.amount,
            case when v_pay.method = 'cash' then v_pay.amount + v_change end,
            case when v_pay.method = 'cash' then v_change end);
  end loop;

  if v_paid = v_sale.total then
    update public.sales set status = 'completed', completed_at = now() where id = p_sale_id;
    update public.orders set status = 'paid' where id = v_sale.order_id;
  else
    update public.sales set status = 'on_hold', completed_at = null where id = p_sale_id;
    update public.orders set status = 'confirmed' where id = v_sale.order_id and status <> 'confirmed';
  end if;

  return query select v_sale.code, v_sale.total, v_change, v_sale.total - v_paid;
end;
$$;

-- Payments on completed and held sales; a held sale is completed by its last payment.
create or replace function public.pos_record_payment(
  p_kind text, p_id uuid, p_method text, p_amount integer, p_delivery_amount integer, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owed integer;
  v_status public.sale_status;
  v_order_id uuid;
begin
  if p_kind <> 'sale' then
    return public.pos_record_payment(p_kind, p_id, p_method, p_amount, p_note);
  end if;
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash', 'momo', 'bank') then
    raise exception 'Choose how the money was paid.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount paid.' using errcode = '22023';
  end if;
  select status, order_id into v_status, v_order_id from public.sales
  where id = p_id and status in ('completed', 'on_hold') for update;
  if not found then
    raise exception 'This sale can''t take payments.' using errcode = '22023';
  end if;
  select owed into v_owed from public.pos_sales_list where id = p_id;
  if p_amount > v_owed then
    raise exception 'That is more than the % still owed.', v_owed using errcode = '22023';
  end if;
  insert into public.payments (sale_id, method, amount, cash_received, change_given, note, delivery_amount)
  values (p_id, p_method::public.payment_method, p_amount,
          case when p_method = 'cash' then p_amount end, case when p_method = 'cash' then 0 end,
          nullif(btrim(p_note), ''), p_delivery_amount);
  -- The last of the money for a held sale: it is confirmed, and its website order paid.
  if v_status = 'on_hold' and v_owed - p_amount = 0 then
    update public.sales set status = 'completed', completed_at = now() where id = p_id;
    if v_order_id is not null then
      update public.orders set status = 'paid' where id = v_order_id;
    end if;
  end if;
  return v_owed - p_amount;
end;
$$;

-- Owner: cancel a completed or held sale (items back on the shelf).
create or replace function public.pos_void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can cancel a sale.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why the sale is cancelled.' using errcode = '22023';
  end if;
  perform 1 from public.sales where id = p_sale_id and status in ('completed', 'on_hold') for update;
  if not found then
    raise exception 'Only a completed or held sale can be cancelled.' using errcode = '22023';
  end if;
  if exists (select 1 from public.returns where sale_id = p_sale_id) then
    raise exception 'Items from this sale were returned. Record any other returns instead of cancelling.' using errcode = '22023';
  end if;

  for v_item in
    select variant_id, sum(qty)::integer as qty from public.sale_items
    where sale_id = p_sale_id and variant_id is not null
    group by variant_id order by variant_id
  loop
    insert into public.stock_movements (variant_id, qty_change, kind, reason, sale_id)
    values (v_item.variant_id, v_item.qty, 'sale_void', btrim(p_reason), p_sale_id);
  end loop;

  update public.sales
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_sale_id;
end;
$$;

-- Deliveries on held sales can be followed too.
create or replace function public.pos_update_delivery(p_sale_id uuid, p_status text, p_rider text default null, p_address text default null, p_note text default null)
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
  where d.sale_id = p_sale_id and s.status in ('completed', 'on_hold')
  for update of d;
  if not found then
    raise exception 'Only a delivery on a completed or held sale can be updated.' using errcode = '22023';
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

-- An invoice can be closed by a held sale as well as a completed one.
create or replace function public.pos_invoice_sold(p_invoice_id uuid, p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.invoice_status;
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  select status into v_status from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'This invoice no longer exists.' using errcode = 'P0002';
  end if;
  if v_status <> 'open' then
    raise exception 'This invoice is already closed.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sales where id = p_sale_id and status in ('completed', 'on_hold') and source = 'shop') then
    raise exception 'That sale was not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.invoices where sale_id = p_sale_id) then
    raise exception 'That sale already closed another invoice.' using errcode = '22023';
  end if;
  update public.invoices set status = 'sold', sale_id = p_sale_id, updated_at = now() where id = p_invoice_id;
end;
$$;

-- A website order's sale follows the order's status, except once money is in:
-- a held order is paid or cancelled in /pos, like a paid one.
create or replace function private.follow_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_target public.sale_status := private.sale_status_for_order(new.status);
begin
  select * into v_sale from public.sales where order_id = new.id for update;
  if not found then
    perform private.ensure_order_sale(new.id);
    return null;
  end if;

  if v_sale.status in ('ordered', 'pending', 'cancelled') then
    if v_target is null then
      -- paid / dispatched / delivered before the sale was marked paid.
      raise exception 'Mark % as paid in Stock and sales first, so its items come off the shelf.', new.order_code
        using errcode = 'TV002';
    end if;
    if v_sale.status <> v_target then
      update public.sales set status = v_target where id = v_sale.id;
    end if;
  elsif v_sale.status = 'on_hold' then
    if new.status in ('paid', 'dispatched', 'delivered') then
      raise exception '% is on hold in Stock and sales: take the rest of the payment there first.', new.order_code
        using errcode = 'TV002';
    elsif new.status in ('cancelled', 'not_sent') then
      raise exception '% is on hold in Stock and sales. Cancel the sale there instead.', new.order_code
        using errcode = 'TV002';
    end if;
  elsif v_sale.status = 'completed' and v_target is not null then
    raise exception '% is paid in Stock and sales. Cancel the sale there instead.', new.order_code
      using errcode = 'TV002';
  end if;
  return null;
end;
$$;

revoke execute on function public.pos_hold_sale(jsonb, uuid, integer, jsonb, jsonb, boolean, integer, text) from public, anon;
grant execute on function public.pos_hold_sale(jsonb, uuid, integer, jsonb, jsonb, boolean, integer, text) to authenticated;
revoke execute on function public.pos_take_order_payment(uuid, jsonb, jsonb, integer) from public, anon;
grant execute on function public.pos_take_order_payment(uuid, jsonb, jsonb, integer) to authenticated;
