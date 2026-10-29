-- Stock & POS, phase 2: customers, sales and payments for the point of sale.
--
-- A sale is saved by one function, pos_complete_sale, in one transaction: it
-- reads every price from the catalogue (never from the browser), locks the
-- shelf rows, takes the items off the shelf through stock movements (which
-- refuse to go below zero) and records the payment. "Pay later" records no
-- payment, so the sale shows as owed until it is settled.

create type public.payment_method as enum ('cash', 'momo', 'bank');

-- ordered/pending are website baskets (website sync); voided is a cancelled shop sale.
create type public.sale_status as enum ('ordered', 'pending', 'completed', 'cancelled', 'voided');
create type public.sale_source as enum ('shop', 'website', 'import');

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- 233XXXXXXXXX like orders.phone; optional, but one customer per number.
  phone text unique check (phone is null or phone ~ '^233[235][0-9]{8}$'),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index customers_name_idx on public.customers (lower(name));

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------

-- SL_1001, SL_1002… like the old system. The data import moves this on past
-- the highest imported sale number.
create sequence public.sale_code_seq start with 1001;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('SL_' || nextval('public.sale_code_seq')),
  source public.sale_source not null default 'shop',
  status public.sale_status not null default 'completed',
  customer_id uuid references public.customers (id) on delete restrict,
  -- The website order a basket came from (website sync).
  order_id uuid unique references public.orders (id) on delete restrict,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint sales_total check (discount <= subtotal and total = subtotal - discount)
);

alter sequence public.sale_code_seq owned by public.sales.code;

create index sales_created_idx on public.sales (created_at desc);
create index sales_status_created_idx on public.sales (status, created_at desc);
create index sales_customer_idx on public.sales (customer_id) where customer_id is not null;

-- Lines copy the name, options and price at the moment of sale, so later
-- catalogue edits never change past sales.
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  option_values text,
  unit_price integer not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 999),
  line_total integer not null,
  constraint sale_items_line_total check (line_total = unit_price * qty)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_variant_idx on public.sale_items (variant_id);

-- What each item cost the shop when it was sold, for profit. Owner only, so it
-- lives apart from sale_items, which staff read.
create table public.sale_item_costs (
  sale_item_id uuid primary key references public.sale_items (id) on delete cascade,
  unit_cost integer not null check (unit_cost >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- Purchases and refunds join here in the next phase.
  sale_id uuid references public.sales (id) on delete restrict,
  method public.payment_method not null,
  amount integer not null check (amount > 0),
  -- Cash only: what the customer handed over, and the change given back.
  cash_received integer,
  change_given integer,
  note text check (note is null or char_length(note) <= 300),
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint payments_target check (sale_id is not null),
  constraint payments_cash check (
    (method = 'cash' and cash_received is not null and change_given = cash_received - amount and change_given >= 0)
    or (method <> 'cash' and cash_received is null and change_given is null)
  )
);

create index payments_sale_idx on public.payments (sale_id) where sale_id is not null;
create index payments_paid_idx on public.payments (paid_at desc);

alter table public.stock_movements
  add column sale_id uuid references public.sales (id) on delete restrict;
create index stock_movements_sale_idx on public.stock_movements (sale_id) where sale_id is not null;

alter table public.settings
  add column receipt_footer text check (receipt_footer is null or char_length(receipt_footer) <= 300);

-- What each sale has been paid and what is still owed ("Customers owe you").
create view public.pos_sale_balances
with (security_invoker = true)
as
select
  s.id as sale_id,
  s.total,
  coalesce(sum(p.amount), 0)::integer as paid,
  (s.total - coalesce(sum(p.amount), 0))::integer as owed
from public.sales s
left join public.payments p on p.sale_id = s.id
group by s.id;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Adds a customer at the till. A number already on file is refused with the
-- name it belongs to, so the same person isn't added twice.
create function public.pos_create_customer(p_name text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing text;
begin
  if not private.is_member() then
    raise exception 'Sign in again to add customers.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the customer''s name.' using errcode = '22023';
  end if;
  if p_phone is not null then
    select name into v_existing from public.customers where phone = p_phone;
    if found then
      raise exception 'This number belongs to %. Search for them instead.', v_existing using errcode = '23505';
    end if;
  end if;
  insert into public.customers (name, phone) values (btrim(p_name), p_phone) returning id into v_id;
  return v_id;
end;
$$;

-- Saves a sale from the till.
-- p_items: [{"variant_id": uuid, "qty": integer}, ...]; prices come from the catalogue.
-- p_method: cash | momo | bank | later. p_cash_received: cash only (null = exact).
create function public.pos_complete_sale(
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
  v_total := v_subtotal - p_discount;

  if p_method = 'cash' then
    if p_cash_received is not null and p_cash_received < v_total then
      raise exception 'The cash received is less than the total.' using errcode = '22023';
    end if;
    v_change := coalesce(p_cash_received, v_total) - v_total;
  end if;

  insert into public.sales (source, status, customer_id, subtotal, discount, total, note, completed_at)
  values ('shop', 'completed', p_customer_id, v_subtotal, p_discount, v_total, nullif(btrim(p_note), ''), now())
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

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.customers, public.sales, public.sale_items, public.sale_item_costs,
  public.payments, public.pos_sale_balances
from anon, authenticated;
revoke all on sequence public.sale_code_seq from anon, authenticated;

grant select on public.customers, public.sales, public.sale_items, public.payments,
  public.pos_sale_balances, public.sale_item_costs
to authenticated;

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_item_costs enable row level security;
alter table public.payments enable row level security;

create policy "Shop users read customers" on public.customers for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read sales" on public.sales for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read sale lines" on public.sale_items for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read payments" on public.payments for select to authenticated
  using ((select private.is_member()));
create policy "Owner reads sale costs" on public.sale_item_costs for select to authenticated
  using ((select private.is_owner()));

revoke execute on function
  public.pos_create_customer(text, text),
  public.pos_complete_sale(jsonb, uuid, integer, text, integer, text)
from public, anon, authenticated;

grant execute on function
  public.pos_create_customer(text, text),
  public.pos_complete_sale(jsonb, uuid, integer, text, integer, text)
to authenticated;
