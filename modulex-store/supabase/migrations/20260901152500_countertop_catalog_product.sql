create or replace function private.save_countertop_catalog_product(
  p_kind text,
  p_product_id uuid default null,
  p_name text default null,
  p_sku text default null,
  p_brand_id uuid default null,
  p_stone_type_id uuid default null,
  p_material_price_band_id uuid default null,
  p_vendor_name text default null,
  p_source_ref text default null,
  p_prices jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_kind text := lower(nullif(btrim(p_kind), ''));
  v_name text := nullif(btrim(p_name), '');
  v_sku text := upper(nullif(btrim(p_sku), ''));
  v_brand public.product_brands;
  v_category public.product_categories;
  v_type public.product_types;
  v_existing public.products;
  v_product_id uuid;
  v_expected_price_groups integer;
  v_supplied_price_groups integer;
  v_price_changes jsonb;
  v_metadata jsonb;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'Countertop catalog management requires admin permission.' using errcode='42501';
  end if;

  if v_kind not in ('stone','sink') then
    raise exception 'Countertop catalog kind must be stone or sink.';
  end if;

  if v_name is null or v_sku is null or p_brand_id is null then
    raise exception 'Name, SKU and brand are required.';
  end if;

  select * into v_brand
  from public.product_brands
  where id = p_brand_id and status = 'active';

  if v_brand.id is null then
    raise exception 'Active brand is required.';
  end if;

  select * into v_type
  from public.product_types
  where code = case when v_kind='stone' then 'STONE' else 'SINK' end
    and is_active;

  select * into v_category
  from public.product_categories
  where lower(name) = case when v_kind='stone' then 'stone' else 'sink' end
    and status = 'active';

  if v_type.id is null or v_type.default_uom_id is null or v_category.id is null then
    raise exception 'Canonical Countertop product type, UOM and category must be active.';
  end if;

  if p_product_id is not null then
    select * into v_existing
    from public.products
    where id = p_product_id
    for update;

    if v_existing.id is null then
      raise exception 'Countertop catalog product not found.';
    end if;

    if v_existing.product_type_id is distinct from v_type.id then
      raise exception 'Countertop catalog cannot change an existing product type.';
    end if;
  end if;

  if exists (
    select 1 from public.products p
    where upper(p.sku) = v_sku
      and (p_product_id is null or p.id <> p_product_id)
  ) then
    raise exception 'SKU already exists.';
  end if;

  if v_kind = 'stone' then
    if p_stone_type_id is null or p_material_price_band_id is null then
      raise exception 'Stone type and material price band are required.';
    end if;

    if not exists (
      select 1 from public.countertop_stone_types
      where id = p_stone_type_id and is_active
    ) then
      raise exception 'Active stone type is required.';
    end if;

    if not exists (
      select 1 from public.countertop_material_price_bands
      where id = p_material_price_band_id and is_active
    ) then
      raise exception 'Active material price band is required.';
    end if;
  end if;

  v_metadata := coalesce(v_existing.metadata, '{}'::jsonb);
  if v_kind = 'sink' then
    v_metadata := v_metadata || jsonb_build_object('product_kind','sink');
  end if;

  v_product_id := public.save_product_master_v2(
    jsonb_build_object(
      'id', p_product_id,
      'sku', v_sku,
      'barcode', coalesce(v_existing.barcode,''),
      'name', v_name,
      'description', coalesce(v_existing.description,''),
      'brand_id', v_brand.id,
      'category_id', v_category.id,
      'base_product_code', coalesce(v_existing.base_product_code,v_sku),
      'color_code', coalesce(v_existing.color_code,'DEFAULT'),
      'color_name', coalesce(v_existing.color_name,''),
      'brand', v_brand.name,
      'category', v_category.name,
      'product_type_id', v_type.id,
      'uom_id', v_type.default_uom_id,
      'min_stock_level', coalesce(v_existing.min_stock_level,0),
      'status', coalesce(v_existing.status::text,'active'),
      'metadata', v_metadata
    ),
    case when v_kind='stone' then jsonb_build_object(
      'stone_type_id', p_stone_type_id,
      'material_price_band_id', p_material_price_band_id,
      'vendor_name', nullif(btrim(p_vendor_name),''),
      'source_ref', nullif(btrim(p_source_ref),'')
    ) else null end
  );

  if v_kind = 'sink' then
    -- Product Master intentionally preserves existing metadata during edits.
    -- Countertop Catalog owns this domain marker, so ensure legacy Sink rows
    -- become discoverable by the existing configurator as part of this same transaction.
    update public.products
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('product_kind','sink')
    where id = v_product_id;

    if p_prices is null or jsonb_typeof(p_prices) <> 'array' then
      raise exception 'Sink prices must be supplied for every order price group.';
    end if;

    select count(*) into v_expected_price_groups
    from public.price_groups pg
    where pg.is_active
      and pg.available_for_orders
      and not pg.internal_only;

    select count(distinct (item->>'price_group_id')) into v_supplied_price_groups
    from jsonb_array_elements(p_prices) item;

    if v_expected_price_groups = 0 or v_supplied_price_groups <> v_expected_price_groups
       or jsonb_array_length(p_prices) <> v_expected_price_groups then
      raise exception 'Sink prices must include each active order price group exactly once.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_prices) item
      left join public.price_groups pg
        on pg.id = nullif(item->>'price_group_id','')::uuid
       and pg.is_active
       and pg.available_for_orders
       and not pg.internal_only
      where pg.id is null
        or nullif(btrim(item->>'amount'),'') is null
        or (item->>'amount')::numeric < 0
    ) then
      raise exception 'Every sink price must use an active order price group and a non-negative amount.';
    end if;

    select jsonb_agg(jsonb_build_object(
      'product_id', v_product_id,
      'price_group_id', item->>'price_group_id',
      'amount', item->>'amount'
    ))
    into v_price_changes
    from jsonb_array_elements(p_prices) item;

    perform public.set_product_prices_bulk(v_price_changes, 'USD');
  end if;

  return v_product_id;
end;
$$;

create or replace function public.save_countertop_catalog_product(
  p_kind text,
  p_product_id uuid default null,
  p_name text default null,
  p_sku text default null,
  p_brand_id uuid default null,
  p_stone_type_id uuid default null,
  p_material_price_band_id uuid default null,
  p_vendor_name text default null,
  p_source_ref text default null,
  p_prices jsonb default null
)
returns uuid
language sql
set search_path = ''
as $$
  select private.save_countertop_catalog_product($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$$;

revoke all on function private.save_countertop_catalog_product(text,uuid,text,text,uuid,uuid,uuid,text,text,jsonb) from public, anon, service_role;
revoke all on function public.save_countertop_catalog_product(text,uuid,text,text,uuid,uuid,uuid,text,text,jsonb) from public, anon, service_role;
grant execute on function private.save_countertop_catalog_product(text,uuid,text,text,uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.save_countertop_catalog_product(text,uuid,text,text,uuid,uuid,uuid,text,text,jsonb) to authenticated;
