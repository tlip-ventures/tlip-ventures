-- Stock & POS phase 4: the dashboard and reports figures.
--
-- Both functions run as the caller (security invoker), so row-level security
-- decides what they see: staff get sales but no purchases or costs, and
-- profit is only worked out for the owner.

-- The day a sale counts on: when it was completed (a website basket counts
-- when it is paid, not when it was sent).
create index sales_completed_on_idx on public.sales ((coalesce(completed_at, created_at))) where status = 'completed';

-- Sales, purchases and profit for each period between p_bounds (n + 1 times
-- give n periods), plus sales between p_prev_from and p_prev_to to compare.
-- Profit = sales − what those items cost − refunds + the cost of returned
-- items that went back on the shelf. Lines with no recorded cost count as
-- free and are counted in missing_costs.
create function public.pos_period_figures(p_bounds timestamptz[], p_prev_from timestamptz, p_prev_to timestamptz)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select i, p_bounds[i] as lo, p_bounds[i + 1] as hi
    from generate_series(1, coalesce(array_length(p_bounds, 1), 1) - 1) as i
  ),
  r as (select p_bounds[1] as lo, p_bounds[array_length(p_bounds, 1)] as hi),
  owner as (select private.is_owner() as yes),
  s as (
    select sa.id, sa.total, coalesce(sa.completed_at, sa.created_at) as at
    from public.sales sa
    where sa.status = 'completed'
      and ((coalesce(sa.completed_at, sa.created_at) >= (select lo from r) and coalesce(sa.completed_at, sa.created_at) < (select hi from r))
        or (coalesce(sa.completed_at, sa.created_at) >= p_prev_from and coalesce(sa.completed_at, sa.created_at) < p_prev_to))
  ),
  s_cost as (
    select si.sale_id, sum(si.qty * c.unit_cost)::bigint as cost, count(*) filter (where c.sale_item_id is null) as missing
    from public.sale_items si
    left join public.sale_item_costs c on c.sale_item_id = si.id
    where si.sale_id in (select id from s)
    group by si.sale_id
  ),
  ret as (
    select re.created_at as at, re.refund_total,
      (select coalesce(sum(ri.qty * coalesce(c.unit_cost, vc.cost_price)), 0)
       from public.return_items ri
       left join public.sale_item_costs c on c.sale_item_id = ri.sale_item_id
       left join public.variant_costs vc on vc.variant_id = ri.variant_id and ri.sale_item_id is null
       where ri.return_id = re.id and ri.back_on_shelf)::bigint as cost_back
    from public.returns re
    where re.created_at >= (select lo from r) and re.created_at < (select hi from r)
  ),
  pu as (
    select p.total, p.created_at as at
    from public.purchases p
    where p.status <> 'cancelled' and p.created_at >= (select lo from r) and p.created_at < (select hi from r)
  ),
  per as (
    select b.i,
      (select coalesce(sum(s.total), 0) from s where s.at >= b.lo and s.at < b.hi)::bigint as sales,
      (select count(*) from s where s.at >= b.lo and s.at < b.hi) as sales_count,
      (select coalesce(sum(pu.total), 0) from pu where pu.at >= b.lo and pu.at < b.hi)::bigint as purchases,
      ((select coalesce(sum(s.total - coalesce(sc.cost, 0)), 0) from s left join s_cost sc on sc.sale_id = s.id where s.at >= b.lo and s.at < b.hi)
        - (select coalesce(sum(ret.refund_total - ret.cost_back), 0) from ret where ret.at >= b.lo and ret.at < b.hi))::bigint as profit,
      (select coalesce(sum(sc.missing), 0) from s join s_cost sc on sc.sale_id = s.id where s.at >= b.lo and s.at < b.hi)::bigint as missing
    from b
  )
  select json_build_object(
    'periods', coalesce((select json_agg(json_build_object(
        'sales', per.sales, 'count', per.sales_count, 'purchases', per.purchases,
        'profit', case when (select yes from owner) then per.profit end) order by per.i) from per), '[]'::json),
    'prev_sales', (select coalesce(sum(s.total), 0) from s where s.at >= p_prev_from and s.at < p_prev_to),
    'missing_costs', case when (select yes from owner) then (select coalesce(sum(per.missing), 0) from per) end
  );
$$;

-- Best sellers between two times: units, sales value before discounts and,
-- for the owner, profit on those lines.
create function public.pos_top_products(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (product_name text, option_values text, qty integer, revenue integer, profit integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select si.product_name, si.option_values,
    sum(si.qty)::integer,
    sum(si.line_total)::integer,
    case when private.is_owner() then sum(si.line_total - si.qty * coalesce(c.unit_cost, 0))::integer end
  from public.sale_items si
  join public.sales sa on sa.id = si.sale_id
  left join public.sale_item_costs c on c.sale_item_id = si.id
  where sa.status = 'completed'
    and coalesce(sa.completed_at, sa.created_at) >= p_from
    and coalesce(sa.completed_at, sa.created_at) < p_to
  group by si.product_name, si.option_values
  order by 4 desc, 3 desc, 1
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.pos_period_figures(timestamptz[], timestamptz, timestamptz), public.pos_top_products(timestamptz, timestamptz, integer)
  from public, anon;
grant execute on function public.pos_period_figures(timestamptz[], timestamptz, timestamptz), public.pos_top_products(timestamptz, timestamptz, integer)
  to authenticated;
