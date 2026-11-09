-- Stock & POS: where each sale went and how it was paid, on the Sales list.
-- pos_sales_list gets the delivery address (null: taken from the shop) and the
-- payment methods used ("cash", "momo", "bank", or several joined by commas;
-- null: nothing paid yet). Columns are only added at the end.

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
  nullif(btrim(dl.rider), '') as rider,
  dl.address as delivery_address,
  p.methods as payment_methods
from public.sales s
left join public.customers c on c.id = s.customer_id
left join (
  select sale_id, sum(amount) as paid, string_agg(distinct method::text, ',' order by method::text) as methods
  from public.payments group by sale_id
) p on p.sale_id = s.id
left join (select sale_id, sum(line_total) as delivery from public.sale_items where kind = 'delivery' group by sale_id) d
  on d.sale_id = s.id
left join public.deliveries dl on dl.sale_id = s.id;
