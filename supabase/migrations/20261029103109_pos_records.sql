-- Stock & POS, phase 3: suppliers and purchases (owner only), payments taken
-- after the sale ("Mark paid") or paid to suppliers ("Record payment"),
-- customer returns with refunds, and cancelling a sale.
--
-- Payments against purchases and refunds live in their own tables, so "only
-- the owner sees supplier money" is a plain table rule.

-- ---------------------------------------------------------------------------
-- Suppliers and purchases
-- ---------------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone text check (phone is null or phone ~ '^233[235][0-9]{8}$'),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index suppliers_name_idx on public.suppliers (lower(btrim(name)));

-- ordered: on its way, not on the shelf yet; received: counted in.
create type public.purchase_status as enum ('ordered', 'received', 'cancelled');

-- PR_1001, PR_1002… like the old system; the data import moves it on.
create sequence public.purchase_code_seq start with 1001;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PR_' || nextval('public.purchase_code_seq')),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  status public.purchase_status not null default 'ordered',
  total integer not null check (total >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  received_at timestamptz,
  received_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz
);

alter sequence public.purchase_code_seq owned by public.purchases.code;

create index purchases_created_idx on public.purchases (created_at desc);
create index purchases_supplier_idx on public.purchases (supplier_id);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  option_values text,
  unit_cost integer not null check (unit_cost >= 0),
  qty integer not null check (qty between 1 and 100000),
  line_total integer not null,
  constraint purchase_items_line_total check (line_total = unit_cost * qty)
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_variant_idx on public.purchase_items (variant_id);

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete restrict,
  method public.payment_method not null,
  amount integer not null check (amount > 0),
  note text check (note is null or char_length(note) <= 300),
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index purchase_payments_purchase_idx on public.purchase_payments (purchase_id);

-- ---------------------------------------------------------------------------
-- Returns
-- ---------------------------------------------------------------------------

create sequence public.return_code_seq start with 1001;

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('RT_' || nextval('public.return_code_seq')),
  -- The sale it came from, when the customer has the receipt.
  sale_id uuid references public.sales (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete restrict,
  -- What the shop owes the customer back (may be less than the goods' value).
  refund_total integer not null check (refund_total >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter sequence public.return_code_seq owned by public.returns.code;

create index returns_created_idx on public.returns (created_at desc);
create index returns_sale_idx on public.returns (sale_id) where sale_id is not null;

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id) on delete cascade,
  sale_item_id uuid references public.sale_items (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  option_values text,
  unit_price integer not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 999),
  line_total integer not null,
  -- false for damaged goods: refunded, but not back on the shelf count.
  back_on_shelf boolean not null,
  constraint return_items_line_total check (line_total = unit_price * qty)
);

create index return_items_return_idx on public.return_items (return_id);
create index return_items_sale_item_idx on public.return_items (sale_item_id) where sale_item_id is not null;

create table public.refund_payments (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id) on delete restrict,
  method public.payment_method not null,
  amount integer not null check (amount > 0),
  note text check (note is null or char_length(note) <= 300),
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index refund_payments_return_idx on public.refund_payments (return_id);

-- ---------------------------------------------------------------------------
-- Cancelling a sale, and what moved stock
-- ---------------------------------------------------------------------------

alter table public.sales
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id) on delete set null,
  add column void_reason text check (void_reason is null or char_length(void_reason) <= 300);

alter table public.stock_movements
  add column purchase_id uuid references public.purchases (id) on delete restrict,
  add column return_id uuid references public.returns (id) on delete restrict;

create index stock_movements_purchase_idx on public.stock_movements (purchase_id) where purchase_id is not null;
create index stock_movements_return_idx on public.stock_movements (return_id) where return_id is not null;

-- ---------------------------------------------------------------------------
-- Lists (security_invoker, so RLS decides who sees what)
-- ---------------------------------------------------------------------------

create view public.pos_sales_list
with (security_invoker = true)
as
select
  s.id, s.code, s.source, s.status, s.created_at, s.created_by, s.total, s.discount, s.order_id,
  s.customer_id, c.name as customer_name, c.phone as customer_phone,
  coalesce(p.paid, 0)::integer as paid,
  case when s.status in ('voided', 'cancelled') then 0
       else greatest(s.total - coalesce(p.paid, 0), 0) end::integer as owed
from public.sales s
left join public.customers c on c.id = s.customer_id
left join (select sale_id, sum(amount) as paid from public.payments group by sale_id) p on p.sale_id = s.id;

create view public.pos_purchases_list
with (security_invoker = true)
as
select
  pu.id, pu.code, pu.status, pu.created_at, pu.created_by, pu.received_at, pu.total,
  pu.supplier_id, su.name as supplier_name,
  coalesce(p.paid, 0)::integer as paid,
  case when pu.status = 'cancelled' then 0
       else greatest(pu.total - coalesce(p.paid, 0), 0) end::integer as owed
from public.purchases pu
join public.suppliers su on su.id = pu.supplier_id
left join (select purchase_id, sum(amount) as paid from public.purchase_payments group by purchase_id) p
  on p.purchase_id = pu.id;

create view public.pos_returns_list
with (security_invoker = true)
as
select
  r.id, r.code, r.created_at, r.created_by, r.refund_total as total, r.sale_id, s.code as sale_code,
  coalesce(r.customer_id, s.customer_id) as customer_id, c.name as customer_name,
  coalesce(p.paid, 0)::integer as paid,
  greatest(r.refund_total - coalesce(p.paid, 0), 0)::integer as owed,
  (select coalesce(sum(i.qty), 0) from public.return_items i where i.return_id = r.id)::integer as items,
  (select coalesce(sum(i.qty), 0) from public.return_items i where i.return_id = r.id and i.back_on_shelf)::integer as restocked
from public.returns r
left join public.sales s on s.id = r.sale_id
left join public.customers c on c.id = coalesce(r.customer_id, s.customer_id)
left join (select return_id, sum(amount) as paid from public.refund_payments group by return_id) p on p.return_id = r.id;

-- The summary strip and tab counts on Sales / Purchases / Returns. p_search
-- matches the reference or the customer / supplier name. Cancelled records
-- don't count towards money.
create function public.pos_records_summary(p_kind text, p_search text default null)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select lower(btrim(coalesce(p_search, ''))) as term),
  rows as (
    select l.total, l.paid, l.owed, l.status::text as status
    from public.pos_sales_list l, q
    where p_kind = 'sales'
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0)
    union all
    select l.total, l.paid, l.owed, l.status::text
    from public.pos_purchases_list l, q
    where p_kind = 'purchases'
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(l.supplier_name), q.term) > 0)
    union all
    select l.total, l.paid, l.owed, 'completed'
    from public.pos_returns_list l, q
    where p_kind = 'returns'
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0
           or strpos(lower(coalesce(l.sale_code, '')), q.term) > 0)
  )
  select json_build_object(
    'total', coalesce(sum(total) filter (where status not in ('voided', 'cancelled')), 0),
    'paid', coalesce(sum(paid) filter (where status not in ('voided', 'cancelled')), 0),
    'owed', coalesce(sum(owed), 0),
    'counts', json_build_object(
      'sales', (select count(*) from public.sales),
      'purchases', (select count(*) from public.purchases),
      'returns', (select count(*) from public.returns)
    )
  )
  from rows;
$$;

-- ---------------------------------------------------------------------------
-- Suppliers and purchases (owner only)
-- ---------------------------------------------------------------------------

create function public.pos_create_supplier(p_name text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can add suppliers.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the supplier''s name.' using errcode = '22023';
  end if;
  if exists (select 1 from public.suppliers where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'There is already a supplier called %.', btrim(p_name) using errcode = '23505';
  end if;
  insert into public.suppliers (name, phone) values (btrim(p_name), p_phone) returning id into v_id;
  return v_id;
end;
$$;

-- Puts a purchase's items on the shelf and makes their cost the latest cost.
create function private.receive_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  perform 1 from public.purchases where id = p_purchase_id and status = 'ordered' for update;
  if not found then
    raise exception 'This purchase is already received or cancelled.' using errcode = '22023';
  end if;

  for v_item in
    select i.variant_id, sum(i.qty)::integer as qty, max(i.unit_cost) as unit_cost
    from public.purchase_items i
    where i.purchase_id = p_purchase_id and i.variant_id is not null
    group by i.variant_id
    order by i.variant_id
  loop
    insert into public.stock_movements (variant_id, qty_change, kind, purchase_id)
    values (v_item.variant_id, v_item.qty, 'purchase', p_purchase_id);

    insert into public.variant_costs (variant_id, cost_price, updated_by)
    values (v_item.variant_id, v_item.unit_cost, auth.uid())
    on conflict (variant_id) do update
      set cost_price = excluded.cost_price, updated_by = excluded.updated_by;
  end loop;

  update public.purchases
  set status = 'received', received_at = now(), received_by = auth.uid()
  where id = p_purchase_id;
end;
$$;

revoke execute on function private.receive_purchase(uuid) from public, anon, authenticated;

-- Records a purchase from a supplier.
-- p: {"supplier_id": uuid, "received": bool, "note": text,
--     "lines": [{"variant_id": uuid, "qty": int, "unit_cost": int}],
--     "payment": {"method": "cash|momo|bank", "amount": int} | null}
create function public.pos_save_purchase(p jsonb)
returns table (purchase_id uuid, code text)
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
  left join public.product_variants v on v.id = l.variant_id;
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
  select v_id, l.variant_id, pr.name, nullif(concat_ws(' / ', v.option1_value, v.option2_value), ''), l.unit_cost, l.qty,
         l.unit_cost * l.qty
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

create function public.pos_receive_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can receive purchases.' using errcode = '42501';
  end if;
  perform private.receive_purchase(p_purchase_id);
end;
$$;

-- Cancels a purchase that hasn't arrived yet. Received purchases stay: their
-- stock is already on the shelf (correct it with a recount instead).
create function public.pos_cancel_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can cancel purchases.' using errcode = '42501';
  end if;
  update public.purchases set status = 'cancelled', cancelled_at = now()
  where id = p_purchase_id and status = 'ordered';
  if not found then
    raise exception 'Only a purchase that hasn''t arrived yet can be cancelled.' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments after the fact
-- ---------------------------------------------------------------------------

-- p_kind: sale ("Mark paid", anyone), purchase ("Record payment", owner) or
-- refund (money handed back on a return, anyone). Never more than is owed.
-- Returns what is still owed afterwards.
create function public.pos_record_payment(p_kind text, p_id uuid, p_method text, p_amount integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owed integer;
begin
  if p_method is null or p_method not in ('cash', 'momo', 'bank') then
    raise exception 'Choose how the money was paid.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount paid.' using errcode = '22023';
  end if;

  if p_kind = 'sale' then
    if not private.is_member() then
      raise exception 'Sign in again.' using errcode = '42501';
    end if;
    perform 1 from public.sales where id = p_id and status = 'completed' for update;
    if not found then
      raise exception 'This sale can''t take payments.' using errcode = '22023';
    end if;
    select owed into v_owed from public.pos_sales_list where id = p_id;
    if p_amount > v_owed then
      raise exception 'That is more than the % still owed.', v_owed using errcode = '22023';
    end if;
    insert into public.payments (sale_id, method, amount, cash_received, change_given, note)
    values (p_id, p_method::public.payment_method, p_amount,
            case when p_method = 'cash' then p_amount end, case when p_method = 'cash' then 0 end,
            nullif(btrim(p_note), ''));
  elsif p_kind = 'purchase' then
    if not private.is_owner() then
      raise exception 'Only the owner can record supplier payments.' using errcode = '42501';
    end if;
    perform 1 from public.purchases where id = p_id and status <> 'cancelled' for update;
    if not found then
      raise exception 'This purchase can''t take payments.' using errcode = '22023';
    end if;
    select owed into v_owed from public.pos_purchases_list where id = p_id;
    if p_amount > v_owed then
      raise exception 'That is more than the % still owed.', v_owed using errcode = '22023';
    end if;
    insert into public.purchase_payments (purchase_id, method, amount, note)
    values (p_id, p_method::public.payment_method, p_amount, nullif(btrim(p_note), ''));
  elsif p_kind = 'refund' then
    if not private.is_member() then
      raise exception 'Sign in again.' using errcode = '42501';
    end if;
    perform 1 from public.returns where id = p_id for update;
    if not found then
      raise exception 'This return no longer exists.' using errcode = 'P0002';
    end if;
    select owed into v_owed from public.pos_returns_list where id = p_id;
    if p_amount > v_owed then
      raise exception 'That is more than the % still to refund.', v_owed using errcode = '22023';
    end if;
    insert into public.refund_payments (return_id, method, amount, note)
    values (p_id, p_method::public.payment_method, p_amount, nullif(btrim(p_note), ''));
  else
    raise exception 'Unknown payment.' using errcode = '22023';
  end if;

  return v_owed - p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelling a sale (owner): puts the items back on the shelf
-- ---------------------------------------------------------------------------

create function public.pos_void_sale(p_sale_id uuid, p_reason text)
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
  perform 1 from public.sales where id = p_sale_id and status = 'completed' for update;
  if not found then
    raise exception 'Only a completed sale can be cancelled.' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- Returns
-- ---------------------------------------------------------------------------

-- p: {"sale_id": uuid|null, "customer_id": uuid|null, "note": text,
--     "lines": [{"sale_item_id": uuid|null, "variant_id": uuid|null, "qty": int, "back_on_shelf": bool}],
--     "refund_total": int, "refund": {"method", "amount"}|null}
-- Lines from a sale use the price it was sold at and can't exceed what was
-- sold less what was already returned. Lines without a sale use today's price.
create function public.pos_create_return(p jsonb)
returns table (return_id uuid, code text)
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
    select v_id, v.id, pr.name, nullif(concat_ws(' / ', v.option1_value, v.option2_value), ''),
           coalesce(v.price_override, pr.price), l.qty, coalesce(v.price_override, pr.price) * l.qty, l.back_on_shelf
    from jsonb_to_recordset(p -> 'lines') as l (variant_id uuid, qty integer, back_on_shelf boolean)
    join public.product_variants v on v.id = l.variant_id
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

  for v_line in
    select variant_id, sum(qty)::integer as qty from public.return_items
    where return_items.return_id = v_id and back_on_shelf and variant_id is not null
    group by variant_id order by variant_id
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

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.suppliers, public.purchases, public.purchase_items, public.purchase_payments,
  public.returns, public.return_items, public.refund_payments,
  public.pos_sales_list, public.pos_purchases_list, public.pos_returns_list
from anon, authenticated;
revoke all on sequence public.purchase_code_seq, public.return_code_seq from anon, authenticated;

grant select on public.suppliers, public.purchases, public.purchase_items, public.purchase_payments,
  public.returns, public.return_items, public.refund_payments,
  public.pos_sales_list, public.pos_purchases_list, public.pos_returns_list
to authenticated;

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_payments enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.refund_payments enable row level security;

create policy "Owner reads suppliers" on public.suppliers for select to authenticated
  using ((select private.is_owner()));
create policy "Owner reads purchases" on public.purchases for select to authenticated
  using ((select private.is_owner()));
create policy "Owner reads purchase lines" on public.purchase_items for select to authenticated
  using ((select private.is_owner()));
create policy "Owner reads supplier payments" on public.purchase_payments for select to authenticated
  using ((select private.is_owner()));
create policy "Shop users read returns" on public.returns for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read returned items" on public.return_items for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read refunds" on public.refund_payments for select to authenticated
  using ((select private.is_member()));

revoke execute on function
  public.pos_records_summary(text, text),
  public.pos_create_supplier(text, text),
  public.pos_save_purchase(jsonb),
  public.pos_receive_purchase(uuid),
  public.pos_cancel_purchase(uuid),
  public.pos_record_payment(text, uuid, text, integer, text),
  public.pos_void_sale(uuid, text),
  public.pos_create_return(jsonb)
from public, anon, authenticated;

grant execute on function
  public.pos_records_summary(text, text),
  public.pos_create_supplier(text, text),
  public.pos_save_purchase(jsonb),
  public.pos_receive_purchase(uuid),
  public.pos_cancel_purchase(uuid),
  public.pos_record_payment(text, uuid, text, integer, text),
  public.pos_void_sale(uuid, text),
  public.pos_create_return(jsonb)
to authenticated;
