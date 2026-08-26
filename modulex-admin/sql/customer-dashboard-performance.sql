-- Compact read model for the customer dashboard.
-- Returns only the KPIs and small recent lists rendered by the dashboard instead of
-- downloading every customer and up to 250 complete order rows to the browser.

create or replace function public.get_customer_dashboard(
  p_recent_orders integer default 8,
  p_recent_customers integer default 7
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with customer_stats as (
    select
      count(*)::bigint as total_customers,
      count(*) filter (where status = 'active')::bigint as active_customers,
      count(*) filter (where portal_enabled)::bigint as portal_enabled,
      count(*) filter (where status = 'prospect')::bigint as prospects
    from public.customers
  ),
  order_stats as (
    select
      count(*) filter (
        where status in (
          'draft',
          'confirmed',
          'in_preparation',
          'ready_for_shipment',
          'shipped',
          'delivered',
          'installation_scheduled',
          'installation_in_progress'
        )
      )::bigint as open_orders,
      count(*) filter (where status = 'ready_for_shipment')::bigint as ready_to_ship,
      count(*) filter (
        where status in ('installation_scheduled', 'installation_in_progress')
      )::bigint as installation,
      coalesce(
        sum(
          case
            when status in (
              'draft',
              'confirmed',
              'in_preparation',
              'ready_for_shipment',
              'shipped',
              'delivered',
              'installation_scheduled',
              'installation_in_progress'
            ) then
              case
                when coalesce(grand_total, 0) > 0 or coalesce(total_amount, 0) = 0
                  then coalesce(grand_total, 0)
                else coalesce(total_amount, 0)
              end
            else 0
          end
        ),
        0
      ) as open_order_value
    from public.customer_orders
  ),
  recent_orders as (
    select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb) as items
    from (
      select
        o.id,
        o.customer_id,
        o.order_number,
        o.order_date,
        o.status,
        o.currency_code,
        o.grand_total,
        o.total_amount,
        o.created_at,
        c.name as customer_name,
        c.customer_code
      from public.customer_orders o
      left join public.customers c on c.id = o.customer_id
      order by o.created_at desc
      limit greatest(0, least(coalesce(p_recent_orders, 8), 50))
    ) row_data
  ),
  recent_customers as (
    select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb) as items
    from (
      select id, customer_code, name, status, created_at
      from public.customers
      order by created_at desc
      limit greatest(0, least(coalesce(p_recent_customers, 7), 50))
    ) row_data
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'total_customers', cs.total_customers,
      'active_customers', cs.active_customers,
      'portal_enabled', cs.portal_enabled,
      'prospects', cs.prospects,
      'open_orders', os.open_orders,
      'ready_to_ship', os.ready_to_ship,
      'installation', os.installation,
      'open_order_value', os.open_order_value
    ),
    'recent_orders', ro.items,
    'recent_customers', rc.items
  )
  from customer_stats cs
  cross join order_stats os
  cross join recent_orders ro
  cross join recent_customers rc;
$$;

grant execute on function public.get_customer_dashboard(integer, integer) to authenticated;

notify pgrst, 'reload schema';
