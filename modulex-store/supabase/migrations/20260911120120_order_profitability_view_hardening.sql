-- Preserve the exact 28-column v_order_profitability_current_cost compatibility
-- contract while replacing stale/current-cost accounting with canonical revenue and
-- draft-live / confirmed-frozen Cost product COGS.
--
-- Fixed Contractor direct Project cost is intentionally not allocated here because
-- this is an order-level view and there is no canonical cross-order allocation rule.

create or replace view public.v_order_profitability_current_cost as
with item_costs as (
  select
    l.order_id,
    coalesce(sum(
      case when not l.missing_cost then l.quantity * l.unit_cost else 0::numeric end
    ), 0::numeric) as known_cogs,
    count(*) filter (where l.missing_cost)::bigint as missing_cost_lines,
    count(*) filter (where oi.price_source = 'manual')::bigint as manual_price_lines,
    count(*)::bigint as line_count
  from private.v_profitability_order_lines l
  join public.customer_order_items oi on oi.id = l.item_id
  group by l.order_id
)
select
  o.id as order_id,
  o.order_number,
  o.order_date,
  o.status,
  o.customer_id,
  c.customer_code,
  c.name as customer_name,
  o.price_group_id,
  o.price_group_name_snapshot,
  o.fulfillment_type,
  o.currency_code,
  o.subtotal,
  o.discount_amount,
  coalesce(o.customer_visible_sell_amount, 0::numeric) as net_sales,
  case
    when coalesce(ic.missing_cost_lines, 0::bigint) > 0 then null::numeric
    else coalesce(ic.known_cogs, 0::numeric)
  end as estimated_cogs,
  case
    when coalesce(ic.missing_cost_lines, 0::bigint) > 0 then null::numeric
    else coalesce(o.customer_visible_sell_amount, 0::numeric) - coalesce(ic.known_cogs, 0::numeric)
  end as estimated_gross_profit,
  case
    when coalesce(ic.missing_cost_lines, 0::bigint) > 0
      or coalesce(o.customer_visible_sell_amount, 0::numeric) <= 0 then null::numeric
    else round(
      ((coalesce(o.customer_visible_sell_amount, 0::numeric) - coalesce(ic.known_cogs, 0::numeric)) /
       o.customer_visible_sell_amount) * 100::numeric,
      2
    )
  end as estimated_margin_percent,
  coalesce(ic.missing_cost_lines, 0::bigint) as missing_cost_lines,
  coalesce(ic.line_count, 0::bigint) as line_count,
  o.tax_amount,
  o.payment_commission_amount,
  o.total_amount,
  o.grand_total,
  o.created_by,
  o.confirmed_at,
  o.completed_at,
  o.created_at,
  coalesce(ic.manual_price_lines, 0::bigint) as manual_price_lines
from public.customer_orders o
join public.customers c on c.id = o.customer_id
left join item_costs ic on ic.order_id = o.id;
