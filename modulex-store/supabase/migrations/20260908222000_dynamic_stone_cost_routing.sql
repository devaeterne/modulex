begin;

-- Dynamic Stone exposes authenticated dealer pricing. That value belongs to the
-- internal Cost price group, never the customer-facing base List Price group.
-- Keep the historical function/trigger name for compatibility with the existing
-- approval trigger while making the destination vendor-aware.
create or replace function private.apply_vendor_list_price_on_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_target_group_id uuid;
  v_target_group_count integer;
  v_currency varchar(3);
  v_pricing_model text;
  v_current_id uuid;
  v_current_amount numeric(18,4);
  v_now timestamptz := clock_timestamp();
begin
  if new.vendor_price_reference is null then
    return new;
  end if;

  if new.canonical_product_id is null then
    raise exception 'Approved vendor item must have a canonical product before price propagation.';
  end if;

  if new.vendor_price_reference < 0 then
    raise exception 'Vendor price cannot be negative.';
  end if;

  v_currency := upper(btrim(coalesce(new.vendor_currency, '')));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Approved vendor item has an invalid vendor currency.';
  end if;

  select pt.pricing_model
  into v_pricing_model
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  where p.id = new.canonical_product_id
    and p.status <> 'archived';

  if v_pricing_model is null then
    raise exception 'Approved vendor item references a missing or archived canonical product.';
  end if;

  if v_pricing_model <> 'price_group' then
    raise exception 'Approved vendor item canonical Product Type does not use Price Group pricing.';
  end if;

  if new.vendor_code = 'dynamicstone' then
    select count(*)
    into v_target_group_count
    from public.price_groups
    where lower(btrim(name)) = 'cost'
      and is_active = true
      and internal_only = true
      and available_for_orders = false;

    if v_target_group_count <> 1 then
      raise exception 'Exactly one active internal Cost price group is required for Dynamic Stone.';
    end if;

    select id
    into v_target_group_id
    from public.price_groups
    where lower(btrim(name)) = 'cost'
      and is_active = true
      and internal_only = true
      and available_for_orders = false;
  else
    select count(*)
    into v_target_group_count
    from public.price_groups
    where is_base_price = true
      and is_active = true;

    if v_target_group_count <> 1 then
      raise exception 'Exactly one active base List Price group is required.';
    end if;

    select id
    into v_target_group_id
    from public.price_groups
    where is_base_price = true
      and is_active = true;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.canonical_product_id::text || ':' || v_target_group_id::text || ':' || v_currency,
      0
    )
  );

  select pp.id, pp.amount
  into v_current_id, v_current_amount
  from public.product_prices pp
  where pp.product_id = new.canonical_product_id
    and pp.price_group_id = v_target_group_id
    and pp.currency_code = v_currency
    and pp.is_active = true
    and pp.valid_to is null
  order by pp.valid_from desc
  limit 1
  for update;

  if v_current_id is not null
     and v_current_amount = round(new.vendor_price_reference, 4)
  then
    return new;
  end if;

  if v_current_id is not null then
    update public.product_prices
    set is_active = false,
        valid_to = v_now,
        updated_by = new.reviewed_by
    where id = v_current_id;
  end if;

  insert into public.product_prices (
    product_id,
    price_group_id,
    amount,
    currency_code,
    valid_from,
    valid_to,
    is_active,
    created_by,
    updated_by
  )
  values (
    new.canonical_product_id,
    v_target_group_id,
    round(new.vendor_price_reference, 4),
    v_currency,
    v_now,
    null,
    true,
    new.reviewed_by,
    new.reviewed_by
  );

  return new;
end;
$$;

revoke all on function private.apply_vendor_list_price_on_approval() from public;

-- Backfill any already-approved Dynamic Stone rows into Cost. At the time this
-- migration was prepared production had zero approved/linked Dynamic Stone
-- rows, so this is defensive rather than corrective.
do $$
declare
  v_cost_group_id uuid;
  v_cost_group_count integer;
  v_now timestamptz := clock_timestamp();
begin
  select count(*)
  into v_cost_group_count
  from public.price_groups
  where lower(btrim(name)) = 'cost'
    and is_active = true
    and internal_only = true
    and available_for_orders = false;

  if v_cost_group_count <> 1 then
    raise exception 'Exactly one active internal Cost price group is required for Dynamic Stone backfill.';
  end if;

  select id
  into v_cost_group_id
  from public.price_groups
  where lower(btrim(name)) = 'cost'
    and is_active = true
    and internal_only = true
    and available_for_orders = false;

  with candidates as (
    select distinct on (
      v.canonical_product_id,
      upper(btrim(v.vendor_currency))
    )
      v.canonical_product_id as product_id,
      round(v.vendor_price_reference, 4) as amount,
      upper(btrim(v.vendor_currency))::varchar(3) as currency_code,
      v.reviewed_by
    from public.vendor_catalog_items v
    join public.products p on p.id = v.canonical_product_id
    join public.product_types pt on pt.id = p.product_type_id
    where v.vendor_code = 'dynamicstone'
      and v.review_status = 'APPROVED'
      and v.canonical_product_id is not null
      and v.vendor_price_reference is not null
      and v.vendor_price_reference >= 0
      and upper(btrim(coalesce(v.vendor_currency, ''))) ~ '^[A-Z]{3}$'
      and p.status <> 'archived'
      and pt.pricing_model = 'price_group'
    order by
      v.canonical_product_id,
      upper(btrim(v.vendor_currency)),
      v.reviewed_at desc nulls last,
      v.updated_at desc
  )
  update public.product_prices pp
  set is_active = false,
      valid_to = v_now,
      updated_by = c.reviewed_by
  from candidates c
  where pp.product_id = c.product_id
    and pp.price_group_id = v_cost_group_id
    and pp.currency_code = c.currency_code
    and pp.is_active = true
    and pp.valid_to is null
    and pp.amount is distinct from c.amount;

  with candidates as (
    select distinct on (
      v.canonical_product_id,
      upper(btrim(v.vendor_currency))
    )
      v.canonical_product_id as product_id,
      round(v.vendor_price_reference, 4) as amount,
      upper(btrim(v.vendor_currency))::varchar(3) as currency_code,
      v.reviewed_by
    from public.vendor_catalog_items v
    join public.products p on p.id = v.canonical_product_id
    join public.product_types pt on pt.id = p.product_type_id
    where v.vendor_code = 'dynamicstone'
      and v.review_status = 'APPROVED'
      and v.canonical_product_id is not null
      and v.vendor_price_reference is not null
      and v.vendor_price_reference >= 0
      and upper(btrim(coalesce(v.vendor_currency, ''))) ~ '^[A-Z]{3}$'
      and p.status <> 'archived'
      and pt.pricing_model = 'price_group'
    order by
      v.canonical_product_id,
      upper(btrim(v.vendor_currency)),
      v.reviewed_at desc nulls last,
      v.updated_at desc
  )
  insert into public.product_prices (
    product_id,
    price_group_id,
    amount,
    currency_code,
    valid_from,
    valid_to,
    is_active,
    created_by,
    updated_by
  )
  select
    c.product_id,
    v_cost_group_id,
    c.amount,
    c.currency_code,
    v_now,
    null,
    true,
    c.reviewed_by,
    c.reviewed_by
  from candidates c
  where not exists (
    select 1
    from public.product_prices pp
    where pp.product_id = c.product_id
      and pp.price_group_id = v_cost_group_id
      and pp.currency_code = c.currency_code
      and pp.is_active = true
      and pp.valid_to is null
  );
end;
$$;

commit;
