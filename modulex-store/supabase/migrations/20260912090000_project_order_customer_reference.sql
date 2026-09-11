create or replace function public.get_customer_project(p_project_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
select jsonb_build_object(
  'id',cp.id,
  'project_number',cp.project_number,
  'customer_id',cp.customer_id,
  'customer_name',c.name,
  'name',cp.name,
  'status',cp.status,
  'sales_rep_id',cp.sales_rep_id,
  'sales_rep_name',p.full_name,
  'project_address_id',cp.project_address_id,
  'project_address_snapshot',cp.project_address_snapshot,
  'start_date',cp.start_date,
  'target_date',cp.target_date,
  'planned_delivery_date',cp.planned_delivery_date,
  'primary_installation_id',cp.primary_installation_id,
  'completed_at',cp.completed_at,
  'customer_notes',cp.customer_notes,
  'internal_notes',cp.internal_notes,
  'created_at',cp.created_at,
  'updated_at',cp.updated_at,
  'orders',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',o.id,
        'order_number',o.order_number,
        'customer_reference',o.customer_reference,
        'status',o.status,
        'order_date',o.order_date,
        'expected_delivery_date',o.expected_delivery_date,
        'item_count',o.item_count,
        'currency_code',o.currency_code,
        'grand_total',o.grand_total,
        'fulfillment_type',o.fulfillment_type
      )
      order by o.order_date desc,o.created_at desc
    )
    from public.customer_orders o
    where o.project_id=cp.id
  ),'[]'::jsonb)
)
from public.customer_projects cp
join public.customers c on c.id=cp.customer_id
left join public.profiles p on p.id=cp.sales_rep_id
where cp.id=p_project_id;
$function$;
