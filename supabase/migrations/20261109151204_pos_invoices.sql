-- Invoices: what a customer would pay, given before they buy (INV_1001…).
-- An invoice holds prices only: it takes nothing off the shelf. When the
-- customer comes to buy, the till loads it and sells it at today's prices
-- (pos_complete_sale as always), then marks the invoice sold.

create sequence public.invoice_code_seq start with 1001;

create type public.invoice_status as enum ('open', 'sold', 'cancelled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('INV_' || nextval('public.invoice_code_seq')),
  status public.invoice_status not null default 'open',
  customer_id uuid references public.customers (id) on delete restrict,
  -- Items before the discount.
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  -- A delivery: the fee (on top, never discounted) and where it goes.
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  delivery_address text check (delivery_address is null or char_length(delivery_address) <= 300),
  delivery_name text check (delivery_name is null or char_length(delivery_name) <= 100),
  delivery_phone text check (delivery_phone is null or delivery_phone ~ '^233[235][0-9]{8}$'),
  delivery_note text check (delivery_note is null or char_length(delivery_note) <= 300),
  total integer not null,
  valid_until date not null,
  note text check (note is null or char_length(note) <= 300),
  -- The sale it became.
  sale_id uuid unique references public.sales (id) on delete restrict,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_total check (discount <= subtotal and total = subtotal - discount + delivery_fee),
  constraint invoices_sold check ((status = 'sold') = (sale_id is not null)),
  constraint invoices_delivery check (delivery_fee = 0 or delivery_address is not null)
);

alter sequence public.invoice_code_seq owned by public.invoices.code;

create index invoices_created_idx on public.invoices (created_at desc);
create index invoices_status_created_idx on public.invoices (status, created_at desc);
create index invoices_customer_idx on public.invoices (customer_id) where customer_id is not null;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  option_values text,
  unit_price integer not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 999),
  line_total integer not null,
  constraint invoice_items_total check (line_total = unit_price * qty)
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id);
create index invoice_items_variant_idx on public.invoice_items (variant_id) where variant_id is not null;

create view public.pos_invoices_list
with (security_invoker = true)
as
select
  i.id, i.code, i.status, i.created_at, i.created_by, i.valid_until, i.subtotal, i.discount,
  i.delivery_fee, i.total, i.sale_id, s.code as sale_code,
  i.customer_id, c.name as customer_name, c.phone as customer_phone,
  (select coalesce(sum(it.qty), 0)::integer from public.invoice_items it where it.invoice_id = i.id) as items
from public.invoices i
left join public.customers c on c.id = i.customer_id
left join public.sales s on s.id = i.sale_id;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

create function public.pos_create_invoice(
  p_items jsonb,
  p_customer_id uuid,
  p_discount integer,
  -- null: the customer collects; or {"fee", "address", "name", "phone", "note"}.
  p_delivery jsonb,
  p_valid_until date,
  p_note text default null
)
returns table (invoice_id uuid, code text, total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket jsonb;
  v_lines integer;
  v_found integer;
  v_subtotal integer;
  v_fee integer := 0;
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

  -- Prices come from the catalogue, never from the browser.
  select count(*), count(v.id), coalesce(sum(coalesce(v.price_override, p.price) * b.qty), 0)
  into v_lines, v_found, v_subtotal
  from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
  left join public.product_variants v on v.id = b.variant_id
  left join public.products p on p.id = v.product_id;
  if v_found <> v_lines then
    raise exception 'An item in the basket is no longer sold. Remove it and try again.' using errcode = 'P0002';
  end if;
  if p_discount > v_subtotal then
    raise exception 'The discount is more than the items.' using errcode = '22023';
  end if;
  v_total := v_subtotal - p_discount + v_fee;

  insert into public.invoices (customer_id, subtotal, discount, delivery_fee, delivery_address, delivery_name,
                               delivery_phone, delivery_note, total, valid_until, note)
  values (p_customer_id, v_subtotal, p_discount, v_fee, v_address,
          left(nullif(btrim(p_delivery ->> 'name'), ''), 100), v_phone,
          left(nullif(btrim(p_delivery ->> 'note'), ''), 300),
          v_total, p_valid_until, left(nullif(btrim(p_note), ''), 300))
  returning id, invoices.code into v_id, v_code;

  insert into public.invoice_items (invoice_id, variant_id, product_name, option_values, unit_price, qty, line_total)
  select v_id, b.variant_id, p.name,
         nullif(concat_ws(' / ', v.option1_value, v.option2_value), ''),
         coalesce(v.price_override, p.price), b.qty, coalesce(v.price_override, p.price) * b.qty
  from jsonb_to_recordset(v_basket) as b (variant_id uuid, qty integer)
  join public.product_variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  order by p.name, b.variant_id;

  return query select v_id, v_code, v_total;
end;
$$;

create function public.pos_cancel_invoice(p_invoice_id uuid)
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
    raise exception 'Only an open invoice can be cancelled.' using errcode = '22023';
  end if;
  update public.invoices set status = 'cancelled', updated_at = now() where id = p_invoice_id;
end;
$$;

-- After the till sells an invoice: link the sale and close the invoice.
create function public.pos_invoice_sold(p_invoice_id uuid, p_sale_id uuid)
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
  if not exists (select 1 from public.sales where id = p_sale_id and status = 'completed' and source = 'shop') then
    raise exception 'That sale was not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.invoices where sale_id = p_sale_id) then
    raise exception 'That sale already closed another invoice.' using errcode = '22023';
  end if;
  update public.invoices set status = 'sold', sale_id = p_sale_id, updated_at = now() where id = p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.invoices, public.invoice_items, public.pos_invoices_list from anon, authenticated;
revoke all on sequence public.invoice_code_seq from anon, authenticated;
grant select on public.invoices, public.invoice_items, public.pos_invoices_list to authenticated;

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "Shop users read invoices" on public.invoices for select to authenticated
  using ((select private.is_member()));
create policy "Shop users read invoice lines" on public.invoice_items for select to authenticated
  using ((select private.is_member()));

revoke execute on function
  public.pos_create_invoice(jsonb, uuid, integer, jsonb, date, text),
  public.pos_cancel_invoice(uuid),
  public.pos_invoice_sold(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.pos_create_invoice(jsonb, uuid, integer, jsonb, date, text),
  public.pos_cancel_invoice(uuid),
  public.pos_invoice_sold(uuid, uuid)
to authenticated;
