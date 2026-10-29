-- Stock & POS phase 5: website sync.
--
-- 1. Every basket sent from the shop site (orders) is mirrored as a sale with
--    the same code (TV-1042), source 'website':
--      awaiting_whatsapp -> Ordered, confirmed -> Pending,
--      not_sent / cancelled -> Cancelled.
--    Website orders never touch the shelf. "Mark as paid" in /pos completes
--    the sale: it checks the shelf, takes the items off it, records the
--    payment and sets the order to paid.
-- 2. While settings.website_stock_sync is on, product_variants.in_stock and
--    stock_qty follow the shelf count (on_hand > 0) and can't be set by hand.
--    It stays off until the old system's stock has been imported.
--
-- The shop's checkout (create_order) is unchanged. Mirroring a new order runs
-- at the end of its transaction and never fails the checkout: if it can't
-- make the sale, pos_sync_website_orders() makes it later.

alter table public.settings
  add column website_stock_sync boolean not null default false;

-- ---------------------------------------------------------------------------
-- Orders -> sales
-- ---------------------------------------------------------------------------

-- The sale status for an order status (null: the order is past the sale stage).
create function private.sale_status_for_order(p_status public.order_status)
returns public.sale_status
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'awaiting_whatsapp' then 'ordered'::public.sale_status
    when 'confirmed' then 'pending'::public.sale_status
    when 'cancelled' then 'cancelled'::public.sale_status
    when 'not_sent' then 'cancelled'::public.sale_status
  end;
$$;

-- Makes the sale for one order if it has none. Returns the sale id.
create function private.ensure_order_sale(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_sale_id uuid;
  v_customer_id uuid;
  v_note text;
begin
  select id into v_sale_id from public.sales where order_id = p_order_id;
  if found then
    return v_sale_id;
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or private.sale_status_for_order(v_order.status) is null then
    return null;
  end if;
  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    return null;
  end if;

  -- One customer per phone number; an existing customer keeps their name.
  insert into public.customers (name, phone, created_by)
  values (btrim(v_order.customer_name), v_order.phone, null)
  on conflict (phone) do nothing
  returning id into v_customer_id;
  if v_customer_id is null then
    select id into v_customer_id from public.customers where phone = v_order.phone;
  end if;

  v_note := left(nullif(concat_ws(' · ',
    'Location: ' || nullif(btrim(v_order.location), ''),
    'Note: ' || nullif(btrim(v_order.notes), '')), ''), 300);

  insert into public.sales (code, source, status, customer_id, order_id, subtotal, discount, total, note, created_by, created_at)
  values (v_order.order_code, 'website', private.sale_status_for_order(v_order.status), v_customer_id, v_order.id,
          v_order.items_total, 0, v_order.items_total, v_note, null, v_order.created_at)
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, variant_id, product_name, option_values, unit_price, qty, line_total)
  select v_sale_id, i.variant_id, i.product_name, i.option_values, i.unit_price, i.qty, i.line_total
  from public.order_items i
  where i.order_id = p_order_id
  order by i.id;

  return v_sale_id;
end;
$$;

-- New order: mirror it when its transaction ends (the lines are saved after
-- the order). Never fails the checkout.
create function private.mirror_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.ensure_order_sale(new.id);
  exception when others then
    raise warning 'Could not make the sale for order %: %', new.order_code, sqlerrm;
  end;
  return null;
end;
$$;

create constraint trigger orders_mirror_to_sale
  after insert on public.orders
  deferrable initially deferred
  for each row execute function private.mirror_new_order();

-- Order status changed (in /admin or by the not_sent job): follow it.
create function private.follow_order_status()
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
  elsif v_sale.status = 'completed' and v_target is not null then
    raise exception '% is paid in Stock and sales. Cancel the sale there instead.', new.order_code
      using errcode = 'TV002';
  end if;
  return null;
end;
$$;

create trigger orders_follow_status
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function private.follow_order_status();

-- A paid website sale cancelled in /pos cancels its order too.
create function private.cancel_order_of_voided_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set status = 'cancelled'
  where id = new.order_id and status not in ('cancelled', 'not_sent');
  return null;
end;
$$;

create trigger sales_cancel_order
  after update of status on public.sales
  for each row when (new.order_id is not null and new.status = 'voided' and old.status is distinct from new.status)
  execute function private.cancel_order_of_voided_sale();

-- Open orders that have no sale yet (a mirror that failed): make them. Called
-- when the dashboard and sales list load.
create function public.pos_sync_website_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_made integer := 0;
begin
  if not private.is_member() then
    return 0;
  end if;
  for v_order_id in
    select o.id from public.orders o
    where o.status in ('awaiting_whatsapp', 'confirmed')
      and not exists (select 1 from public.sales s where s.order_id = o.id)
    order by o.created_at
    limit 50
  loop
    if private.ensure_order_sale(v_order_id) is not null then
      v_made := v_made + 1;
    end if;
  end loop;
  return v_made;
end;
$$;

-- "Mark as paid": the customer paid for a website basket. Checks the shelf,
-- takes the items off it, notes their cost, records the payment in full and
-- sets the order to paid. A basket that expired (not_sent) can still be paid.
create function public.pos_mark_order_paid(p_sale_id uuid, p_method text, p_cash_received integer default null)
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
  select status into v_order_status from public.orders where id = v_sale.order_id for update;
  if not (v_sale.status in ('ordered', 'pending') or (v_sale.status = 'cancelled' and v_order_status = 'not_sent')) then
    raise exception '% can''t be marked as paid (it is %).', v_sale.code, v_sale.status using errcode = '22023';
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

  update public.sales set status = 'completed', completed_at = now() where id = p_sale_id;
  update public.orders set status = 'paid' where id = v_sale.order_id;

  return query select v_sale.code, v_sale.total, v_change;
end;
$$;

-- Cancel a website basket that won't be paid (from /pos). Its order is
-- cancelled too.
create function public.pos_cancel_website_order(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  if not private.is_member() then
    raise exception 'Sign in again.' using errcode = '42501';
  end if;
  select * into v_sale from public.sales where id = p_sale_id and source = 'website' for update;
  if not found or v_sale.status not in ('ordered', 'pending') then
    raise exception 'Only an unpaid website order can be cancelled here.' using errcode = '22023';
  end if;
  update public.sales set status = 'cancelled' where id = p_sale_id;
  update public.orders set status = 'cancelled' where id = v_sale.order_id and status <> 'cancelled';
end;
$$;

-- ---------------------------------------------------------------------------
-- Website stock from the shelf count
-- ---------------------------------------------------------------------------

create function private.website_stock_sync_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select website_stock_sync from public.settings where id = 1), false);
$$;

-- Any write to a variant (the /admin editor, the CSV import) gets in_stock and
-- stock_qty from the shelf while the sync is on.
create function private.variant_stock_from_shelf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand integer;
begin
  if private.website_stock_sync_on() then
    select on_hand into v_on_hand from public.stock_levels where variant_id = new.id;
    new.in_stock := coalesce(v_on_hand, 0) > 0;
    new.stock_qty := greatest(coalesce(v_on_hand, 0), 0);
  end if;
  return new;
end;
$$;

create trigger product_variants_stock_from_shelf
  before insert or update on public.product_variants
  for each row execute function private.variant_stock_from_shelf();

-- The shelf count changed: pass it on to the website.
create function private.shelf_to_website()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.website_stock_sync_on() then
    update public.product_variants
    set in_stock = new.on_hand > 0, stock_qty = greatest(new.on_hand, 0)
    where id = new.variant_id
      and (in_stock is distinct from (new.on_hand > 0) or stock_qty is distinct from greatest(new.on_hand, 0));
  end if;
  return null;
end;
$$;

create trigger stock_levels_to_website
  after insert or update of on_hand on public.stock_levels
  for each row execute function private.shelf_to_website();

-- Switching the sync on brings every variant in line at once.
create function private.website_stock_sync_switched()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.website_stock_sync and not old.website_stock_sync then
    update public.product_variants v
    set in_stock = coalesce(s.on_hand, 0) > 0, stock_qty = greatest(coalesce(s.on_hand, 0), 0)
    from public.stock_levels s
    where s.variant_id = v.id;
    -- A variant without a shelf row has nothing on the shelf.
    update public.product_variants v
    set in_stock = false, stock_qty = 0
    where not exists (select 1 from public.stock_levels s where s.variant_id = v.id);
  end if;
  return null;
end;
$$;

create trigger settings_website_stock_sync
  after update of website_stock_sync on public.settings
  for each row execute function private.website_stock_sync_switched();

-- ---------------------------------------------------------------------------
-- Privileges, and the orders already open
-- ---------------------------------------------------------------------------

revoke execute on function
  private.sale_status_for_order(public.order_status), private.ensure_order_sale(uuid), private.mirror_new_order(),
  private.follow_order_status(), private.cancel_order_of_voided_sale(), private.website_stock_sync_on(),
  private.variant_stock_from_shelf(), private.shelf_to_website(), private.website_stock_sync_switched()
from public, anon, authenticated;

revoke execute on function public.pos_sync_website_orders(), public.pos_mark_order_paid(uuid, text, integer),
  public.pos_cancel_website_order(uuid)
from public, anon;
grant execute on function public.pos_sync_website_orders(), public.pos_mark_order_paid(uuid, text, integer),
  public.pos_cancel_website_order(uuid)
to authenticated;

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select id from public.orders where status in ('awaiting_whatsapp', 'confirmed') order by created_at
  loop
    perform private.ensure_order_sale(v_order_id);
  end loop;
end;
$$;
