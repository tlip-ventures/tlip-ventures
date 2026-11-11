-- Stock & POS: reserved orders (kept for the customer to pick up or have
-- delivered later, with an optional agreed date).
--
-- Reserving at the till makes an ordinary sale marked reserved:
-- * paid in full: the sale completes and its items come off the shop shelf
--   at once (put aside for the customer);
-- * part paid or nothing paid: the sale is 'reserved' and its items stay on
--   the shelf. The last payment takes them off (and completes the sale).
--   Collecting it, or sending it out with a rider, also takes them off; if
--   money is still owed the sale goes On hold, as a held sale does.
-- A reservation is open until it is collected (or its delivery delivered).

alter table public.sales
  add column reserved boolean not null default false,
  add column reserved_until date,
  add column collected_at timestamptz,
  add column collected_by uuid;

create index sales_reserved_open_idx on public.sales (reserved_until) where reserved and collected_at is null;

-- While a reservation is made, its sale lines don't take stock (they stay on
-- the shelf until it is paid in full or handed over).
do $m$
declare
  v_def text := pg_get_functiondef('private.apply_stock_movement()'::regprocedure);
  v_old text := '  new.location_id := coalesce(new.location_id, v_shop);';
  v_new text := '  if new.kind = ''sale'' and current_setting(''tv.keep_on_shelf'', true) = ''on'' then
    return null;
  end if;
  new.location_id := coalesce(new.location_id, v_shop);';
begin
  if strpos(v_def, v_old) = 0 then
    raise exception 'apply_stock_movement has changed: its place line was not found.';
  end if;
  execute replace(v_def, v_old, v_new);
end
$m$;

-- Take a reserved sale's items off the shop shelf.
create function private.take_reserved_stock(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_left integer;
begin
  for v_line in
    select i.variant_id, sum(i.qty)::integer as qty, max(i.product_name) as product_name
    from public.sale_items i
    where i.sale_id = p_sale_id and i.variant_id is not null and i.kind = 'item'
    group by i.variant_id
    order by i.variant_id
  loop
    begin
      insert into public.stock_movements (variant_id, qty_change, kind, sale_id, reason)
      values (v_line.variant_id, -v_line.qty, 'sale', p_sale_id, 'Reserved order');
    exception when sqlstate 'TV001' then
      select on_hand into v_left from public.stock_levels where variant_id = v_line.variant_id;
      raise exception 'Only % of % in the shop. Move some from the warehouse or recount first.',
        greatest(coalesce(v_left, 0), 0), v_line.product_name
        using errcode = 'TV001', detail = v_line.variant_id::text;
    end;
  end loop;
end;
$$;

-- A reservation not paid in full leaves the shop (collected or sent out):
-- its items come off the shelf; still owed, it is held like any held sale.
create function private.hand_over_reserved(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owed integer;
begin
  perform private.take_reserved_stock(p_sale_id);
  select owed into v_owed from public.pos_sales_list where id = p_sale_id;
  update public.sales
  set status = case when coalesce(v_owed, 0) > 0 then 'on_hold'::public.sale_status else 'completed'::public.sale_status end,
      completed_at = case when coalesce(v_owed, 0) > 0 then null else now() end
  where id = p_sale_id and status = 'reserved';
end;
$$;

-- "Reserve for later" at the till: the sale is made and checked exactly like
-- a till sale, for a customer, with what is paid now (any amount).
create function public.pos_reserve_sale(
  p_items jsonb,
  p_customer_id uuid,
  p_discount integer,
  p_delivery jsonb,
  p_payments jsonb,
  p_wholesale boolean,
  p_cash_received integer,
  p_note text,
  p_reserved_until date default null
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
  v_short record;
begin
  if not private.is_member() then
    raise exception 'Sign in again to sell.' using errcode = '42501';
  end if;
  if p_customer_id is null then
    raise exception 'Choose the customer the order is kept for.' using errcode = '22023';
  end if;
  if p_reserved_until is not null and p_reserved_until < (now() at time zone 'utc')::date then
    raise exception 'Pick today or a later date.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The basket is empty.' using errcode = '22023';
  end if;

  -- Only what the shop has can be reserved (part-paid ones stay on the shelf,
  -- so this is checked here rather than by taking the stock).
  select b.qty, coalesce(s.on_hand, 0) as on_hand, p.name into v_short
  from (
    select x.variant_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x (variant_id uuid, qty integer)
    group by x.variant_id
  ) b
  join public.product_variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  left join public.stock_levels s on s.variant_id = b.variant_id
  where coalesce(s.on_hand, 0) < b.qty
  limit 1;
  if found then
    raise exception 'Only % of % in the shop.', greatest(v_short.on_hand, 0), v_short.name using errcode = 'TV001';
  end if;

  perform set_config('tv.keep_on_shelf', 'on', true);
  select * into v_sale
  from public.pos_complete_sale(p_items, p_customer_id, p_discount, case when v_parts then 'split' else 'later' end,
                                p_delivery, case when v_parts then p_payments end, p_wholesale, p_cash_received, p_note);
  perform set_config('tv.keep_on_shelf', '', true);

  select coalesce(sum(amount), 0)::integer into v_paid from public.payments where payments.sale_id = v_sale.sale_id;
  update public.sales set reserved = true, reserved_until = p_reserved_until where id = v_sale.sale_id;
  if v_paid >= v_sale.total then
    -- Paid in full: put aside now.
    perform private.take_reserved_stock(v_sale.sale_id);
  else
    update public.sales set status = 'reserved', completed_at = null where id = v_sale.sale_id;
  end if;
  return query select v_sale.sale_id, v_sale.code, v_sale.total, v_sale.change_given, greatest(v_sale.total - v_paid, 0);
end;
$$;

-- The customer collected a reserved order. Not paid in full: its items come
-- off the shelf now and the rest is owed (On hold).
create function public.pos_mark_collected(p_sale_id uuid)
returns public.sale_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale record;
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  select s.status, s.reserved, s.collected_at, exists (select 1 from public.deliveries d where d.sale_id = s.id) as delivered_by_rider
  into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or not v_sale.reserved then
    raise exception 'This is not a reserved order.' using errcode = '22023';
  end if;
  if v_sale.status not in ('reserved', 'completed', 'on_hold') then
    raise exception 'This order was cancelled.' using errcode = '22023';
  end if;
  if v_sale.collected_at is not null then
    raise exception 'This order was already collected.' using errcode = '22023';
  end if;
  if v_sale.delivered_by_rider then
    raise exception 'This order is delivered: update it under Deliveries.' using errcode = '22023';
  end if;
  if v_sale.status = 'reserved' then
    perform private.hand_over_reserved(p_sale_id);
  end if;
  update public.sales set collected_at = now(), collected_by = auth.uid() where id = p_sale_id;
  return (select status from public.sales where id = p_sale_id);
end;
$$;

-- Change (or clear) the agreed pickup or delivery date.
create function public.pos_set_reserved_until(p_sale_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  update public.sales set reserved_until = p_date
  where id = p_sale_id and reserved and collected_at is null and status in ('reserved', 'completed', 'on_hold');
  if not found then
    raise exception 'Only an open reserved order can get a new date.' using errcode = '22023';
  end if;
end;
$$;

-- Payments: a reserved sale takes them; its last payment takes the items off
-- the shelf and completes it. Edits the live function in place.
do $m$
declare
  v_def text := pg_get_functiondef('public.pos_record_payment(text, uuid, text, integer, integer, text)'::regprocedure);
  v_old1 text := 'where id = p_id and status in (''completed'', ''on_hold'') for update;';
  v_new1 text := 'where id = p_id and status in (''completed'', ''on_hold'', ''reserved'') for update;';
  v_old2 text := '  return v_owed - p_amount;
end;';
  v_new2 text := '  -- The last of the money for a reserved order: off the shelf, put aside for the customer.
  if v_status = ''reserved'' and v_owed - p_amount = 0 then
    perform private.take_reserved_stock(p_id);
    update public.sales set status = ''completed'', completed_at = now() where id = p_id;
  end if;
  return v_owed - p_amount;
end;';
begin
  if strpos(v_def, v_old1) = 0 or strpos(v_def, v_old2) = 0 then
    raise exception 'pos_record_payment has changed: its status lines were not found.';
  end if;
  execute replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
end
$m$;

-- Cancelling: a reserved order's items never left the shelf, so none go back.
do $m$
declare
  v_def text := pg_get_functiondef('public.pos_void_sale(uuid, text)'::regprocedure);
  v_pairs text[][] := array[
    array['declare
  v_item record;', 'declare
  v_item record;
  v_was public.sale_status;'],
    array['  perform 1 from public.sales where id = p_sale_id and status in (''completed'', ''on_hold'') for update;',
          '  select status into v_was from public.sales where id = p_sale_id and status in (''completed'', ''on_hold'', ''reserved'') for update;'],
    array['raise exception ''Only a completed or held sale can be cancelled.''',
          'raise exception ''Only a completed, held or reserved sale can be cancelled.'''],
    array['    where sale_id = p_sale_id and variant_id is not null
', '    where sale_id = p_sale_id and variant_id is not null and v_was <> ''reserved''
']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if strpos(v_def, v_pairs[i][1]) = 0 then
      raise exception 'pos_void_sale has changed: part % was not found.', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$m$;

-- Deliveries: a reserved order can be sent out; when it goes out its items
-- leave the shelf, and once delivered it counts as collected.
do $m$
declare
  v_def text := pg_get_functiondef('public.pos_update_delivery(uuid, text, text, text, text)'::regprocedure);
  v_old1 text := 's.status in (''completed'', ''on_hold'')';
  v_new1 text := 's.status in (''completed'', ''on_hold'', ''reserved'')';
  v_old2 text := '  v_status := p_status::public.delivery_status;
';
  v_new2 text := '  v_status := p_status::public.delivery_status;
  if v_status in (''out'', ''delivered'') and exists (select 1 from public.sales where id = p_sale_id and status = ''reserved'') then
    perform private.hand_over_reserved(p_sale_id);
  end if;
  update public.sales
  set collected_at = case when v_status = ''delivered'' then coalesce(collected_at, now()) end,
      collected_by = case when v_status = ''delivered'' then coalesce(collected_by, auth.uid()) end
  where id = p_sale_id and reserved;
';
begin
  if strpos(v_def, v_old1) = 0 or strpos(v_def, v_old2) = 0 then
    raise exception 'pos_update_delivery has changed: its lines were not found.';
  end if;
  execute replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
end
$m$;

-- The Sales list knows about reservations.
do $m$
declare
  v_def text := pg_get_viewdef('public.pos_sales_list'::regclass);
  v_old text := '    s.wholesale
   FROM';
  v_new text := '    s.wholesale,
    s.reserved,
    s.reserved_until,
    s.collected_at,
    dl.status AS delivery_status
   FROM';
begin
  if strpos(v_def, v_old) = 0 then
    raise exception 'pos_sales_list has changed: its last column was not found.';
  end if;
  execute 'create or replace view public.pos_sales_list with (security_invoker = true) as ' || replace(v_def, v_old, v_new);
end
$m$;

revoke execute on function private.take_reserved_stock(uuid), private.hand_over_reserved(uuid) from public, anon, authenticated;
revoke execute on function
  public.pos_reserve_sale(jsonb, uuid, integer, jsonb, jsonb, boolean, integer, text, date),
  public.pos_mark_collected(uuid),
  public.pos_set_reserved_until(uuid, date)
from public, anon;
grant execute on function
  public.pos_reserve_sale(jsonb, uuid, integer, jsonb, jsonb, boolean, integer, text, date),
  public.pos_mark_collected(uuid),
  public.pos_set_reserved_until(uuid, date)
to authenticated;
