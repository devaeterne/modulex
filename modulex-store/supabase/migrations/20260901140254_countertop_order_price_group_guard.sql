create or replace function private.enforce_countertop_order_price_group()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_order_price_group_id uuid;
begin
  select o.price_group_id
    into v_order_price_group_id
  from public.customer_orders o
  where o.id = new.order_id;

  if v_order_price_group_id is null then
    raise exception 'Countertop order requires a price group.';
  end if;

  if v_order_price_group_id is distinct from new.price_group_id then
    raise exception 'Countertop price group must match the order price group.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_countertop_order_price_group() from public, anon, authenticated;

drop trigger if exists countertop_order_price_group_guard on public.countertop_configurations;
create trigger countertop_order_price_group_guard
before insert or update of order_id, price_group_id
on public.countertop_configurations
for each row execute function private.enforce_countertop_order_price_group();
