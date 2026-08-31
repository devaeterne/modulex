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
       ('STONE','Stone','countertop_material_band',true,true,false,true,20),
       ('SINK','Sink','price_group',true,true,false,true,30)
on conflict (code) do update set name=excluded.name,pricing_model=excluded.pricing_model;

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
  return new;
end; $$;

drop trigger if exists trg_products_validate_master_contract on public.products;
create trigger trg_products_validate_master_contract before insert or update of product_type_id,uom_id,unit on public.products
for each row execute function private.validate_product_master_contract();

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

create or replace function public.get_products_page_v2(p_query text default null,p_type_id uuid default null,p_uom_id uuid default null,p_status text default null,p_qr_status text default null,p_brand_id uuid default null,p_category_id uuid default null,p_sort text default 'created_at',p_direction text default 'desc',p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_offset integer:=greatest(p_page-1,0)*least(greatest(p_page_size,1),100); v_limit integer:=least(greatest(p_page_size,1),100); v_items jsonb; v_total integer;
begin
  with base as (select p.id,p.sku,p.barcode,p.name,p.status,p.unit,p.min_stock_level,p.qr_svg_path,p.created_at,pt.id product_type_id,pt.code product_type_code,pt.name product_type_name,u.id uom_id,u.code uom_code,u.name uom_name,b.name brand,c.name category,coalesce(sum(i.quantity),0) on_hand,coalesce(sum(i.reserved_quantity),0) reserved from public.products p left join public.product_types pt on pt.id=p.product_type_id left join public.units_of_measure u on u.id=p.uom_id left join public.product_brands b on b.id=p.brand_id left join public.product_categories c on c.id=p.category_id left join public.inventory i on i.product_id=p.id where (p_status is null or p.status::text=p_status) and (p_type_id is null or p.product_type_id=p_type_id) and (p_uom_id is null or p.uom_id=p_uom_id) and (p_brand_id is null or p.brand_id=p_brand_id) and (p_category_id is null or p.category_id=p_category_id) and (p_qr_status is null or (p_qr_status='ready' and p.qr_svg_path is not null) or (p_qr_status='missing' and p.qr_svg_path is null)) and (nullif(btrim(p_query),'') is null or concat_ws(' ',p.sku,p.barcode,p.name,b.name,c.name,pt.code,pt.name,u.code) ilike '%'||btrim(p_query)||'%') group by p.id,pt.id,u.id,b.name,c.name), counted as (select count(*) over() total_count,* from base), paged as (select * from counted order by case when p_sort='sku' and p_direction='asc' then sku end asc,case when p_sort='sku' and p_direction<>'asc' then sku end desc,case when p_sort='name' and p_direction='asc' then name end asc,case when p_sort='name' and p_direction<>'asc' then name end desc,created_at desc offset v_offset limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(paged)-'total_count'||jsonb_build_object('available',on_hand-reserved,'qr_status',case when qr_svg_path is null then 'missing' else 'ready' end) order by created_at desc),'[]'::jsonb),coalesce(max(total_count),0) into v_items,v_total from paged;
  return jsonb_build_object('items',v_items,'total_count',v_total,'page',p_page,'page_size',v_limit);
end; $$;
revoke all on function public.get_products_page_v2(text,uuid,uuid,text,text,uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.get_products_page_v2(text,uuid,uuid,text,text,uuid,uuid,text,text,integer,integer) to authenticated;
