begin;

-- A1 compatibility: confirmation readiness is enforced when a Draft order
-- enters Confirmed and whenever commercial fields are changed afterward.
-- Historical Confirmed orders may predate the new shipping/tax readiness
-- contract, so a status-only fulfillment advance must not retroactively
-- revalidate those legacy snapshots.

drop trigger if exists a1_customer_order_contract_guard on public.customer_orders;

create constraint trigger a1_customer_order_contract_guard
after insert or update of
  price_group_id,
  payment_method_id,
  shipping_address_id,
  tax_rate,
  fulfillment_type
on public.customer_orders
deferrable initially deferred
for each row
execute function private.guard_customer_order_contract_trigger();

notify pgrst, 'reload schema';

commit;
