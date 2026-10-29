-- Stock & POS phase 6: importing the old system's data.
--
-- The import screen (/pos/import, owner only) reads the files in the browser,
-- checks every row, then sends the rows here in batches. Each function runs
-- the same matching with p_apply = false (a dry run that only reports what it
-- would do) and p_apply = true (saves it), and returns one result per row:
-- {"row", "action": "new" | "update" | "skip" | "error", "message"}.
--
-- Running an import twice changes nothing the second time: products match by
-- code, barcode or name; people by phone or name; sales and purchases by
-- their number. Past sales and purchases are history only: they never move
-- stock (the products file sets the shelf count with an 'opening' movement).

-- ---------------------------------------------------------------------------
-- Products and stock
-- ---------------------------------------------------------------------------

-- p_rows: [{"row", "name", "slug", "sku", "barcode", "category", "price",
--   "cost", "qty", "reorder"}]; money in pesewas; qty sets the shelf count.
create function public.pos_import_products(p_rows jsonb, p_apply boolean, p_update_prices boolean, p_set_stock boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_variant uuid;
  v_product uuid;
  v_product_name text;
  v_old_price integer;
  v_count integer;
  v_how text;
  v_slug text;
  v_n integer;
  v_on_hand integer;
  v_category uuid;
  v_notes text[];
  v_out jsonb := '[]'::jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can import data.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send at most 500 rows at a time.' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x (
      "row" integer, name text, slug text, sku text, barcode text, category text,
      price integer, cost integer, qty integer, reorder integer)
  loop
    if r.name is null or btrim(r.name) = '' or r.price is null or r.price < 0
       or r.slug is null or r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or (r.cost is not null and r.cost < 0) or (r.qty is not null and abs(r.qty) > 100000)
       or (r.reorder is not null and r.reorder not between 0 and 100000) then
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error', 'message', 'This row is incomplete.');
      continue;
    end if;

    -- Match: code, then barcode, then name (a product with one entry).
    v_variant := null;
    v_product := null;
    v_how := null;
    if nullif(btrim(r.sku), '') is not null then
      select v.id, v.product_id into v_variant, v_product
      from public.product_variants v where lower(btrim(v.sku)) = lower(btrim(r.sku)) limit 1;
      if found then v_how := 'code'; end if;
    end if;
    if v_variant is null and nullif(btrim(r.barcode), '') is not null then
      select v.id, v.product_id into v_variant, v_product
      from public.product_variants v where v.barcode = btrim(r.barcode) limit 1;
      if found then v_how := 'barcode'; end if;
    end if;
    if v_variant is null then
      select count(*) into v_count from public.products p where lower(btrim(p.name)) = lower(btrim(r.name));
      if v_count > 1 then
        v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error',
          'message', format('%s products are called “%s”. Add their codes to the file.', v_count, r.name));
        continue;
      elsif v_count = 1 then
        select p.id into v_product from public.products p where lower(btrim(p.name)) = lower(btrim(r.name));
        select count(*) into v_count from public.product_variants v where v.product_id = v_product;
        if v_count <> 1 then
          v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error',
            'message', format('“%s” has colours or sizes on the website. Add each one''s code to the file.', r.name));
          continue;
        end if;
        select v.id into v_variant from public.product_variants v where v.product_id = v_product;
        v_how := 'name';
      end if;
    end if;

    v_notes := array[]::text[];
    v_on_hand := 0;
    if v_variant is not null then
      select p.name, p.price into v_product_name, v_old_price from public.products p where p.id = v_product;
      select coalesce(s.on_hand, 0) into v_on_hand from public.stock_levels s where s.variant_id = v_variant;
      v_on_hand := coalesce(v_on_hand, 0);
      v_notes := array_append(v_notes, format('Matches “%s” by %s', v_product_name, v_how));
      if p_update_prices and v_old_price <> r.price then
        v_notes := array_append(v_notes, format('price %s → %s', trim_scale(v_old_price / 100.0), trim_scale(r.price / 100.0)));
      end if;
    else
      v_notes := array_append(v_notes, 'New product, hidden from the website');
      v_category := null;
      if nullif(btrim(r.category), '') is not null then
        -- A subcategory of that name first, then a top category.
        select c.id into v_category from public.categories c
        where lower(c.name) = lower(btrim(r.category))
        order by c.parent_id is null, c.sort_order limit 1;
        if v_category is null then
          v_notes := array_append(v_notes, format('no category called “%s”', btrim(r.category)));
        end if;
      end if;
    end if;
    if p_set_stock and r.qty is not null and r.qty <> v_on_hand then
      v_notes := array_append(v_notes, format('shelf %s → %s', v_on_hand, r.qty));
    end if;

    if p_apply then
      if v_variant is null then
        v_slug := r.slug;
        v_n := 1;
        while exists (select 1 from public.products p where p.slug = v_slug) loop
          v_n := v_n + 1;
          v_slug := left(r.slug, 74) || '-' || v_n;
        end loop;
        insert into public.products (name, slug, price, is_active)
        values (btrim(r.name), v_slug, r.price, false)
        returning id into v_product;
        insert into public.product_variants (product_id, sku, barcode)
        values (v_product, nullif(btrim(r.sku), ''), nullif(btrim(r.barcode), ''))
        returning id into v_variant;
        if v_category is not null then
          insert into public.product_categories (product_id, category_id) values (v_product, v_category);
        end if;
      else
        update public.product_variants v
        set sku = coalesce(v.sku, nullif(btrim(r.sku), '')),
            barcode = coalesce(v.barcode, nullif(btrim(r.barcode), ''))
        where v.id = v_variant;
        if p_update_prices and v_old_price <> r.price then
          update public.products p set price = r.price where p.id = v_product;
        end if;
      end if;

      if r.reorder is not null then
        update public.product_variants v set reorder_level = r.reorder where v.id = v_variant and v.reorder_level <> r.reorder;
      end if;
      if r.cost is not null then
        insert into public.variant_costs (variant_id, cost_price)
        values (v_variant, r.cost)
        on conflict (variant_id) do update
          set cost_price = excluded.cost_price, updated_by = auth.uid()
          where public.variant_costs.cost_price is distinct from excluded.cost_price;
      end if;
      if p_set_stock and r.qty is not null then
        select coalesce(s.on_hand, 0) into v_on_hand from public.stock_levels s where s.variant_id = v_variant for update;
        if r.qty <> coalesce(v_on_hand, 0) then
          insert into public.stock_movements (variant_id, qty_change, kind, reason)
          values (v_variant, r.qty - coalesce(v_on_hand, 0), 'opening', 'Imported from the old system');
        end if;
      end if;
    end if;

    v_out := v_out || jsonb_build_object('row', r."row",
      'action', case when v_how is null then 'new' else 'update' end,
      'message', array_to_string(v_notes, '; ') || '.');
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customers and suppliers
-- ---------------------------------------------------------------------------

-- p_kind: 'customers' or 'suppliers'; p_rows: [{"row", "name", "phone"}].
create function public.pos_import_people(p_kind text, p_rows jsonb, p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_id uuid;
  v_phone text;
  v_out jsonb := '[]'::jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can import data.' using errcode = '42501';
  end if;
  if p_kind not in ('customers', 'suppliers') or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send at most 500 customers or suppliers at a time.' using errcode = '22023';
  end if;

  for r in select * from jsonb_to_recordset(p_rows) as x ("row" integer, name text, phone text)
  loop
    if r.name is null or char_length(btrim(r.name)) not between 1 and 100
       or (r.phone is not null and r.phone !~ '^233[235][0-9]{8}$') then
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error', 'message', 'This row is incomplete.');
      continue;
    end if;

    v_id := null;
    if p_kind = 'customers' then
      if r.phone is not null then
        select c.id into v_id from public.customers c where c.phone = r.phone;
      else
        select c.id into v_id from public.customers c where lower(btrim(c.name)) = lower(btrim(r.name)) order by c.created_at limit 1;
      end if;
      if v_id is not null then
        v_out := v_out || jsonb_build_object('row', r."row", 'action', 'skip', 'message', 'Already a customer.');
        continue;
      end if;
      if p_apply then
        insert into public.customers (name, phone) values (btrim(r.name), r.phone);
      end if;
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'new', 'message', 'New customer.');
    else
      select s.id, s.phone into v_id, v_phone from public.suppliers s where lower(btrim(s.name)) = lower(btrim(r.name));
      if v_id is not null then
        if v_phone is null and r.phone is not null then
          if p_apply then
            update public.suppliers set phone = r.phone where id = v_id;
          end if;
          v_out := v_out || jsonb_build_object('row', r."row", 'action', 'update', 'message', 'Already a supplier; adds the phone number.');
        else
          v_out := v_out || jsonb_build_object('row', r."row", 'action', 'skip', 'message', 'Already a supplier.');
        end if;
        continue;
      end if;
      if p_apply then
        insert into public.suppliers (name, phone) values (btrim(r.name), r.phone);
      end if;
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'new', 'message', 'New supplier.');
    end if;
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Past sales and purchases (history: no stock movements)
-- ---------------------------------------------------------------------------

-- The variant a past line belongs to, by product name (one product, one entry).
create function private.variant_by_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then min(v.id::text)::uuid end
  from public.products p
  join public.product_variants v on v.product_id = p.id
  where lower(btrim(p.name)) = lower(btrim(p_name))
    and (select count(*) from public.product_variants v2 where v2.product_id = p.id) = 1;
$$;

-- Moves a code sequence past the highest imported number (SL_1209 -> next SL_1210).
create function private.bump_code_sequence(p_seq regclass, p_max bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last bigint;
  v_called boolean;
begin
  if p_max is null then
    return;
  end if;
  execute format('select last_value, is_called from %s', p_seq) into v_last, v_called;
  if p_max >= (case when v_called then v_last + 1 else v_last end) then
    perform setval(p_seq, p_max, true);
  end if;
end;
$$;

-- p_kind: 'sales' or 'purchases'. p_rows: [{"row", "code", "date", "party",
--   "phone", "total", "paid", "method", "lines": [{"name", "qty", "unitPrice",
--   "unitCost"}]}]; money in pesewas. For purchases "unitPrice" is the cost.
create function public.pos_import_records(p_kind text, p_rows jsonb, p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  l record;
  v_party uuid;
  v_party_note text;
  v_id uuid;
  v_item uuid;
  v_lines_total bigint;
  v_subtotal bigint;
  v_out jsonb := '[]'::jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can import data.' using errcode = '42501';
  end if;
  if p_kind not in ('sales', 'purchases') or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 300 then
    raise exception 'Send at most 300 sales or purchases at a time.' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x (
      "row" integer, code text, date timestamptz, party text, phone text,
      total integer, paid integer, method text, lines jsonb)
  loop
    if r.code is null or char_length(r.code) not between 1 and 40 or r.date is null
       or r.total is null or r.total < 0 or r.paid is null or r.paid < 0 or r.paid > r.total
       or r.method not in ('cash', 'momo', 'bank')
       or (p_kind = 'purchases' and nullif(btrim(r.party), '') is null)
       or (r.phone is not null and r.phone !~ '^233[235][0-9]{8}$')
       or exists (select 1 from jsonb_to_recordset(coalesce(r.lines, '[]')) as y (name text, qty integer, "unitPrice" integer, "unitCost" integer)
                  where y.name is null or y.qty is null or y.qty < 1 or y.qty > (case when p_kind = 'sales' then 999 else 100000 end)
                     or y."unitPrice" is null or y."unitPrice" < 0 or (y."unitCost" is not null and y."unitCost" < 0)) then
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'error', 'message', r.code || ': this row is incomplete.');
      continue;
    end if;

    if (p_kind = 'sales' and exists (select 1 from public.sales s where s.code = r.code))
       or (p_kind = 'purchases' and exists (select 1 from public.purchases p where p.code = r.code)) then
      v_out := v_out || jsonb_build_object('row', r."row", 'action', 'skip', 'message', r.code || ' is already in.');
      continue;
    end if;

    -- The customer or supplier: found by phone or name, or added.
    v_party := null;
    v_party_note := null;
    if p_kind = 'sales' then
      if r.phone is not null then
        select c.id into v_party from public.customers c where c.phone = r.phone;
      end if;
      if v_party is null and nullif(btrim(r.party), '') is not null and btrim(r.party) !~* '^walk[\s-]?in' then
        select c.id into v_party from public.customers c
        where lower(btrim(c.name)) = lower(btrim(r.party)) and (r.phone is null or c.phone is null)
        order by c.created_at limit 1;
        if v_party is null then
          v_party_note := format('new customer %s', btrim(r.party));
          if p_apply then
            insert into public.customers (name, phone) values (left(btrim(r.party), 100), r.phone) returning id into v_party;
          end if;
        end if;
      end if;
    else
      select s.id into v_party from public.suppliers s where lower(btrim(s.name)) = lower(btrim(r.party));
      if v_party is null then
        v_party_note := format('new supplier %s', btrim(r.party));
        if p_apply then
          insert into public.suppliers (name) values (left(btrim(r.party), 100)) returning id into v_party;
        end if;
      end if;
    end if;

    if p_apply then
      select coalesce(sum(y.qty::bigint * y."unitPrice"), 0) into v_lines_total
      from jsonb_to_recordset(coalesce(r.lines, '[]')) as y (qty integer, "unitPrice" integer);

      if p_kind = 'sales' then
        v_subtotal := greatest(v_lines_total, r.total);
        insert into public.sales (code, source, status, customer_id, subtotal, discount, total, note, created_by, created_at, completed_at)
        values (r.code, 'import', 'completed', v_party, v_subtotal, v_subtotal - r.total, r.total,
                'Imported from the old system', null, r.date, r.date)
        returning id into v_id;
        for l in
          select y.name, y.qty, y."unitPrice" as unit_price, y."unitCost" as unit_cost
          from rows from (jsonb_to_recordset(coalesce(r.lines, '[]')) as (name text, qty integer, "unitPrice" integer, "unitCost" integer))
            with ordinality as y (name, qty, "unitPrice", "unitCost", n)
          order by y.n
        loop
          insert into public.sale_items (sale_id, variant_id, product_name, unit_price, qty, line_total)
          values (v_id, private.variant_by_name(l.name), left(l.name, 200), l.unit_price, l.qty, l.unit_price * l.qty)
          returning id into v_item;
          if l.unit_cost is not null then
            insert into public.sale_item_costs (sale_item_id, unit_cost) values (v_item, l.unit_cost);
          end if;
        end loop;
        -- No items in the file (or not all of the total): one line for the rest.
        if v_lines_total < r.total then
          insert into public.sale_items (sale_id, product_name, unit_price, qty, line_total)
          values (v_id, case when v_lines_total = 0 then 'Sale from the old system' else 'Rest of the sale (old system)' end,
                  r.total - v_lines_total, 1, r.total - v_lines_total);
        end if;
        if r.paid > 0 then
          insert into public.payments (sale_id, method, amount, cash_received, change_given, paid_at, created_by, note)
          values (v_id, r.method::public.payment_method, r.paid,
                  case when r.method = 'cash' then r.paid end, case when r.method = 'cash' then 0 end,
                  r.date, null, 'Imported');
        end if;
      else
        insert into public.purchases (code, supplier_id, status, total, note, created_by, created_at, received_at)
        values (r.code, v_party, 'received', r.total, 'Imported from the old system', null, r.date, r.date)
        returning id into v_id;
        for l in
          select y.name, y.qty, y."unitPrice" as unit_cost
          from rows from (jsonb_to_recordset(coalesce(r.lines, '[]')) as (name text, qty integer, "unitPrice" integer))
            with ordinality as y (name, qty, "unitPrice", n)
          order by y.n
        loop
          insert into public.purchase_items (purchase_id, variant_id, product_name, unit_cost, qty, line_total)
          values (v_id, private.variant_by_name(l.name), left(l.name, 200), l.unit_cost, l.qty, l.unit_cost * l.qty);
        end loop;
        if v_lines_total < r.total then
          insert into public.purchase_items (purchase_id, product_name, unit_cost, qty, line_total)
          values (v_id, case when v_lines_total = 0 then 'Purchase from the old system' else 'Rest of the purchase (old system)' end,
                  r.total - v_lines_total, 1, r.total - v_lines_total);
        end if;
        if r.paid > 0 then
          insert into public.purchase_payments (purchase_id, method, amount, paid_at, created_by, note)
          values (v_id, r.method::public.payment_method, r.paid, r.date, null, 'Imported');
        end if;
      end if;
    end if;

    v_out := v_out || jsonb_build_object('row', r."row", 'action', 'new',
      'message', r.code || case when r.paid < r.total then format(', GH₵ %s still owed', trim_scale((r.total - r.paid) / 100.0)) else '' end
        || coalesce(', ' || v_party_note, '') || '.');
  end loop;

  if p_apply then
    if p_kind = 'sales' then
      perform private.bump_code_sequence('public.sale_code_seq',
        (select max((substring(s.code from '^SL_(\d{1,15})$'))::bigint) from public.sales s));
    else
      perform private.bump_code_sequence('public.purchase_code_seq',
        (select max((substring(p.code from '^PR_(\d{1,15})$'))::bigint) from public.purchases p));
    end if;
  end if;
  return v_out;
end;
$$;

revoke execute on function private.variant_by_name(text), private.bump_code_sequence(regclass, bigint)
from public, anon, authenticated;

revoke execute on function public.pos_import_products(jsonb, boolean, boolean, boolean), public.pos_import_people(text, jsonb, boolean),
  public.pos_import_records(text, jsonb, boolean)
from public, anon;
grant execute on function public.pos_import_products(jsonb, boolean, boolean, boolean), public.pos_import_people(text, jsonb, boolean),
  public.pos_import_records(text, jsonb, boolean)
to authenticated;
