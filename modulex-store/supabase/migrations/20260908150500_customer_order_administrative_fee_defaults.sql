-- Administrative Fee create-path closeout.
-- Existing Orders were explicitly backfilled to 0% by the base migration. For every
-- future Order, omitted fee input snapshots the current General Settings default.

alter table public.customer_orders
  alter column administrative_fee_percent drop default;

create or replace function public.set_customer_order_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.order_number is null or trim(new.order_number) = '' then
    new.order_number := 'ORD-' || lpad(nextval('public.customer_order_number_seq')::text, 6, '0');
  end if;

  new.order_number := upper(trim(new.order_number));
  new.currency_code := upper(trim(coalesce(new.currency_code, 'USD')));

  if new.administrative_fee_percent is null then
    select coalesce(gs.administrative_fee_default_percent, 3.000)
    into new.administrative_fee_percent
    from public.general_settings gs
    where gs.id = 1;
    new.administrative_fee_percent := coalesce(new.administrative_fee_percent, 3.000);
  end if;

  return new;
end;
$$;

-- Project Orders use the same canonical Order create boundary and can explicitly snapshot
-- an override while old 15-argument callers still receive the Settings default from the
-- customer_orders BEFORE INSERT trigger.
create or replace function private.create_project_customer_order(
  p_project_id uuid,
  p_items jsonb,
  p_price_group_id uuid,
  p_billing_address_id uuid,
  p_shipping_address_id uuid,
  p_expected_delivery_date date,
  p_customer_reference text,
  p_customer_notes text,
  p_internal_notes text,
  p_tax_rate numeric,
  p_order_discount_amount numeric,
  p_payment_method_id uuid,
  p_payment_commission_percent numeric,
  p_initial_status text,
  p_fulfillment_type text,
  p_administrative_fee_percent numeric
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
begin
  select cp.customer_id into v_customer_id
  from public.customer_projects cp
  where cp.id = p_project_id;
  if v_customer_id is null then raise exception 'Project not found.'; end if;

  v_order_id := private.create_customer_order(
    v_customer_id,p_items,p_price_group_id,p_billing_address_id,p_shipping_address_id,
    p_expected_delivery_date,p_customer_reference,p_customer_notes,p_internal_notes,
    p_tax_rate,p_order_discount_amount,p_payment_method_id,p_payment_commission_percent,
    p_initial_status,p_fulfillment_type,p_administrative_fee_percent
  );

  update public.customer_orders
  set project_id=p_project_id, updated_by=auth.uid()
  where id=v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.create_project_customer_order(
  p_project_id uuid,
  p_items jsonb,
  p_price_group_id uuid,
  p_billing_address_id uuid,
  p_shipping_address_id uuid,
  p_expected_delivery_date date,
  p_customer_reference text,
  p_customer_notes text,
  p_internal_notes text,
  p_tax_rate numeric,
  p_order_discount_amount numeric,
  p_payment_method_id uuid,
  p_payment_commission_percent numeric,
  p_initial_status text,
  p_fulfillment_type text,
  p_administrative_fee_percent numeric
)
returns uuid
language sql
set search_path to 'pg_catalog','private'
as $$
  select private.create_project_customer_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16);
$$;

revoke all on function public.create_project_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text,numeric) from public, anon, authenticated, service_role;
grant execute on function public.create_project_customer_order(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text,text,numeric) to authenticated;
