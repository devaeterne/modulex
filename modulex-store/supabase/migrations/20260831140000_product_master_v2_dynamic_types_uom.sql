-- Product Master UX v2: additive dynamic product types and units of measure.
-- Legacy products.unit remains a compatibility mirror; no existing product rows are removed.
create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  allows_decimal boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  default_uom_id uuid references public.units_of_measure(id) on delete restrict,
  inventory_tracking boolean not null default true,
  reservable boolean not null default true,
  pricing_model text not null default 'price_group' check (pricing_model in ('price_group','countertop_material_band','none')),
  requires_variant_identity boolean not null default true,
  qr_required boolean not null default false,
  store_eligible boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_type_allowed_uoms (
  product_type_id uuid not null references public.product_types(id) on delete cascade,
  uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  is_default boolean not null default false,
  primary key (product_type_id, uom_id)
);

insert into public.units_of_measure(code,name,allows_decimal,sort_order)
values ('PIECE','Piece',false,10),('SLAB','Slab',false,20)
on conflict (code) do update set name=excluded.name,allows_decimal=excluded.allows_decimal;

insert into public.units_of_measure(code,name,allows_decimal,sort_order)
select upper(btrim(unit)), initcap(lower(btrim(unit))), false, 100
from public.products
where nullif(btrim(unit),'') is not null
on conflict (code) do nothing;

insert into public.product_types(code,name,pricing_model,inventory_tracking,reservable,qr_required,store_eligible,sort_order)
values ('STANDARD','Standard','price_group',true,true,false,false,10),
       ('STONE','Stone','countertop_material_band',true,true,false,false,20),
       ('SINK','Sink','price_group',true,true,false,false,30)
on conflict (code) do update set name=excluded.name,pricing_model=excluded.pricing_model;
update public.product_types set requires_variant_identity = case when code in ('SINK','STONE') then false else true end where code in ('STANDARD','STONE','SINK');

update public.product_types t set default_uom_id=u.id
from public.units_of_measure u
where (t.code='STONE' and u.code='SLAB') or (t.code in ('STANDARD','SINK') and u.code='PIECE');

insert into public.product_type_allowed_uoms(product_type_id,uom_id,is_default)
select t.id,u.id,(t.code='STONE' and u.code='SLAB') or (t.code<>'STONE' and u.code='PIECE')
from public.product_types t cross join public.units_of_measure u
where (t.code='STONE' and u.code='SLAB') or (t.code<>'STONE' and u.code='PIECE')
on conflict (product_type_id,uom_id) do update set is_default=excluded.is_default;

alter table public.products add column if not exists product_type_id uuid references public.product_types(id) on delete restrict;
alter table public.products add column if not exists uom_id uuid references public.units_of_measure(id) on delete restrict;

update public.products p set product_type_id=t.id
from public.product_types t
where p.product_type_id is null and t.code = case
  when exists (select 1 from public.countertop_stone_product_profiles sp where sp.product_id=p.id) then 'STONE'
  when lower(coalesce(p.metadata->>'product_kind',''))='sink' then 'SINK'
  else 'STANDARD' end;

update public.products p set uom_id=u.id
from public.units_of_measure u
where p.uom_id is null and u.code=upper(btrim(p.unit));

update public.products p set uom_id=u.id
from public.units_of_measure u
where p.uom_id is null and u.code='PIECE';

create index if not exists products_product_type_idx on public.products(product_type_id);
create index if not exists products_uom_idx on public.products(uom_id);
create index if not exists product_type_allowed_uoms_uom_idx on public.product_type_allowed_uoms(uom_id);

create or replace function private.validate_product_master_contract() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_type public.product_types; v_uom public.units_of_measure;
begin
  if new.uom_id is null then
    select id into new.uom_id from public.units_of_measure where code=upper(coalesce(nullif(btrim(new.unit),''),'PIECE')) limit 1;
    if new.uom_id is null then select id into new.uom_id from public.units_of_measure where code='PIECE'; end if;
  end if;
  if new.product_type_id is null then
    select id into new.product_type_id from public.product_types where code=case when lower(coalesce(new.metadata->>'product_kind',''))='sink' then 'SINK' else 'STANDARD' end;
  end if;
  select * into v_type from public.product_types where id=new.product_type_id;
  select * into v_uom from public.units_of_measure where id=new.uom_id;
  if v_type.id is null or not v_type.is_active then raise exception 'Product type is inactive or invalid.'; end if;
  if v_uom.id is null or not v_uom.is_active then raise exception 'Unit of measure is inactive or invalid.'; end if;
  if not exists (select 1 from public.product_type_allowed_uoms a where a.product_type_id=v_type.id and a.uom_id=v_uom.id) then raise exception 'Unit of measure is not allowed for this product type.'; end if;
  new.unit := v_uom.code;
  if v_type.code='SINK' then new.metadata := jsonb_set(coalesce(new.metadata,'{}'::jsonb),'{product_kind}','"sink"'::jsonb,true);
  elsif lower(coalesce(new.metadata->>'product_kind',''))='sink' then new.metadata := new.metadata - 'product_kind'; end if;
  return new;
end; $$;

create or replace function public.search_low_stock_page_v2(
  p_query text default '', p_view text default 'alerts', p_type_id uuid default null,
  p_uom_id uuid default null, p_offset integer default 0, p_limit integer default 25,
  p_export_all boolean default false
) returns table(product_id uuid, sku text, barcode text, product_name text, brand text, category text,
  unit text, min_stock_level numeric, product_status product_status, location_count bigint, warehouse_count bigint,
  total_quantity numeric, total_reserved_quantity numeric, total_available_quantity numeric, is_low_stock boolean,
  stock_status text, last_inventory_update timestamptz, product_type text, uom_code text, total_count bigint)
language sql stable set search_path=public as $$
  select v.product_id,v.sku,v.barcode,v.product_name,v.brand,v.category,v.unit,v.min_stock_level,v.product_status,
    v.location_count,v.warehouse_count,v.total_quantity,v.total_reserved_quantity,v.total_available_quantity,
    v.is_low_stock,v.stock_status,v.last_inventory_update,pt.name,u.code,count(*) over()
  from public.v_product_stock_summary v join public.products p on p.id=v.product_id
  left join public.product_types pt on pt.id=p.product_type_id left join public.units_of_measure u on u.id=p.uom_id
  where v.product_status='active'::product_status
    and (coalesce(p_view,'alerts')='all' or (p_view='alerts' and v.is_low_stock) or (p_view='unset' and v.min_stock_level=0))
    and (p_type_id is null or p.product_type_id=p_type_id) and (p_uom_id is null or p.uom_id=p_uom_id)
    and (coalesce(trim(p_query),'')='' or concat_ws(' ',v.sku,v.barcode,v.product_name,v.brand,v.category,pt.name,u.code) ilike '%'||trim(p_query)||'%')
  order by v.sku,v.product_id limit case when p_export_all then null else greatest(1,least(coalesce(p_limit,25),100)) end
  offset case when p_export_all then 0 else greatest(0,coalesce(p_offset,0)) end;
$$;
revoke all on function public.search_low_stock_page_v2(text,text,uuid,uuid,integer,integer,boolean) from public,anon;
grant execute on function public.search_low_stock_page_v2(text,text,uuid,uuid,integer,integer,boolean) to authenticated;

create or replace function public.get_low_stock_summary_v2(p_query text default '', p_view text default 'alerts', p_type_id uuid default null, p_uom_id uuid default null)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'products',count(*),
    'alerts',count(*) filter (where v.is_low_stock),
    'out_of_stock',count(*) filter (where v.is_low_stock and v.total_available_quantity<=0),
    'thresholds_set',count(*) filter (where v.min_stock_level>0),
    'shortfall_by_uom',coalesce((select jsonb_object_agg(coalesce(u.code,'UNKNOWN'),shortfall) from (select p.uom_id,sum(greatest(v2.min_stock_level-v2.total_available_quantity,0)) shortfall from public.v_product_stock_summary v2 join public.products p on p.id=v2.product_id where v2.product_status='active'::product_status and v2.is_low_stock group by p.uom_id) s left join public.units_of_measure u on u.id=s.uom_id),'{}'::jsonb)
  ) from public.v_product_stock_summary v join public.products p on p.id=v.product_id
  where v.product_status='active'::product_status and (coalesce(p_view,'alerts')='all' or (p_view='alerts' and v.is_low_stock) or (p_view='unset' and v.min_stock_level=0)) and (p_type_id is null or p.product_type_id=p_type_id) and (p_uom_id is null or p.uom_id=p_uom_id) and (coalesce(trim(p_query),'')='' or concat_ws(' ',v.sku,v.barcode,v.product_name,v.brand,v.category) ilike '%'||trim(p_query)||'%');
$$;
revoke all on function public.get_low_stock_summary_v2(text,text,uuid,uuid) from public,anon;
grant execute on function public.get_low_stock_summary_v2(text,text,uuid,uuid) to authenticated;

create or replace function public.save_product_master_v2(p_product jsonb, p_stone_profile jsonb default null)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid; v_old public.products; v_type public.product_types; v_uom public.units_of_measure;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then raise exception 'Product management permission required.'; end if;
  v_id := nullif(p_product->>'id','')::uuid;
  select * into v_type from public.product_types where id=(p_product->>'product_type_id')::uuid and is_active;
  select * into v_uom from public.units_of_measure where id=(p_product->>'uom_id')::uuid and is_active;
  if v_type.id is null or v_uom.id is null then raise exception 'Active product type and UOM are required.'; end if;
  if not exists (select 1 from public.product_type_allowed_uoms where product_type_id=v_type.id and uom_id=v_uom.id) then raise exception 'Unit of measure is not allowed for this product type.'; end if;
  if v_id is not null then
    select * into v_old from public.products where id=v_id for update;
    if v_old.id is null then raise exception 'Product not found.'; end if;
    if v_old.product_type_id is distinct from v_type.id and (exists(select 1 from public.inventory where product_id=v_id and (quantity>0 or reserved_quantity>0)) or exists(select 1 from public.customer_order_items where product_id=v_id) or exists(select 1 from public.countertop_configurations where stone_product_id=v_id)) then raise exception 'Product type cannot change while business history or stock dependencies exist.'; end if;
  end if;
  if v_type.pricing_model='countertop_material_band' and p_stone_profile is null then raise exception 'Stone profile is required for countertop material products.'; end if;
  if v_type.pricing_model<>'countertop_material_band' and exists(select 1 from public.countertop_configurations where stone_product_id=v_id) then raise exception 'Configured stone products cannot change type.'; end if;
  if v_id is null then
    insert into public.products(sku,barcode,name,description,brand_id,category_id,base_product_code,color_code,color_name,brand,category,unit,product_type_id,uom_id,min_stock_level,status,metadata)
    values(p_product->>'sku',nullif(p_product->>'barcode',''),p_product->>'name',nullif(p_product->>'description',''),(p_product->>'brand_id')::uuid,(p_product->>'category_id')::uuid,coalesce(nullif(p_product->>'base_product_code',''),p_product->>'sku'),coalesce(nullif(p_product->>'color_code',''),'DEFAULT'),nullif(p_product->>'color_name',''),p_product->>'brand',p_product->>'category',lower(v_uom.code),v_type.id,v_uom.id,(p_product->>'min_stock_level')::numeric,(p_product->>'status')::product_status,coalesce(p_product->'metadata','{}'::jsonb)) returning id into v_id;
  else
    update public.products set sku=p_product->>'sku',barcode=nullif(p_product->>'barcode',''),name=p_product->>'name',description=nullif(p_product->>'description',''),brand_id=(p_product->>'brand_id')::uuid,category_id=(p_product->>'category_id')::uuid,base_product_code=coalesce(nullif(p_product->>'base_product_code',''),p_product->>'sku'),color_code=coalesce(nullif(p_product->>'color_code',''),'DEFAULT'),color_name=nullif(p_product->>'color_name',''),brand=p_product->>'brand',category=p_product->>'category',unit=lower(v_uom.code),product_type_id=v_type.id,uom_id=v_uom.id,min_stock_level=(p_product->>'min_stock_level')::numeric,status=(p_product->>'status')::product_status,metadata=coalesce(v_old.metadata,p_product->'metadata','{}'::jsonb) where id=v_id;
  end if;
  if v_type.pricing_model='countertop_material_band' then
    perform public.upsert_countertop_reference('stone_profile',v_id,(p_stone_profile->>'stone_type_id')::uuid,(p_stone_profile->>'material_price_band_id')::uuid,nullif(p_stone_profile->>'vendor_name',''),nullif(p_stone_profile->>'source_ref',''),true);
  elsif v_id is not null then delete from public.countertop_stone_product_profiles where product_id=v_id;
  end if;
  return v_id;
end; $$;
revoke all on function public.save_product_master_v2(jsonb,jsonb) from public,anon;
grant execute on function public.save_product_master_v2(jsonb,jsonb) to authenticated;

drop trigger if exists trg_products_validate_master_contract on public.products;
create trigger trg_products_validate_master_contract before insert or update of product_type_id,uom_id,unit,metadata on public.products
for each row execute function private.validate_product_master_contract();

create or replace function private.guard_product_master_reference_lifecycle() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='product_types' and old.is_active and not new.is_active and exists (select 1 from public.products where product_type_id=old.id and status::text='active') then raise exception 'Product type used by active products cannot be deactivated.'; end if;
  if tg_table_name='units_of_measure' and old.is_active and not new.is_active and exists (select 1 from public.products where uom_id=old.id and status::text='active') then raise exception 'Unit of measure used by active products cannot be deactivated.'; end if;
  if tg_table_name='product_types' and new.default_uom_id is not null and not exists (select 1 from public.product_type_allowed_uoms where product_type_id=new.id and uom_id=new.default_uom_id) then raise exception 'Default UOM must be allowed for the product type.'; end if;
  return new;
end; $$;
drop trigger if exists trg_product_types_reference_guard on public.product_types;
create trigger trg_product_types_reference_guard before update on public.product_types for each row execute function private.guard_product_master_reference_lifecycle();
drop trigger if exists trg_units_reference_guard on public.units_of_measure;
create trigger trg_units_reference_guard before update on public.units_of_measure for each row execute function private.guard_product_master_reference_lifecycle();

do $$ begin
  if not exists (select 1 from public.products where product_type_id is null or uom_id is null) then
    alter table public.products alter column product_type_id set not null;
    alter table public.products alter column uom_id set not null;
  end if;
end $$;

alter table public.units_of_measure enable row level security;
alter table public.product_types enable row level security;
alter table public.product_type_allowed_uoms enable row level security;
grant select on public.units_of_measure,public.product_types,public.product_type_allowed_uoms to authenticated;
revoke all on public.units_of_measure,public.product_types,public.product_type_allowed_uoms from anon;
grant insert,update on public.units_of_measure,public.product_types,public.product_type_allowed_uoms to authenticated;
drop policy if exists product_master_uom_read on public.units_of_measure;
create policy product_master_uom_read on public.units_of_measure for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists product_master_type_read on public.product_types;
create policy product_master_type_read on public.product_types for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists product_master_allowed_uom_read on public.product_type_allowed_uoms;
create policy product_master_allowed_uom_read on public.product_type_allowed_uoms for select to authenticated using (exists (select 1 from public.product_types t where t.id=product_type_id and (t.is_active or public.current_user_has_any_role(array['super_admin','admin']))));
drop policy if exists product_master_uom_manage on public.units_of_measure;
create policy product_master_uom_manage on public.units_of_measure for all to authenticated using (public.current_user_has_any_role(array['super_admin','admin'])) with check (public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists product_master_type_manage on public.product_types;
create policy product_master_type_manage on public.product_types for all to authenticated using (public.current_user_has_any_role(array['super_admin','admin'])) with check (public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists product_master_allowed_uom_manage on public.product_type_allowed_uoms;
create policy product_master_allowed_uom_manage on public.product_type_allowed_uoms for all to authenticated using (public.current_user_has_any_role(array['super_admin','admin'])) with check (public.current_user_has_any_role(array['super_admin','admin']));

-- Full projection replacement: all list filters and lookup options are server-side.
create or replace function public.get_products_page_v2(p_query text default null,p_type_id uuid default null,p_uom_id uuid default null,p_status text default null,p_qr_status text default null,p_brand_id uuid default null,p_category_id uuid default null,p_sort text default 'created_at',p_direction text default 'desc',p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_offset integer:=greatest(p_page-1,0)*least(greatest(p_page_size,1),100); v_limit integer:=least(greatest(p_page_size,1),100); v_items jsonb; v_total integer;
begin
  with base as (
    select p.id,p.sku,p.barcode,p.name,p.base_product_code,p.color_code,p.color_name,p.brand_id,p.category_id,p.status,p.unit,p.min_stock_level,p.qr_svg_path,p.created_at,
      pt.id product_type_id,pt.code product_type_code,pt.name product_type_name,pt.pricing_model product_type_pricing_model,u.id uom_id,u.code uom_code,u.name uom_name,b.name brand,c.name category,st.name stone_type,mb.code material_price_band,
      coalesce(sum(i.quantity),0) on_hand,coalesce(sum(i.reserved_quantity),0) reserved
    from public.products p
    left join public.product_types pt on pt.id=p.product_type_id
    left join public.units_of_measure u on u.id=p.uom_id
    left join public.product_brands b on b.id=p.brand_id
    left join public.product_categories c on c.id=p.category_id
    left join public.countertop_stone_product_profiles sp on sp.product_id=p.id and sp.is_active
    left join public.countertop_stone_types st on st.id=sp.stone_type_id
    left join public.countertop_material_price_bands mb on mb.id=sp.material_price_band_id
    left join public.inventory i on i.product_id=p.id
    where (p_status is null or p.status::text=p_status) and (p_type_id is null or p.product_type_id=p_type_id) and (p_uom_id is null or p.uom_id=p_uom_id) and (p_brand_id is null or p.brand_id=p_brand_id) and (p_category_id is null or p.category_id=p_category_id) and (p_qr_status is null or (p_qr_status='ready' and p.qr_svg_path is not null) or (p_qr_status='missing' and p.qr_svg_path is null)) and (nullif(btrim(p_query),'') is null or concat_ws(' ',p.sku,p.barcode,p.name,p.base_product_code,p.color_code,p.color_name,b.name,c.name,pt.code,pt.name,u.code,st.name,mb.code) ilike '%'||btrim(p_query)||'%')
    group by p.id,pt.id,u.id,b.name,c.name,st.name,mb.code
  ), counted as (select count(*) over() total_count,* from base), paged as (
    select * from counted order by
      case when p_sort='sku' and p_direction='asc' then sku end asc, case when p_sort='sku' and p_direction<>'asc' then sku end desc,
      case when p_sort='name' and p_direction='asc' then name end asc, case when p_sort='name' and p_direction<>'asc' then name end desc,
      case when p_sort='type' and p_direction='asc' then product_type_name end asc, case when p_sort='type' and p_direction<>'asc' then product_type_name end desc,
      case when p_sort='brand' and p_direction='asc' then brand end asc, case when p_sort='brand' and p_direction<>'asc' then brand end desc,
      case when p_sort='category' and p_direction='asc' then category end asc, case when p_sort='category' and p_direction<>'asc' then category end desc,
      case when p_sort='stock' and p_direction='asc' then on_hand-reserved end asc, case when p_sort='stock' and p_direction<>'asc' then on_hand-reserved end desc,
      case when p_sort='status' and p_direction='asc' then status::text end asc, case when p_sort='status' and p_direction<>'asc' then status::text end desc,
      case when p_sort='created_at' and p_direction='asc' then created_at end asc, created_at desc, id
    offset v_offset limit v_limit
  )
  select coalesce(jsonb_agg((to_jsonb(paged)-'total_count')||jsonb_build_object('available',on_hand-reserved,'qr_status',case when qr_svg_path is null then 'missing' else 'ready' end) order by created_at desc),'[]'::jsonb),coalesce(max(total_count),0) into v_items,v_total from paged;
  return jsonb_build_object('items',v_items,'total_count',v_total,'page',p_page,'page_size',v_limit,'filters',jsonb_build_object('brands',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from public.product_brands where status='active'),'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from public.product_categories where status='active'),'product_types',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code) order by sort_order),'[]'::jsonb) from public.product_types where is_active),'uoms',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code) order by sort_order),'[]'::jsonb) from public.units_of_measure where is_active)));
end; $$;
