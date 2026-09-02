/* Stone Vendor Catalog Foundation
 * Extends the existing vendor review queue with Stone-specific taxonomy and payloads.
 * Vendor inventory remains reference-only and never mutates Modulex warehouse inventory.
 * Stone vendor price is intentionally optional; selling price is assigned through Countertop Material Bands.
 */

alter table public.countertop_stone_product_profiles
  alter column material_price_band_id drop not null;

alter table public.countertop_stone_types
  add column if not exists source_kind text not null default 'manual',
  add column if not exists source_vendor_code text,
  add column if not exists review_status text not null default 'approved';

alter table public.countertop_stone_types
  drop constraint if exists countertop_stone_types_source_kind_check;
alter table public.countertop_stone_types
  add constraint countertop_stone_types_source_kind_check
  check (source_kind in ('manual','vendor'));

alter table public.countertop_stone_types
  drop constraint if exists countertop_stone_types_review_status_check;
alter table public.countertop_stone_types
  add constraint countertop_stone_types_review_status_check
  check (review_status in ('approved','pending_review'));

create table if not exists public.vendor_stone_type_mappings (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  vendor_type_name text not null,
  vendor_type_key text not null,
  stone_type_id uuid not null references public.countertop_stone_types(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_stone_type_mappings_identity_unique unique (vendor_code, vendor_type_key),
  constraint vendor_stone_type_mappings_vendor_code_check check (btrim(vendor_code) <> ''),
  constraint vendor_stone_type_mappings_vendor_type_name_check check (btrim(vendor_type_name) <> ''),
  constraint vendor_stone_type_mappings_vendor_type_key_check check (btrim(vendor_type_key) <> '')
);

create index if not exists idx_vendor_stone_type_mappings_stone_type
  on public.vendor_stone_type_mappings(stone_type_id, vendor_code);

alter table public.vendor_catalog_items
  add column if not exists catalog_domain text not null default 'sink',
  add column if not exists stone_type_id uuid references public.countertop_stone_types(id) on delete restrict,
  add column if not exists stone_data jsonb not null default '{}'::jsonb;

alter table public.vendor_catalog_items
  drop constraint if exists vendor_catalog_items_catalog_domain_check;
alter table public.vendor_catalog_items
  add constraint vendor_catalog_items_catalog_domain_check
  check (catalog_domain in ('sink','stone'));

create index if not exists idx_vendor_catalog_items_stone_review
  on public.vendor_catalog_items(stone_type_id, review_status, last_seen_at desc)
  where catalog_domain = 'stone';

comment on column public.vendor_catalog_items.stone_data is
  'Normalized Stone catalog metadata (variant, color, vendor lot/batch/location). Vendor inventory is reference-only and never copied into public.inventory.';
comment on column public.countertop_stone_product_profiles.material_price_band_id is
  'Optional catalog default. Vendor-imported Stone may remain unpriced until management assigns a Countertop Material Band.';

alter table public.vendor_stone_type_mappings enable row level security;
revoke all on public.vendor_stone_type_mappings from anon;
grant select on public.vendor_stone_type_mappings to authenticated;

drop policy if exists vendor_stone_type_mappings_admin_select on public.vendor_stone_type_mappings;
create policy vendor_stone_type_mappings_admin_select
on public.vendor_stone_type_mappings for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']));

create or replace function public.resolve_vendor_stone_type(
  p_vendor_code text,
  p_vendor_type_name text,
  p_canonical_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vendor_code text := lower(btrim(coalesce(p_vendor_code,'')));
  v_vendor_type_name text := btrim(coalesce(p_vendor_type_name,''));
  v_vendor_type_key text;
  v_canonical_name text := btrim(coalesce(nullif(p_canonical_name,''), p_vendor_type_name, ''));
  v_stone_type_id uuid;
begin
  if v_vendor_code = '' or v_vendor_type_name = '' or v_canonical_name = '' then
    raise exception 'Vendor code and Stone type are required.';
  end if;

  v_vendor_type_key := lower(regexp_replace(v_vendor_type_name, '\s+', ' ', 'g'));

  select m.stone_type_id
    into v_stone_type_id
  from public.vendor_stone_type_mappings m
  where m.vendor_code = v_vendor_code
    and m.vendor_type_key = v_vendor_type_key;
  if v_stone_type_id is not null then return v_stone_type_id; end if;

  select st.id
    into v_stone_type_id
  from public.countertop_stone_types st
  where lower(btrim(st.name)) = lower(v_canonical_name)
  limit 1;

  if v_stone_type_id is null then
    begin
      insert into public.countertop_stone_types(
        name, is_active, source_kind, source_vendor_code, review_status
      ) values (
        v_canonical_name, true, 'vendor', v_vendor_code, 'pending_review'
      ) returning id into v_stone_type_id;
    exception when unique_violation then
      select st.id into v_stone_type_id
      from public.countertop_stone_types st
      where lower(btrim(st.name)) = lower(v_canonical_name)
      limit 1;
    end;
  end if;

  if v_stone_type_id is null then
    raise exception 'Unable to resolve Stone type.';
  end if;

  insert into public.vendor_stone_type_mappings(
    vendor_code, vendor_type_name, vendor_type_key, stone_type_id
  ) values (
    v_vendor_code, v_vendor_type_name, v_vendor_type_key, v_stone_type_id
  )
  on conflict (vendor_code, vendor_type_key) do update
    set vendor_type_name = excluded.vendor_type_name,
        updated_at = now();

  select m.stone_type_id into v_stone_type_id
  from public.vendor_stone_type_mappings m
  where m.vendor_code = v_vendor_code and m.vendor_type_key = v_vendor_type_key;
  return v_stone_type_id;
end;
$$;

revoke all on function public.resolve_vendor_stone_type(text,text,text) from public, anon, authenticated;
grant execute on function public.resolve_vendor_stone_type(text,text,text) to service_role;

/* Product Master v2: a Stone profile still requires a Stone Type, but its
 * default Material Band may be null until management prices the material.
 */
create or replace function public.save_product_master_v2(p_product jsonb, p_stone_profile jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_old public.products;
  v_type public.product_types;
  v_uom public.units_of_measure;
  v_stone_type_id uuid;
  v_material_price_band_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'Product management permission required.';
  end if;

  v_id := nullif(p_product->>'id','')::uuid;
  select * into v_type from public.product_types where id=(p_product->>'product_type_id')::uuid and is_active;
  select * into v_uom from public.units_of_measure where id=(p_product->>'uom_id')::uuid and is_active;
  if v_type.id is null or v_uom.id is null then raise exception 'Active product type and UOM are required.'; end if;
  if not exists (select 1 from public.product_type_allowed_uoms where product_type_id=v_type.id and uom_id=v_uom.id) then
    raise exception 'Unit of measure is not allowed for this product type.';
  end if;

  if v_id is not null then
    select * into v_old from public.products where id=v_id for update;
    if v_old.id is null then raise exception 'Product not found.'; end if;
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
  if v_type.pricing_model<>'countertop_material_band' and v_id is not null
     and exists(select 1 from public.countertop_configurations where stone_product_id=v_id) then
    raise exception 'Configured stone products cannot change type.';
  end if;

  if v_id is null then
    insert into public.products(
      sku,barcode,name,description,brand_id,category_id,base_product_code,color_code,color_name,
      brand,category,unit,product_type_id,uom_id,min_stock_level,status,metadata
    ) values (
      p_product->>'sku',nullif(p_product->>'barcode',''),p_product->>'name',nullif(p_product->>'description',''),
      nullif(p_product->>'brand_id','')::uuid,nullif(p_product->>'category_id','')::uuid,
      coalesce(nullif(p_product->>'base_product_code',''),p_product->>'sku'),
      coalesce(nullif(p_product->>'color_code',''),'DEFAULT'),nullif(p_product->>'color_name',''),
      p_product->>'brand',p_product->>'category',lower(v_uom.code),v_type.id,v_uom.id,
      coalesce(nullif(p_product->>'min_stock_level','')::numeric,0),
      coalesce(nullif(p_product->>'status',''),'active')::product_status,
      coalesce(p_product->'metadata','{}'::jsonb)
    ) returning id into v_id;
  else
    update public.products set
      sku=p_product->>'sku',barcode=nullif(p_product->>'barcode',''),name=p_product->>'name',
      description=nullif(p_product->>'description',''),brand_id=nullif(p_product->>'brand_id','')::uuid,
      category_id=nullif(p_product->>'category_id','')::uuid,
      base_product_code=coalesce(nullif(p_product->>'base_product_code',''),p_product->>'sku'),
      color_code=coalesce(nullif(p_product->>'color_code',''),'DEFAULT'),color_name=nullif(p_product->>'color_name',''),
      brand=p_product->>'brand',category=p_product->>'category',unit=lower(v_uom.code),
      product_type_id=v_type.id,uom_id=v_uom.id,
      min_stock_level=coalesce(nullif(p_product->>'min_stock_level','')::numeric,0),
      status=coalesce(nullif(p_product->>'status',''),'active')::product_status,
      metadata=coalesce(v_old.metadata,'{}'::jsonb) || coalesce(p_product->'metadata','{}'::jsonb)
    where id=v_id;
  end if;

  if v_type.pricing_model='countertop_material_band' then
    v_stone_type_id := nullif(p_stone_profile->>'stone_type_id','')::uuid;
    v_material_price_band_id := nullif(p_stone_profile->>'material_price_band_id','')::uuid;
    if v_stone_type_id is null or not exists (
      select 1 from public.countertop_stone_types where id=v_stone_type_id and is_active
    ) then
      raise exception 'Active Stone type is required.';
    end if;
    if v_material_price_band_id is not null and not exists (
      select 1 from public.countertop_material_price_bands where id=v_material_price_band_id and is_active
    ) then
      raise exception 'Material price band is inactive or invalid.';
    end if;

    insert into public.countertop_stone_product_profiles(
      product_id,stone_type_id,material_price_band_id,vendor_name,source_ref,is_active
    ) values (
      v_id,v_stone_type_id,v_material_price_band_id,
      nullif(p_stone_profile->>'vendor_name',''),nullif(p_stone_profile->>'source_ref',''),true
    )
    on conflict(product_id) do update set
      stone_type_id=excluded.stone_type_id,
      material_price_band_id=excluded.material_price_band_id,
      vendor_name=excluded.vendor_name,
      source_ref=excluded.source_ref,
      is_active=true,
      updated_at=now();
  elsif v_id is not null then
    delete from public.countertop_stone_product_profiles where product_id=v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_product_master_v2(jsonb,jsonb) from public, anon;
grant execute on function public.save_product_master_v2(jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
