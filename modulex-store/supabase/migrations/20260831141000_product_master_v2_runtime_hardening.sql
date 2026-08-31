-- Product Master UX v2 runtime hardening.
-- This migration is additive and follows 20260831140000_product_master_v2_dynamic_types_uom.sql.

-- Keep the legacy products.unit compatibility mirror in the pre-v2 lowercase shape.
create or replace function private.validate_product_master_contract() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_type public.product_types;
  v_uom public.units_of_measure;
begin
  if new.uom_id is null then
    select id into new.uom_id
    from public.units_of_measure
    where code=upper(coalesce(nullif(btrim(new.unit),''),'PIECE'))
    limit 1;
    if new.uom_id is null then
      select id into new.uom_id from public.units_of_measure where code='PIECE';
    end if;
  end if;

  if new.product_type_id is null then
    select id into new.product_type_id
    from public.product_types
    where code=case when lower(coalesce(new.metadata->>'product_kind',''))='sink' then 'SINK' else 'STANDARD' end;
  end if;

  select * into v_type from public.product_types where id=new.product_type_id;
  select * into v_uom from public.units_of_measure where id=new.uom_id;

  if v_type.id is null or not v_type.is_active then
    raise exception 'Product type is inactive or invalid.';
  end if;
  if v_uom.id is null or not v_uom.is_active then
    raise exception 'Unit of measure is inactive or invalid.';
  end if;
  if not exists (
    select 1 from public.product_type_allowed_uoms a
    where a.product_type_id=v_type.id and a.uom_id=v_uom.id
  ) then
    raise exception 'Unit of measure is not allowed for this product type.';
  end if;

  new.unit := lower(v_uom.code);

  if v_type.code='SINK' then
    new.metadata := jsonb_set(coalesce(new.metadata,'{}'::jsonb),'{product_kind}','"sink"'::jsonb,true);
  elsif lower(coalesce(new.metadata->>'product_kind',''))='sink' then
    new.metadata := new.metadata - 'product_kind';
  end if;

  return new;
end;
$$;

-- Product + optional Stone profile remains one database transaction. The prior
-- migration used the countertop reference RPC with the wrong positional signature;
-- use named arguments so the contract is explicit and stable.
create or replace function public.save_product_master_v2(p_product jsonb, p_stone_profile jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_id uuid;
  v_old public.products;
  v_type public.product_types;
  v_uom public.units_of_measure;
  v_profile public.countertop_stone_product_profiles;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'Product management permission required.' using errcode='42501';
  end if;

  v_id := nullif(p_product->>'id','')::uuid;

  select * into v_type
  from public.product_types
  where id=(p_product->>'product_type_id')::uuid and is_active;

  select * into v_uom
  from public.units_of_measure
  where id=(p_product->>'uom_id')::uuid and is_active;

  if v_type.id is null or v_uom.id is null then
    raise exception 'Active product type and UOM are required.';
  end if;

  if not exists (
    select 1 from public.product_type_allowed_uoms
    where product_type_id=v_type.id and uom_id=v_uom.id
  ) then
    raise exception 'Unit of measure is not allowed for this product type.';
  end if;

  if v_id is not null then
    select * into v_old from public.products where id=v_id for update;
    if v_old.id is null then
      raise exception 'Product not found.';
    end if;

    if v_old.product_type_id is distinct from v_type.id and (
      exists(select 1 from public.inventory where product_id=v_id and (quantity>0 or reserved_quantity>0))
      or exists(select 1 from public.customer_order_items where product_id=v_id)
      or exists(select 1 from public.countertop_configurations where stone_product_id=v_id)
    ) then
      raise exception 'Product type cannot change while business history or stock dependencies exist.';
    end if;
  end if;

  if v_type.pricing_model='countertop_material_band' and p_stone_profile is null then
    raise exception 'Stone profile is required for countertop material products.';
  end if;

  if v_type.pricing_model<>'countertop_material_band'
     and v_id is not null
     and exists(select 1 from public.countertop_configurations where stone_product_id=v_id) then
    raise exception 'Configured stone products cannot change type.';
  end if;

  if v_id is null then
    insert into public.products(
      sku,barcode,name,description,brand_id,category_id,
      base_product_code,color_code,color_name,brand,category,unit,
      product_type_id,uom_id,min_stock_level,status,metadata
    ) values (
      p_product->>'sku',
      nullif(p_product->>'barcode',''),
      p_product->>'name',
      nullif(p_product->>'description',''),
      (p_product->>'brand_id')::uuid,
      (p_product->>'category_id')::uuid,
      coalesce(nullif(p_product->>'base_product_code',''),p_product->>'sku'),
      coalesce(nullif(p_product->>'color_code',''),'DEFAULT'),
      nullif(p_product->>'color_name',''),
      p_product->>'brand',
      p_product->>'category',
      lower(v_uom.code),
      v_type.id,
      v_uom.id,
      (p_product->>'min_stock_level')::numeric,
      (p_product->>'status')::product_status,
      coalesce(p_product->'metadata','{}'::jsonb)
    ) returning id into v_id;
  else
    update public.products
    set sku=p_product->>'sku',
        barcode=nullif(p_product->>'barcode',''),
        name=p_product->>'name',
        description=nullif(p_product->>'description',''),
        brand_id=(p_product->>'brand_id')::uuid,
        category_id=(p_product->>'category_id')::uuid,
        base_product_code=coalesce(nullif(p_product->>'base_product_code',''),p_product->>'sku'),
        color_code=coalesce(nullif(p_product->>'color_code',''),'DEFAULT'),
        color_name=nullif(p_product->>'color_name',''),
        brand=p_product->>'brand',
        category=p_product->>'category',
        unit=lower(v_uom.code),
        product_type_id=v_type.id,
        uom_id=v_uom.id,
        min_stock_level=(p_product->>'min_stock_level')::numeric,
        status=(p_product->>'status')::product_status,
        metadata=coalesce(v_old.metadata,p_product->'metadata','{}'::jsonb)
    where id=v_id;
  end if;

  if v_type.pricing_model='countertop_material_band' then
    perform public.upsert_countertop_reference(
      p_kind => 'stone_profile',
      p_product_id => v_id,
      p_stone_type_id => (p_stone_profile->>'stone_type_id')::uuid,
      p_material_price_band_id => (p_stone_profile->>'material_price_band_id')::uuid,
      p_vendor_name => nullif(p_stone_profile->>'vendor_name',''),
      p_source_ref => nullif(p_stone_profile->>'source_ref',''),
      p_is_active => true
    );
  else
    select * into v_profile
    from public.countertop_stone_product_profiles
    where product_id=v_id and is_active
    limit 1;

    if v_profile.product_id is not null then
      perform public.upsert_countertop_reference(
        p_kind => 'stone_profile',
        p_product_id => v_id,
        p_stone_type_id => v_profile.stone_type_id,
        p_material_price_band_id => v_profile.material_price_band_id,
        p_vendor_name => v_profile.vendor_name,
        p_source_ref => v_profile.source_ref,
        p_is_active => false
      );
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_product_master_v2(jsonb,jsonb) from public,anon;
grant execute on function public.save_product_master_v2(jsonb,jsonb) to authenticated;

-- Keep relation invariants enforceable even for direct admin Data API mutations.
create or replace function private.guard_product_type_uom_relation() returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='UPDATE' and (
    old.product_type_id is distinct from new.product_type_id
    or old.uom_id is distinct from new.uom_id
  ) then
    raise exception 'Product type/UOM relation identity cannot be changed in place.';
  end if;

  if tg_op='DELETE' then
    if old.is_default or exists (
      select 1 from public.product_types t
      where t.id=old.product_type_id and t.default_uom_id=old.uom_id
    ) then
      raise exception 'Default UOM cannot be removed from a product type.';
    end if;

    if exists (
      select 1 from public.products p
      where p.product_type_id=old.product_type_id and p.uom_id=old.uom_id
    ) then
      raise exception 'A UOM used by products of this type cannot be removed.';
    end if;
  end if;

  if tg_op='UPDATE' and old.is_default and not new.is_default and exists (
    select 1 from public.product_types t
    where t.id=old.product_type_id and t.default_uom_id=old.uom_id
  ) then
    raise exception 'A product type must retain its configured default UOM.';
  end if;

  if tg_op='UPDATE' and not old.is_default and new.is_default and not exists (
    select 1 from public.product_types t
    where t.id=new.product_type_id and t.default_uom_id=new.uom_id
  ) then
    raise exception 'Default relation must match product_types.default_uom_id.';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_product_type_uom_relation_guard on public.product_type_allowed_uoms;
create trigger trg_product_type_uom_relation_guard
before update or delete on public.product_type_allowed_uoms
for each row execute function private.guard_product_type_uom_relation();

create unique index if not exists product_type_one_default_uom_idx
on public.product_type_allowed_uoms(product_type_id)
where is_default;

-- SECURITY INVOKER needs table DELETE privilege for replacing obsolete allowed-UOM rows.
-- RLS still restricts mutation to the existing admin management policy.
grant delete on public.product_type_allowed_uoms to authenticated;

create or replace function public.save_product_type_v2(
  p_id uuid default null,
  p_code text default null,
  p_name text default null,
  p_description text default null,
  p_default_uom_id uuid default null,
  p_allowed_uom_ids uuid[] default '{}',
  p_inventory_tracking boolean default true,
  p_reservable boolean default true,
  p_requires_variant_identity boolean default true,
  p_pricing_model text default 'none',
  p_qr_required boolean default false,
  p_store_eligible boolean default false,
  p_is_active boolean default true
) returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_id uuid;
  v_uom uuid;
  v_old public.product_types;
  v_allowed uuid[] := coalesce(p_allowed_uom_ids,'{}'::uuid[]);
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'Product management permission required.' using errcode='42501';
  end if;

  if nullif(btrim(coalesce(p_code,'')),'') is null
     or nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'Product type name and code are required.';
  end if;

  if p_pricing_model not in ('price_group','countertop_material_band','none') then
    raise exception 'Unsupported pricing model.';
  end if;

  if p_default_uom_id is null or not (p_default_uom_id = any(v_allowed)) then
    raise exception 'Default UOM must be allowed.';
  end if;

  foreach v_uom in array v_allowed loop
    if not exists(select 1 from public.units_of_measure where id=v_uom and is_active) then
      raise exception 'Allowed UOM is inactive or invalid.';
    end if;
  end loop;

  if p_id is null then
    v_id := gen_random_uuid();
    insert into public.product_types(
      id,code,name,description,default_uom_id,inventory_tracking,reservable,
      requires_variant_identity,pricing_model,qr_required,store_eligible,is_active
    ) values (
      v_id,upper(btrim(p_code)),btrim(p_name),nullif(btrim(p_description),''),null,
      p_inventory_tracking,p_reservable,p_requires_variant_identity,p_pricing_model,
      p_qr_required,p_store_eligible,p_is_active
    );
  else
    v_id := p_id;
    select * into v_old from public.product_types where id=v_id for update;
    if v_old.id is null then
      raise exception 'Product type not found.';
    end if;

    if exists (
      select 1 from public.products
      where product_type_id=v_id and not (uom_id = any(v_allowed))
    ) then
      raise exception 'Cannot remove a UOM used by products of this type.';
    end if;

    update public.product_types
    set code=upper(btrim(p_code)),
        name=btrim(p_name),
        description=nullif(btrim(p_description),''),
        inventory_tracking=p_inventory_tracking,
        reservable=p_reservable,
        requires_variant_identity=p_requires_variant_identity,
        pricing_model=p_pricing_model,
        qr_required=p_qr_required,
        store_eligible=p_store_eligible,
        is_active=p_is_active,
        updated_at=now()
    where id=v_id;
  end if;

  insert into public.product_type_allowed_uoms(product_type_id,uom_id,is_default)
  select v_id,x,false
  from unnest(v_allowed) as x
  on conflict(product_type_id,uom_id) do nothing;

  update public.product_types
  set default_uom_id=p_default_uom_id,
      updated_at=now()
  where id=v_id;

  update public.product_type_allowed_uoms
  set is_default=false
  where product_type_id=v_id
    and is_default
    and uom_id<>p_default_uom_id;

  update public.product_type_allowed_uoms
  set is_default=true
  where product_type_id=v_id
    and uom_id=p_default_uom_id;

  delete from public.product_type_allowed_uoms
  where product_type_id=v_id
    and not (uom_id = any(v_allowed));

  if (select count(*) from public.product_type_allowed_uoms where product_type_id=v_id and is_default) <> 1 then
    raise exception 'Product type must have exactly one default UOM.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_product_type_v2(uuid,text,text,text,uuid,uuid[],boolean,boolean,boolean,text,boolean,boolean,boolean) from public,anon;
grant execute on function public.save_product_type_v2(uuid,text,text,text,uuid,uuid[],boolean,boolean,boolean,text,boolean,boolean,boolean) to authenticated;
