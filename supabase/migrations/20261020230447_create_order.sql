-- Saves an order and its lines in one transaction, for the checkout server
-- action (CLAUDE.md domain rules 2, 7, 8). The action works out every price
-- from the database first; this function only stores the result, so it is
-- callable by the secret (service-role) key alone, never by the public.
--
-- p_items: [{"variant_id": uuid, "product_name": text, "option_values": text|null,
--            "unit_price": integer pesewas, "qty": integer}, ...]

create function public.create_order(
  p_customer_name text,
  p_phone text,
  p_notes text,
  p_items jsonb
)
returns table (order_code text, public_token text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_code text;
  v_public_token text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item' using errcode = '22023';
  end if;

  insert into public.orders (customer_name, phone, notes, items_total)
  values (
    btrim(p_customer_name),
    p_phone,
    nullif(btrim(p_notes), ''),
    (select sum((i ->> 'unit_price')::integer * (i ->> 'qty')::integer) from jsonb_array_elements(p_items) as i)
  )
  returning id, orders.order_code, orders.public_token into v_order_id, v_order_code, v_public_token;

  -- Table constraints check qty (1-999), unit_price (>= 0) and line_total.
  insert into public.order_items (order_id, variant_id, product_name, option_values, unit_price, qty, line_total)
  select
    v_order_id,
    (i ->> 'variant_id')::uuid,
    i ->> 'product_name',
    nullif(i ->> 'option_values', ''),
    (i ->> 'unit_price')::integer,
    (i ->> 'qty')::integer,
    (i ->> 'unit_price')::integer * (i ->> 'qty')::integer
  from jsonb_array_elements(p_items) as i;

  return query select v_order_code, v_public_token;
end;
$$;

revoke execute on function public.create_order(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, jsonb) to service_role;
