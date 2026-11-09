-- Stock & POS: the delivery fee on the Sales list and its totals.
--
-- pos_sales_list gets a delivery column (the sale's "Delivery" lines) so the
-- list can show items, delivery and total apart, and pos_records_summary adds
-- up delivery fees for the end-of-day sum. Columns are only added at the end.

create or replace view public.pos_sales_list
with (security_invoker = true)
as
select
  s.id, s.code, s.source, s.status, s.created_at, s.created_by, s.total, s.discount, s.order_id,
  s.customer_id, c.name as customer_name, c.phone as customer_phone,
  coalesce(p.paid, 0)::integer as paid,
  case when s.status in ('voided', 'cancelled') then 0
       else greatest(s.total - coalesce(p.paid, 0), 0) end::integer as owed,
  coalesce(d.delivery, 0)::integer as delivery
from public.sales s
left join public.customers c on c.id = s.customer_id
left join (select sale_id, sum(amount) as paid from public.payments group by sale_id) p on p.sale_id = s.id
left join (select sale_id, sum(line_total) as delivery from public.sale_items where kind = 'delivery' group by sale_id) d
  on d.sale_id = s.id;

create or replace function public.pos_records_summary(p_kind text, p_search text default null)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select lower(btrim(coalesce(p_search, ''))) as term),
  rows as (
    select l.total, l.paid, l.owed, l.status::text as status, l.delivery
    from public.pos_sales_list l, q
    where p_kind = 'sales'
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0)
    union all
    select l.total, l.paid, l.owed, l.status::text, 0
    from public.pos_purchases_list l, q
    where p_kind = 'purchases'
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(l.supplier_name), q.term) > 0)
    union all
    select l.total, l.paid, l.owed, 'completed', 0
    from public.pos_returns_list l, q
    where p_kind = 'returns'
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0
           or strpos(lower(coalesce(l.sale_code, '')), q.term) > 0)
  )
  select json_build_object(
    'total', coalesce(sum(total) filter (where status not in ('voided', 'cancelled')), 0),
    'paid', coalesce(sum(paid) filter (where status not in ('voided', 'cancelled')), 0),
    'owed', coalesce(sum(owed), 0),
    'delivery', coalesce(sum(delivery) filter (where status not in ('voided', 'cancelled')), 0),
    'counts', json_build_object(
      'sales', (select count(*) from public.sales),
      'purchases', (select count(*) from public.purchases),
      'returns', (select count(*) from public.returns)
    )
  )
  from rows;
$$;
