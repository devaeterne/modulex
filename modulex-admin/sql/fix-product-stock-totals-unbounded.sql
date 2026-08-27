-- Fix product stock totals to include every visible inventory row.
--
-- get_product_stock_totals() previously called search_stock('', 100000),
-- but search_stock intentionally caps p_limit at 200 rows. Once inventory grew
-- beyond 200 rows, product stock totals were silently incomplete.
--
-- Aggregate directly from the RLS-aware, security_invoker stock view instead.

create or replace function public.get_product_stock_totals()
returns table(
  product_id uuid,
  quantity numeric,
  reserved_quantity numeric,
  available_quantity numeric
)
language sql
stable
set search_path = 'public'
as $$
  select
    v.product_id,
    coalesce(sum(v.quantity), 0)::numeric as quantity,
    coalesce(sum(v.reserved_quantity), 0)::numeric as reserved_quantity,
    coalesce(sum(v.available_quantity), 0)::numeric as available_quantity
  from public.v_stock_overview v
  group by v.product_id;
$$;
