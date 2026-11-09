-- Stock & POS: sales by rider. The Sales list gets the rider of each
-- delivery (pos_sales_list.rider, appended), its totals can be narrowed to
-- one rider, and pos_rider_summary adds up each rider's deliveries for a
-- period. Riders are typed by hand, so names match without regard to case or
-- spaces at the ends.

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
  nullif(btrim(dl.rider), '') as rider
from public.sales s
left join public.customers c on c.id = s.customer_id
left join (select sale_id, sum(amount) as paid from public.payments group by sale_id) p on p.sale_id = s.id
left join (select sale_id, sum(line_total) as delivery from public.sale_items where kind = 'delivery' group by sale_id) d
  on d.sale_id = s.id
left join public.deliveries dl on dl.sale_id = s.id;

-- pos_records_totals with a rider (null: every sale). A new required
-- argument, so calls with four arguments still reach the old version.
create function public.pos_records_totals(p_kind text, p_search text, p_from timestamptz, p_to timestamptz, p_rider text)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select lower(btrim(coalesce(p_search, ''))) as term, lower(btrim(coalesce(p_rider, ''))) as rider),
  rows as (
    select l.total, l.paid, l.owed, l.status::text as status, l.delivery
    from public.pos_sales_list l, q
    where p_kind = 'sales'
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0)
      and (q.rider = '' or lower(l.rider) = q.rider)
    union all
    select l.total, l.paid, l.owed, l.status::text, 0
    from public.pos_purchases_list l, q
    where p_kind = 'purchases'
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(l.supplier_name), q.term) > 0)
    union all
    select l.total, l.paid, l.owed, 'completed', 0
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
    'counts', json_build_object(
      'sales', (select count(*) from public.sales),
      'purchases', (select count(*) from public.purchases),
      'returns', (select count(*) from public.returns)
    )
  )
  from rows;
$$;

-- Each rider's deliveries in a period (by the sale's date; null bounds = all
-- time), cancelled sales left out. Deliveries not yet given to a rider come
-- under a null rider.
create function public.pos_rider_summary(p_from timestamptz, p_to timestamptz)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object(
      'rider', r.rider, 'deliveries', r.deliveries, 'delivered', r.delivered,
      'fees', r.fees, 'total', r.total, 'owed', r.owed)
    order by r.rider is null, r.fees desc, r.rider), '[]'::json)
  from (
    select max(l.rider) as rider,
      count(*) as deliveries,
      count(*) filter (where dl.status = 'delivered') as delivered,
      coalesce(sum(l.delivery), 0) as fees,
      coalesce(sum(l.total), 0) as total,
      coalesce(sum(l.owed), 0) as owed
    from public.deliveries dl
    join public.pos_sales_list l on l.id = dl.sale_id
    where l.status not in ('voided', 'cancelled')
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
    group by lower(l.rider)
  ) r;
$$;

revoke execute on function
  public.pos_records_totals(text, text, timestamptz, timestamptz, text),
  public.pos_rider_summary(timestamptz, timestamptz)
from public, anon;
grant execute on function
  public.pos_records_totals(text, text, timestamptz, timestamptz, text),
  public.pos_rider_summary(timestamptz, timestamptz)
to authenticated;
