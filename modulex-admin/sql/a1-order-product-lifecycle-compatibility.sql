begin;

-- A1 product lifecycle compatibility.
-- Draft orders remain working records and may retain a product that was later
-- deactivated so the commercial draft can still be inspected/revised. Before a
-- Draft order enters Confirmed — and whenever a non-Draft commercial mutation is
-- validated — every referenced product/variant must be Active.

create or replace function private.validate_customer_order_confirmation(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders%rowtype;
  v_rule_rate numeric;
begin
  select * into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  if v_order.fulfillment_type not in ('pickup','delivery','delivery_installation') then
    raise exception 'Invalid fulfillment type.';
  end if;

  if v_order.tax_rate is null or v_order.tax_rate < 0 or v_order.tax_rate > 100 then
    raise exception 'Tax rate must be between 0 and 100.';
  end if;

  if not exists (
    select 1
    from public.price_groups pg
    where pg.id = v_order.price_group_id
      and pg.is_active = true
      and coalesce(pg.available_for_orders, true) = true
      and coalesce(pg.internal_only, false) = false
  ) then
    raise exception 'This price group cannot be used on customer orders.';
  end if;

  if not exists (
    select 1
    from public.payment_methods pm
    where pm.id = v_order.payment_method_id
      and pm.is_active = true
  ) then
    raise exception 'Payment method does not exist or is inactive.';
  end if;

  if v_order.fulfillment_type in ('delivery','delivery_installation') then
    if v_order.shipping_address_id is null then
      raise exception 'A shipping address is required before confirming a delivery order.';
    end if;

    if not exists (
      select 1
      from public.customer_addresses ca
      where ca.id = v_order.shipping_address_id
        and ca.customer_id = v_order.customer_id
        and ca.is_active = true
    ) then
      raise exception 'Shipping address must be an active address owned by this customer.';
    end if;
  end if;

  select r.tax_rate
  into v_rule_rate
  from public.order_tax_rules r
  where r.fulfillment_type = v_order.fulfillment_type
    and r.is_active = true
    and r.tax_rate is not null
  limit 1;

  if v_rule_rate is not null
     and abs(coalesce(v_order.tax_rate, 0) - v_rule_rate) > 0.0005 then
    raise exception 'Tax rate must match the active fulfillment tax rule (%).', v_rule_rate;
  end if;

  if not exists (
    select 1
    from public.customer_order_items i
    where i.order_id = p_order_id
  ) then
    raise exception 'At least one order item is required before confirmation.';
  end if;

  if exists (
    select 1
    from public.customer_order_items i
    left join public.products p on p.id = i.product_id
    where i.order_id = p_order_id
      and (
        i.product_id is null
        or p.id is null
        or p.status <> 'active'
        or i.quantity is null
        or i.quantity <= 0
        or i.unit_price is null
        or i.unit_price < 0
        or i.discount_percent is null
        or i.discount_percent < 0
        or i.discount_percent > 100
        or i.price_source not in ('price_group','manual')
      )
  ) then
    raise exception 'Confirmed orders require active products with valid quantity, price, discount, and pricing source.';
  end if;
end;
$$;

revoke all on function private.validate_customer_order_confirmation(uuid) from public;
revoke all on function private.validate_customer_order_confirmation(uuid) from anon;
revoke all on function private.validate_customer_order_confirmation(uuid) from authenticated;

notify pgrst, 'reload schema';

commit;
