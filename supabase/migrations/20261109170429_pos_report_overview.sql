-- Owner Reports: everything for one stretch of time, plus where things
-- stand now. Runs as the caller (RLS), and only the owner may call it.
-- Sales figures count items (after discounts); delivery fees are apart.

create function public.pos_report_overview(p_from timestamptz, p_to timestamptz)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v json;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can see reports.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Choose a start date before the end date.' using errcode = '22023';
  end if;

  with s as (
    select sa.id, sa.source, sa.total, sa.discount, sa.created_by,
      coalesce((select sum(i.line_total) from public.sale_items i where i.sale_id = sa.id and i.kind = 'delivery'), 0) as delivery,
      coalesce((select sum(i.qty) from public.sale_items i where i.sale_id = sa.id and i.kind = 'item'), 0) as qty
    from public.sales sa
    where sa.status = 'completed'
      and coalesce(sa.completed_at, sa.created_at) >= p_from and coalesce(sa.completed_at, sa.created_at) < p_to
  ),
  s_cost as (
    select si.sale_id, sum(si.qty * c.unit_cost)::bigint as cost,
      count(*) filter (where c.sale_item_id is null and si.kind = 'item') as missing
    from public.sale_items si
    left join public.sale_item_costs c on c.sale_item_id = si.id
    where si.sale_id in (select id from s)
    group by si.sale_id
  ),
  ret as (
    select re.refund_total,
      (select coalesce(sum(ri.qty * coalesce(c.unit_cost, vc.cost_price)), 0)
       from public.return_items ri
       left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
       left join public.variant_costs vc on vc.variant_id = ri.variant_id and ri.sale_item_id is null
       where ri.return_id = re.id and ri.back_on_shelf)::bigint as cost_back
    from public.returns re
    where re.created_at >= p_from and re.created_at < p_to
  ),
  stock as (
    select r.on_hand, r.price, vc.cost_price, r.stock_state
    from public.pos_stock_rows r
    left join public.variant_costs vc on vc.variant_id = r.variant_id
  )
  select json_build_object(
    'sales', json_build_object(
      'count', (select count(*) from s),
      'items', (select coalesce(sum(s.total - s.delivery), 0) from s),
      'qty', (select coalesce(sum(s.qty), 0) from s),
      'discount', (select coalesce(sum(s.discount), 0) from s),
      'delivery', (select coalesce(sum(s.delivery), 0) from s),
      'deliveries', (select count(*) from s where exists (select 1 from public.deliveries d where d.sale_id = s.id)),
      'shop', (select coalesce(sum(s.total - s.delivery), 0) from s where s.source = 'shop'),
      'website', (select coalesce(sum(s.total - s.delivery), 0) from s where s.source = 'website'),
      'imported', (select coalesce(sum(s.total - s.delivery), 0) from s where s.source = 'import'),
      'profit', ((select coalesce(sum(s.total - s.delivery - coalesce(sc.cost, 0)), 0) from s left join s_cost sc on sc.sale_id = s.id)
                 - (select coalesce(sum(ret.refund_total - ret.cost_back), 0) from ret)),
      'missing_costs', (select coalesce(sum(sc.missing), 0) from s_cost sc),
      'cancelled_count', (select count(*) from public.sales x where x.status in ('voided', 'cancelled') and x.source <> 'website'
                            and x.created_at >= p_from and x.created_at < p_to),
      'cancelled_value', (select coalesce(sum(x.total), 0) from public.sales x where x.status in ('voided', 'cancelled') and x.source <> 'website'
                            and x.created_at >= p_from and x.created_at < p_to)
    ),
    'by_staff', coalesce((
      select json_agg(json_build_object('user_id', t.created_by, 'count', t.n, 'total', t.total) order by t.total desc)
      from (select s.created_by, count(*) as n, sum(s.total) as total from s where s.source = 'shop' group by s.created_by) t
    ), '[]'::json),
    'money_in', coalesce((
      select json_object_agg(t.method, t.amount)
      from (select p.method, sum(p.amount) as amount from public.payments p
            where p.paid_at >= p_from and p.paid_at < p_to group by p.method) t
    ), '{}'::json),
    'refunds_out', coalesce((
      select json_object_agg(t.method, t.amount)
      from (select p.method, sum(p.amount) as amount from public.refund_payments p
            where p.paid_at >= p_from and p.paid_at < p_to group by p.method) t
    ), '{}'::json),
    'suppliers_out', coalesce((
      select json_object_agg(t.method, t.amount)
      from (select p.method, sum(p.amount) as amount from public.purchase_payments p
            where p.paid_at >= p_from and p.paid_at < p_to group by p.method) t
    ), '{}'::json),
    'purchases', json_build_object(
      'count', (select count(*) from public.purchases p where p.status <> 'cancelled' and p.created_at >= p_from and p.created_at < p_to),
      'total', (select coalesce(sum(p.total), 0) from public.purchases p where p.status <> 'cancelled' and p.created_at >= p_from and p.created_at < p_to)
    ),
    'returns', json_build_object(
      'count', (select count(*) from ret),
      'total', (select coalesce(sum(ret.refund_total), 0) from ret)
    ),
    'invoices', json_build_object(
      'count', (select count(*) from public.invoices i where i.created_at >= p_from and i.created_at < p_to),
      'total', (select coalesce(sum(i.total), 0) from public.invoices i where i.created_at >= p_from and i.created_at < p_to),
      'sold', (select count(*) from public.invoices i where i.status = 'sold' and i.created_at >= p_from and i.created_at < p_to)
    ),
    'customers_new', (select count(*) from public.customers c where c.created_at >= p_from and c.created_at < p_to),
    'now', json_build_object(
      'customers_owe', (select coalesce(sum(l.owed), 0) from public.pos_sales_list l),
      'customers_owing', (select count(distinct coalesce(l.customer_id::text, l.id::text)) from public.pos_sales_list l where l.owed > 0),
      'suppliers_owed', (select coalesce(sum(l.owed), 0) from public.pos_purchases_list l),
      'stock_units', (select coalesce(sum(stock.on_hand), 0) from stock where stock.on_hand > 0),
      'stock_cost', (select coalesce(sum(stock.on_hand::bigint * stock.cost_price), 0) from stock where stock.on_hand > 0),
      'stock_price', (select coalesce(sum(stock.on_hand::bigint * stock.price), 0) from stock where stock.on_hand > 0),
      'stock_no_cost', (select count(*) from stock where stock.on_hand > 0 and stock.cost_price is null),
      'out_of_stock', (select count(*) from stock where stock.stock_state = 'out'),
      'low_stock', (select count(*) from stock where stock.stock_state = 'low'),
      'recount', (select count(*) from stock where stock.stock_state = 'recount'),
      'invoices_open', (select count(*) from public.invoices i where i.status = 'open' and i.valid_until >= current_date),
      'invoices_open_total', (select coalesce(sum(i.total), 0) from public.invoices i where i.status = 'open' and i.valid_until >= current_date),
      'deliveries_waiting', (select count(*) from public.deliveries d join public.sales x on x.id = d.sale_id
                             where d.status <> 'delivered' and x.status not in ('voided', 'cancelled'))
    )
  ) into v;
  return v;
end;
$$;

revoke execute on function public.pos_report_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_report_overview(timestamptz, timestamptz) to authenticated;
