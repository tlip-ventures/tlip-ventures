-- Stock & POS: totals for the Sales / Purchases / Returns lists over a period
-- (Today, This week, This month), as pos_records_summary but between two
-- times. Null bounds mean all time. A new name rather than an overload, so
-- calls to pos_records_summary stay unambiguous.

create function public.pos_records_totals(p_kind text, p_search text, p_from timestamptz, p_to timestamptz)
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
      and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
      and (q.term = '' or strpos(lower(l.code), q.term) > 0 or strpos(lower(coalesce(l.customer_name, '')), q.term) > 0)
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

revoke execute on function public.pos_records_totals(text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_records_totals(text, text, timestamptz, timestamptz) to authenticated;
