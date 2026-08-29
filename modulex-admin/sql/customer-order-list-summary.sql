-- A1.2A customer order list consistency
-- Server-side directory search/pagination plus aggregate summary under existing RLS.

create or replace view public.customer_order_directory
with (security_invoker = true)
as
select
  o.*,
  c.customer_code,
  c.name as customer_name
from public.customer_orders o
join public.customers c on c.id = o.customer_id;

revoke all on public.customer_order_directory from public;
revoke all on public.customer_order_directory from anon;
grant select on public.customer_order_directory to authenticated;

create or replace function public.get_customer_order_list_summary(
  p_customer_id uuid default null
)
returns table (
  total_count bigint,
  open_count bigint,
  completed_count bigint,
  currency_count bigint,
  total_value numeric,
  currency_code text
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    count(*)::bigint as total_count,
    count(*) filter (where o.status not in ('completed', 'cancelled'))::bigint as open_count,
    count(*) filter (where o.status = 'completed')::bigint as completed_count,
    count(distinct o.currency_code)::bigint as currency_count,
    case
      when count(distinct o.currency_code) <= 1 then
        coalesce(
          sum(
            case
              when coalesce(o.grand_total, 0) > 0 or coalesce(o.total_amount, 0) = 0
                then coalesce(o.grand_total, 0)
              else coalesce(o.total_amount, 0)
            end
          ),
          0
        )
      else null
    end as total_value,
    case
      when count(distinct o.currency_code) <= 1 then max(o.currency_code)
      else null
    end as currency_code
  from public.customer_orders o
  where p_customer_id is null or o.customer_id = p_customer_id;
$$;

revoke all on function public.get_customer_order_list_summary(uuid) from public;
revoke all on function public.get_customer_order_list_summary(uuid) from anon;
grant execute on function public.get_customer_order_list_summary(uuid) to authenticated;
