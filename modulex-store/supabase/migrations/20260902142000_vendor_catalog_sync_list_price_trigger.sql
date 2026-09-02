begin;

create or replace function private.apply_vendor_list_price_on_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_base_group_id uuid;
  v_base_group_count integer;
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
    raise exception 'Approved vendor item must have a canonical product before List Price propagation.';
  end if;

  if new.vendor_price_reference < 0 then
    raise exception 'Vendor List Price cannot be negative.';
  end if;

  v_currency := upper(btrim(coalesce(new.vendor_currency, '')));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Approved vendor item has an invalid vendor currency.';
  end if;

  select count(*)
  into v_base_group_count
  from public.price_groups
  where is_base_price = true
    and is_active = true;

  if v_base_group_count <> 1 then
    raise exception 'Exactly one active base List Price group is required.';
  end if;

  select id
  into v_base_group_id
  from public.price_groups
  where is_base_price = true
    and is_active = true;

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

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.canonical_product_id::text || ':' || v_base_group_id::text || ':' || v_currency,
      0
    )
  );

  select pp.id, pp.amount
  into v_current_id, v_current_amount
  from public.product_prices pp
  where pp.product_id = new.canonical_product_id
    and pp.price_group_id = v_base_group_id
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
        valid_to = v_now
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
    v_base_group_id,
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

drop trigger if exists trg_vendor_catalog_items_list_price_on_approval
on public.vendor_catalog_items;

create trigger trg_vendor_catalog_items_list_price_on_approval
after update of review_status, canonical_product_id
on public.vendor_catalog_items
for each row
when (
  new.review_status = 'APPROVED'
  and new.canonical_product_id is not null
  and (
    old.review_status is distinct from new.review_status
    or old.canonical_product_id is distinct from new.canonical_product_id
  )
)
execute function private.apply_vendor_list_price_on_approval();

commit;
