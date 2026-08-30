-- Countertop / Stone / Sink MVP (additive; production migration pending).
-- Products remain canonical. Customer price_groups remain commercial tiers.
-- SLAB inventory is quantity-based through inventory.quantity/reserved_quantity; no per-slab identity in MVP.
create table if not exists public.countertop_stone_types (id uuid primary key default gen_random_uuid(), name text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists countertop_stone_types_name_ci on public.countertop_stone_types(lower(btrim(name)));
create table if not exists public.countertop_material_price_bands (id uuid primary key default gen_random_uuid(), code text not null, price_per_sqft numeric(18,4) not null check (price_per_sqft >= 0), is_active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists countertop_material_price_bands_code_ci on public.countertop_material_price_bands(lower(btrim(code)));
create table if not exists public.countertop_stone_product_profiles (product_id uuid primary key references public.products(id) on delete restrict, stone_type_id uuid not null references public.countertop_stone_types(id) on delete restrict, material_price_band_id uuid not null references public.countertop_material_price_bands(id) on delete restrict, vendor_name text, source_ref text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists countertop_stone_profiles_type_idx on public.countertop_stone_product_profiles(stone_type_id,is_active);
create table if not exists public.countertop_edge_profiles (id uuid primary key default gen_random_uuid(), name text not null, pricing_method text not null default 'linear_ft' check (pricing_method in ('each','sq_ft','linear_ft','flat')), unit_price numeric(18,4) not null default 0 check (unit_price >= 0), is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists countertop_edge_profiles_name_ci on public.countertop_edge_profiles(lower(btrim(name)));
create table if not exists public.countertop_services (id uuid primary key default gen_random_uuid(), name text not null, pricing_method text not null check (pricing_method in ('each','sq_ft','linear_ft','flat')), unit_price numeric(18,4) not null check (unit_price >= 0), is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists countertop_services_name_ci on public.countertop_services(lower(btrim(name)));
insert into public.countertop_stone_types(name) values ('Quartz'),('Granite'),('Marble'),('Quartzite'),('Travertine'),('Porcelain'),('Soapstone'),('Dolomite'),('Onyx') on conflict do nothing;
insert into public.countertop_material_price_bands(code,price_per_sqft,sort_order) values ('B1',34,1),('B2',36,2),('B3',38,3),('C1',40,4),('R1',45,5),('R2',50,6),('R3',55,7),('R4',60,8),('R5',65,9),('R6',70,10),('R7',75,11),('R8',80,12),('R9',85,13),('R10',90,14),('R11',95,15),('R12',100,16),('R13',105,17),('R14',110,18),('R15',115,19),('R16',120,20),('R17',125,21),('R18',130,22),('R19',135,23),('R20',140,24),('R21',145,25),('R22',150,26) on conflict do nothing;
insert into public.countertop_edge_profiles(name,unit_price) values ('Eased Edge',0),('Pencil Edge',0),('1/4 Beveled',0),('Half Bull Nose',10),('1/2 Beveled',10),('Single Ogee',20),('DuPont',20),('Double O''gee',30),('Laminate',50),('Mitered',100) on conflict do nothing;
insert into public.countertop_services(name,pricing_method,unit_price) values ('Regular Removal','flat',250),('Granite Removal','flat',400),('Kitchen Sink Plumbing','each',400),('Bathroom Sink Plumbing','each',250),('Outlet Cutout','each',50),('Kitchen Sink Cutout','each',200),('Bathroom Sink Cutout','each',150) on conflict do nothing;
create table if not exists public.countertop_configurations (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.customer_orders(id) on delete cascade, order_item_id uuid not null unique references public.customer_order_items(id) on delete cascade, stone_product_id uuid not null references public.products(id) on delete restrict, sink_product_id uuid references public.products(id) on delete restrict, price_group_id uuid references public.price_groups(id) on delete restrict, sqft numeric(18,4) not null, edge_linear_ft numeric(18,4) not null default 0, slab_quantity numeric(18,4) not null default 1, manual_price_per_sqft numeric(18,4), override_reason text, overridden_by uuid references public.profiles(id), overridden_at timestamptz, configuration jsonb not null default '{}'::jsonb, pricing_snapshot jsonb not null, subtotal numeric(18,4) not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (sqft > 0 and edge_linear_ft >= 0 and slab_quantity > 0), check (manual_price_per_sqft is null or (manual_price_per_sqft >= 0 and nullif(btrim(override_reason),'') is not null)), check (subtotal >= 0));
alter table public.customer_order_items add column if not exists countertop_reservation_quantity numeric(18,4);
alter table public.countertop_configurations add column if not exists edge_profile_id uuid references public.countertop_edge_profiles(id) on delete restrict;
create index if not exists countertop_configurations_order_idx on public.countertop_configurations(order_id);
create index if not exists countertop_configurations_stone_idx on public.countertop_configurations(stone_product_id);
alter table public.countertop_stone_types enable row level security; alter table public.countertop_material_price_bands enable row level security; alter table public.countertop_stone_product_profiles enable row level security; alter table public.countertop_edge_profiles enable row level security; alter table public.countertop_services enable row level security; alter table public.countertop_configurations enable row level security;
grant select on public.countertop_stone_types,public.countertop_material_price_bands,public.countertop_stone_product_profiles,public.countertop_edge_profiles,public.countertop_services,public.countertop_configurations to authenticated; revoke all on public.countertop_stone_types,public.countertop_material_price_bands,public.countertop_stone_product_profiles,public.countertop_edge_profiles,public.countertop_services,public.countertop_configurations from anon;
drop policy if exists countertop_reference_read on public.countertop_stone_types; create policy countertop_reference_read on public.countertop_stone_types for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists countertop_band_read on public.countertop_material_price_bands; create policy countertop_band_read on public.countertop_material_price_bands for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists countertop_profile_read on public.countertop_stone_product_profiles; create policy countertop_profile_read on public.countertop_stone_product_profiles for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists countertop_edge_read on public.countertop_edge_profiles; create policy countertop_edge_read on public.countertop_edge_profiles for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists countertop_service_read on public.countertop_services; create policy countertop_service_read on public.countertop_services for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
drop policy if exists countertop_config_read on public.countertop_configurations; create policy countertop_config_read on public.countertop_configurations for select to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping']));
create or replace function public.calculate_countertop_price(p_stone_product_id uuid,p_price_group_id uuid,p_sqft numeric,p_edge_profile_id uuid default null,p_edge_linear_ft numeric default 0,p_sink_product_id uuid default null,p_services jsonb default '[]'::jsonb,p_manual_material_price numeric default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$ declare v_material numeric(18,4); v_edge numeric(18,4):=0; v_sink numeric(18,4):=0; v_services numeric(18,4):=0; v_item jsonb; v_service record; v_profile record; v_qty numeric; v_measure numeric; begin if p_sqft is null or p_sqft<=0 or p_edge_linear_ft is null or p_edge_linear_ft<0 then raise exception 'Countertop dimensions must be positive.'; end if; select p.id,p.sku,p.name,st.name stone_type,mb.code band_code,mb.price_per_sqft into v_profile from public.products p join public.countertop_stone_product_profiles sp on sp.product_id=p.id and sp.is_active join public.countertop_stone_types st on st.id=sp.stone_type_id and st.is_active join public.countertop_material_price_bands mb on mb.id=sp.material_price_band_id and mb.is_active where p.id=p_stone_product_id and p.status='active'; if not found then raise exception 'Stone product is unavailable or has no active stone profile.'; end if; if p_manual_material_price is not null then if p_manual_material_price<0 then raise exception 'Manual material price cannot be negative.'; end if; v_material:=round(p_manual_material_price*p_sqft,4); else v_material:=round(v_profile.price_per_sqft*p_sqft,4); end if; if p_edge_profile_id is not null then select round(ep.unit_price*case when ep.pricing_method='linear_ft' then p_edge_linear_ft when ep.pricing_method='sq_ft' then p_sqft else 1 end,4) into v_edge from public.countertop_edge_profiles ep where ep.id=p_edge_profile_id and ep.is_active; if not found then raise exception 'Edge profile is unavailable.'; end if; end if; if p_sink_product_id is not null then select pp.amount into v_sink from public.product_prices pp join public.products p on p.id=pp.product_id where pp.product_id=p_sink_product_id and p.status='active' and lower(coalesce(p.metadata->>'product_kind',''))='sink' and pp.price_group_id=p_price_group_id and pp.currency_code='USD' and pp.is_active and pp.valid_to is null order by pp.valid_from desc limit 1; if v_sink is null then raise exception 'Sink is unavailable or has no active sink price.'; end if; end if; if jsonb_typeof(p_services)<>'array' then raise exception 'Services must be an array.'; end if; for v_item in select value from jsonb_array_elements(p_services) loop select s.id,s.name,s.pricing_method,s.unit_price into v_service from public.countertop_services s where s.id=(v_item->>'service_id')::uuid and s.is_active; v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0); if not found or v_qty<=0 then raise exception 'Service is unavailable or quantity is invalid.'; end if; v_measure:=case when v_service.pricing_method='sq_ft' then p_sqft when v_service.pricing_method='linear_ft' then p_edge_linear_ft else 1 end; v_services:=v_services+round(v_service.unit_price*case when v_service.pricing_method='flat' then 1 else v_qty*v_measure end,4); end loop; return jsonb_build_object('material_subtotal',v_material,'edge_subtotal',v_edge,'sink_subtotal',v_sink,'services_subtotal',v_services,'subtotal',round(v_material+v_edge+v_sink+v_services,4),'stone',jsonb_build_object('product_id',v_profile.id,'sku',v_profile.sku,'name',v_profile.name,'stone_type',v_profile.stone_type,'material_price_band',v_profile.band_code,'price_per_sqft',case when p_manual_material_price is null then v_profile.price_per_sqft else p_manual_material_price end,'sqft',p_sqft)); end; $$;
revoke all on function public.calculate_countertop_price(uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) from public,anon; grant execute on function public.calculate_countertop_price(uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) to authenticated;
create or replace function public.attach_countertop_configuration(p_order_item_id uuid,p_stone_product_id uuid,p_price_group_id uuid,p_sqft numeric,p_edge_profile_id uuid default null,p_edge_linear_ft numeric default 0,p_sink_product_id uuid default null,p_services jsonb default '[]'::jsonb,p_configuration jsonb default '{}'::jsonb,p_manual_material_price numeric default null,p_slab_quantity numeric default 1,p_override_reason text default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$ declare v_order_id uuid; v_snapshot jsonb; v_subtotal numeric(18,4); v_actor uuid:=auth.uid(); begin if not public.current_user_has_any_role(array['super_admin','admin','sales']) then raise exception 'You do not have permission to configure countertop order items.'; end if; if p_slab_quantity<=0 then raise exception 'Slab quantity must be greater than zero.'; end if; if p_manual_material_price is not null and nullif(btrim(coalesce(p_override_reason,'')),'') is null then raise exception 'Override reason is required.'; end if; select oi.order_id into v_order_id from public.customer_order_items oi join public.customer_orders o on o.id=oi.order_id where oi.id=p_order_item_id and o.status='draft'; if v_order_id is null then raise exception 'Countertop configuration is only editable on draft orders.'; end if; v_snapshot:=public.calculate_countertop_price(p_stone_product_id,p_price_group_id,p_sqft,p_edge_profile_id,p_edge_linear_ft,p_sink_product_id,p_services,p_manual_material_price); v_subtotal:=(v_snapshot->>'subtotal')::numeric; update public.customer_order_items set product_id=p_stone_product_id,countertop_reservation_quantity=p_slab_quantity,sku_snapshot=v_snapshot->'stone'->>'sku',product_name_snapshot=v_snapshot->'stone'->>'name',quantity=1,unit_price=v_subtotal,discount_amount=0,line_subtotal=v_subtotal,line_total=v_subtotal,price_source=case when p_manual_material_price is null then 'price_group' else 'manual' end where id=p_order_item_id; insert into public.countertop_configurations(order_id,order_item_id,stone_product_id,sink_product_id,price_group_id,edge_profile_id,sqft,edge_linear_ft,slab_quantity,manual_price_per_sqft,override_reason,overridden_by,overridden_at,configuration,pricing_snapshot,subtotal) values(v_order_id,p_order_item_id,p_stone_product_id,p_sink_product_id,p_price_group_id,p_edge_profile_id,p_sqft,p_edge_linear_ft,p_slab_quantity,p_manual_material_price,nullif(btrim(p_override_reason),''),case when p_manual_material_price is null then null else v_actor end,case when p_manual_material_price is null then null else now() end,coalesce(p_configuration,'{}'::jsonb),v_snapshot,v_subtotal) on conflict(order_item_id) do update set stone_product_id=excluded.stone_product_id,sink_product_id=excluded.sink_product_id,price_group_id=excluded.price_group_id,edge_profile_id=excluded.edge_profile_id,sqft=excluded.sqft,edge_linear_ft=excluded.edge_linear_ft,slab_quantity=excluded.slab_quantity,manual_price_per_sqft=excluded.manual_price_per_sqft,override_reason=excluded.override_reason,overridden_by=excluded.overridden_by,overridden_at=excluded.overridden_at,configuration=excluded.configuration,pricing_snapshot=excluded.pricing_snapshot,subtotal=excluded.subtotal,updated_at=now(); return p_order_item_id; end; $$;
revoke all on function public.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public,anon; grant execute on function public.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

-- Enrich the historical snapshot from database references; client labels/prices never enter it.
create or replace function private.enrich_countertop_snapshot() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_edge jsonb := null; v_sink jsonb := null; v_services jsonb := '[]'::jsonb; v_price_group_name text;
begin
  if new.edge_profile_id is null and nullif(new.configuration->>'edge_profile_id','') is not null then
    new.edge_profile_id := (new.configuration->>'edge_profile_id')::uuid;
  end if;
  if new.edge_profile_id is not null then select jsonb_build_object('edge_profile_id',ep.id,'name',ep.name,'pricing_method',ep.pricing_method,'unit_price',ep.unit_price,'linear_ft',new.edge_linear_ft,'applicable_measure',case when ep.pricing_method='sq_ft' then new.sqft else new.edge_linear_ft end,'subtotal',new.pricing_snapshot->'edge_subtotal') into v_edge from public.countertop_edge_profiles ep where ep.id=new.edge_profile_id; end if;
  if new.sink_product_id is not null then select jsonb_build_object('product_id',p.id,'sku',p.sku,'name',p.name,'commercial_price_group_id',new.price_group_id,'unit_price',new.pricing_snapshot->'sink_subtotal','subtotal',new.pricing_snapshot->'sink_subtotal') into v_sink from public.products p where p.id=new.sink_product_id; end if;
  select coalesce(jsonb_agg(jsonb_build_object('service_id',s.id,'name',s.name,'pricing_method',s.pricing_method,'unit_price',s.unit_price,'quantity',coalesce(nullif(x->>'quantity','')::numeric,0),'applicable_measure',case when s.pricing_method='sq_ft' then new.sqft when s.pricing_method='linear_ft' then new.edge_linear_ft else 1 end,'subtotal',round(s.unit_price*case when s.pricing_method='flat' then 1 when s.pricing_method='each' then coalesce(nullif(x->>'quantity','')::numeric,0) when s.pricing_method='sq_ft' then new.sqft*coalesce(nullif(x->>'quantity','')::numeric,0) else new.edge_linear_ft*coalesce(nullif(x->>'quantity','')::numeric,0) end,4)) order by s.name),'[]'::jsonb) into v_services from jsonb_array_elements(coalesce(new.configuration->'service_selection','[]'::jsonb)) x join public.countertop_services s on s.id=(x->>'service_id')::uuid;
  new.pricing_snapshot := new.pricing_snapshot || jsonb_build_object('manual_override',jsonb_build_object('applied',new.manual_price_per_sqft is not null,'price_per_sqft',new.manual_price_per_sqft,'reason',new.override_reason,'actor_id',new.overridden_by,'overridden_at',new.overridden_at),'edge',v_edge,'sink',v_sink,'services',v_services,'totals',jsonb_build_object('material_subtotal',new.pricing_snapshot->'material_subtotal','edge_subtotal',new.pricing_snapshot->'edge_subtotal','sink_subtotal',new.pricing_snapshot->'sink_subtotal','services_subtotal',new.pricing_snapshot->'services_subtotal','subtotal',new.pricing_snapshot->'subtotal));
  return new;
end; $$;
drop trigger if exists trg_countertop_snapshot_enrich on public.countertop_configurations;
create trigger trg_countertop_snapshot_enrich before insert or update of edge_profile_id,sink_product_id,price_group_id,sqft,edge_linear_ft,slab_quantity,manual_price_per_sqft,override_reason,overridden_by,overridden_at,configuration on public.countertop_configurations for each row execute function private.enrich_countertop_snapshot();
create or replace function private.reserve_customer_order_item_stock(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_consumed numeric(18,4) := 0;
  v_active numeric(18,4) := 0;
  v_target numeric(18,4) := 0;
  v_needed numeric(18,4) := 0;
  v_excess numeric(18,4) := 0;
  v_take numeric(18,4) := 0;
  v_res record;
  v_inv record;
begin
  select oi.id, oi.order_id, oi.product_id, oi.quantity,
         oi.countertop_reservation_quantity,
         oi.sku_snapshot, oi.product_name_snapshot,
         o.order_number, o.status as order_status
  into v_item
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for share of oi, o;

  if not found or v_item.product_id is null then return; end if;
  if not private.order_status_reserves_stock(v_item.order_status) then return; end if;

  select
    coalesce(sum(r.consumed_quantity), 0),
    coalesce(sum(r.remaining_quantity) filter (
      where r.status = 'active' and r.remaining_quantity > 0
    ), 0)
  into v_consumed, v_active
  from public.customer_order_reservations r
  where r.order_item_id = p_order_item_id;

  -- Countertop jobs reserve physical slabs independently from commercial job quantity.
  v_target := greatest(coalesce(v_item.countertop_reservation_quantity, v_item.quantity) - v_consumed, 0);

  if v_active > v_target then
    v_excess := v_active - v_target;

    for v_res in
      select r.id, r.product_id, r.warehouse_id, r.location_id,
             r.order_number_snapshot, r.remaining_quantity
      from public.customer_order_reservations r
      where r.order_item_id = p_order_item_id
        and r.status = 'active'
        and r.remaining_quantity > 0
      order by r.created_at desc, r.id desc
      for update
    loop
      exit when v_excess <= 0;
      v_take := least(v_res.remaining_quantity, v_excess);

      perform 1
      from public.inventory i
      where i.product_id = v_res.product_id
        and i.warehouse_id = v_res.warehouse_id
        and i.location_id = v_res.location_id
      for update;

      if not found then
        raise exception 'ORDER_RESERVATION_INVENTORY_MISSING: inventory record not found for reservation %', v_res.id;
      end if;

      update public.inventory
      set reserved_quantity = reserved_quantity - v_take
      where product_id = v_res.product_id
        and warehouse_id = v_res.warehouse_id
        and location_id = v_res.location_id
        and reserved_quantity >= v_take;

      if not found then
        raise exception 'ORDER_RESERVATION_DRIFT: inventory reserved quantity is lower than order reservation %', v_res.id;
      end if;

      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type,
        quantity, reference_no, reason, notes, created_by
      ) values (
        v_res.product_id, v_res.warehouse_id, v_res.location_id, 'release',
        v_take, 'ORDER:' || v_res.order_number_snapshot,
        'Customer order reservation reconciliation',
        'Reservation reduced after order line change', auth.uid()
      );

      update public.customer_order_reservations
      set released_quantity = released_quantity + v_take,
          status = case when remaining_quantity - v_take <= 0 then 'released' else 'active' end,
          released_at = case when remaining_quantity - v_take <= 0 then now() else released_at end,
          updated_at = now()
      where id = v_res.id;

      v_excess := v_excess - v_take;
    end loop;

    v_active := v_target;
  end if;

  v_needed := v_target - v_active;
  if v_needed <= 0 then return; end if;

  for v_inv in
    select i.id as inventory_id, i.product_id, i.warehouse_id, i.location_id,
           i.quantity - i.reserved_quantity as available_quantity,
           w.code as warehouse_code, l.code as location_code
    from public.inventory i
    join public.warehouses w on w.id = i.warehouse_id
    join public.locations l on l.id = i.location_id
    where i.product_id = v_item.product_id
      and w.is_active = true
      and w.warehouse_type = 'sellable'
      and l.is_active = true
      and i.quantity - i.reserved_quantity > 0
    order by w.code, l.code, i.id
    for update of i
  loop
    exit when v_needed <= 0;
    v_take := least(v_inv.available_quantity, v_needed);

    update public.inventory
    set reserved_quantity = reserved_quantity + v_take
    where id = v_inv.inventory_id;

    insert into public.customer_order_reservations (
      order_id, order_item_id, product_id, warehouse_id, location_id,
      order_number_snapshot, sku_snapshot, product_name_snapshot,
      quantity, status, created_by
    ) values (
      v_item.order_id, v_item.id, v_item.product_id,
      v_inv.warehouse_id, v_inv.location_id,
      v_item.order_number, v_item.sku_snapshot, v_item.product_name_snapshot,
      v_take, 'active', auth.uid()
    );

    insert into public.inventory_movements (
      product_id, from_warehouse_id, from_location_id, movement_type,
      quantity, reference_no, reason, notes, created_by
    ) values (
      v_item.product_id, v_inv.warehouse_id, v_inv.location_id, 'reservation',
      v_take, 'ORDER:' || v_item.order_number,
      'Customer order reservation',
      'Reserved for order item ' || v_item.sku_snapshot,
      auth.uid()
    );

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception 'ORDER_STOCK_SHORTAGE: SKU % requires % more unit(s) of sellable stock.',
      v_item.sku_snapshot, v_needed;
  end if;
end;
$$;
revoke all on function private.reserve_customer_order_item_stock(uuid)
