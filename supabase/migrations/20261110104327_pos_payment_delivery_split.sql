-- Stock & POS: what part of each sale payment is for the delivery fee, so the
-- Sales list can show money paid for items and for delivery apart.
--
-- payments.delivery_amount: of this payment, how much is for delivery (the
-- rest is for items). A payment that leaves it out is split items first (a
-- full payment at the till or Mark as paid covers the whole fee); a part
-- payment from Mark paid carries the cashier's split, checked against what is
-- still owed on each.

alter table public.payments add column delivery_amount integer;

-- Existing payments: items first, in the order they were taken. (Every
-- delivery sale paid so far was paid in one go, so this is exact.)
update public.payments p
set delivery_amount = x.delivery_part
from (
  select pay.id,
    greatest(0, least(pay.amount,
      sum(pay.amount) over (partition by pay.sale_id order by pay.paid_at, pay.id) - (s.total - coalesce(f.fee, 0))
    ))::integer as delivery_part
  from public.payments pay
  join public.sales s on s.id = pay.sale_id
  left join (select sale_id, sum(line_total) as fee from public.sale_items where kind = 'delivery' group by sale_id) f
    on f.sale_id = pay.sale_id
) x
where x.id = p.id;

update public.payments set delivery_amount = 0 where delivery_amount is null;

alter table public.payments
  alter column delivery_amount set not null,
  add constraint payments_delivery_amount check (delivery_amount >= 0 and delivery_amount <= amount);

-- "GH₵ 1,250.50" / "GH₵ 30" for messages.
create function private.cedis(p_pesewas integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'GH₵ ' || regexp_replace(to_char(p_pesewas / 100.0, 'FM999,999,990.00'), '\.00$', '');
$$;

-- Fills in or checks the delivery part of a new sale payment.
create function private.payment_delivery_part()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_fee integer;
  v_paid integer;
  v_delivery_paid integer;
  v_items_owed integer;
  v_delivery_owed integer;
begin
  if new.sale_id is null then
    new.delivery_amount := coalesce(new.delivery_amount, 0);
    return new;
  end if;

  select s.total,
    coalesce((select sum(i.line_total) from public.sale_items i where i.sale_id = s.id and i.kind = 'delivery'), 0)
  into v_total, v_fee
  from public.sales s where s.id = new.sale_id;

  select coalesce(sum(p.amount), 0), coalesce(sum(p.delivery_amount), 0)
  into v_paid, v_delivery_paid
  from public.payments p where p.sale_id = new.sale_id;

  v_delivery_owed := greatest(v_fee - v_delivery_paid, 0);
  v_items_owed := greatest((v_total - v_fee) - (v_paid - v_delivery_paid), 0);

  if new.delivery_amount is null then
    -- Items first: only money beyond what the items still need goes to delivery.
    new.delivery_amount := least(v_delivery_owed, greatest(new.amount - v_items_owed, 0));
  else
    if new.delivery_amount < 0 or new.delivery_amount > new.amount then
      raise exception 'The part for delivery must be between GH₵ 0 and the amount paid.' using errcode = '22023';
    end if;
    if new.delivery_amount > v_delivery_owed then
      raise exception 'Only % of the delivery fee is still owed.', private.cedis(v_delivery_owed) using errcode = '22023';
    end if;
    if new.amount - new.delivery_amount > v_items_owed then
      raise exception 'Only % is still owed for the items, so put the rest down for delivery.', private.cedis(v_items_owed)
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger payments_delivery_part
before insert on public.payments
for each row execute function private.payment_delivery_part();

-- Mark paid with the cashier's split (null: items first). A new required
-- argument, so the five-argument version stays as it was for older screens.
create function public.pos_record_payment(
  p_kind text,
  p_id uuid,
  p_method text,
  p_amount integer,
  p_delivery_amount integer,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owed integer;
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
  perform 1 from public.sales where id = p_id and status = 'completed' for update;
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
  return v_owed - p_amount;
end;
$$;

-- The Sales list: delivery money paid so far (items paid = paid - delivery_paid).
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
  coalesce(p.delivery_paid, 0)::integer as delivery_paid
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

-- The list's cards: delivery money paid, beside what was paid in all.
create or replace function public.pos_records_totals(p_kind text, p_search text, p_from timestamptz, p_to timestamptz, p_rider text)
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
    where p_kind = 'sales'
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0)
      and (q.rider = '' or lower(l.rider) = q.rider)
    union all
    select l.total, l.paid, l.owed, l.status::text, 0, 0
    from public.pos_purchases_list l, q
    where p_kind = 'purchases'
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(l.supplier_name), q.term) > 0)
    union all
    select l.total, l.paid, l.owed, 'completed', 0, 0
    from public.pos_returns_list l, q
    where p_kind = 'returns'
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0
           or strpos(lower(coalesce(l.sale_code, '')), q.term) > 0)
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

revoke execute on function private.cedis(integer), private.payment_delivery_part() from public, anon, authenticated;
revoke execute on function public.pos_record_payment(text, uuid, text, integer, integer, text) from public, anon;
grant execute on function public.pos_record_payment(text, uuid, text, integer, integer, text) to authenticated;

-- Mark as paid on a website order: as before, but the payment is taken after
-- the delivery fee is on the sale, so the whole fee counts as delivery paid.
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

  if p_delivery is not null then
    -- The fee goes on the sale as a "Delivery" line; the order keeps its items total.
    update public.sales s set subtotal = s.subtotal + v_fee, total = s.total + v_fee where s.id = p_sale_id;
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
