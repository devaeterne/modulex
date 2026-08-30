-- Countertop / Stone / Sink MVP. Additive; do not apply to production without preflight.
-- Slab MVP is quantity-based: canonical products with unit = 'slab' use inventory.quantity/reserved_quantity.
create table if not exists public.countertop_stone_types (
  id uuid primary key default gen_random_uuid(), name text not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists countertop_stone_types_name_ci on public.countertop_stone_types(lower(btrim(name)));

create table if not exists public.countertop_edge_profiles (
  id uuid primary key default gen_random_uuid(), name text not null, pricing_method text not null default 'linear_ft',
  unit_price numeric(18,4) not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint countertop_edge_profiles_method_check check (pricing_method in ('each','sq_ft','linear_ft','flat')),
  constraint countertop_edge_profiles_price_check check (unit_price >= 0)
);
create unique index if not exists countertop_edge_profiles_name_ci on public.countertop_edge_profiles(lower(btrim(name)));

create table if not exists public.countertop_services (
  id uuid primary key default gen_random_uuid(), name text not null, pricing_method text not null,
  unit_price numeric(18,4) not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint countertop_services_method_check check (pricing_method in ('each','sq_ft','linear_ft','flat')),
  constraint countertop_services_price_check check (unit_price >= 0)
);
create unique index if not exists countertop_services_name_ci on public.countertop_services(lower(btrim(name)));

insert into public.countertop_stone_types(name) values
 ('Quartz'),('Granite'),('Marble'),('Quartzite'),('Travertine'),('Porcelain'),('Soapstone'),('Dolomite'),('Onyx')
on conflict do nothing;
insert into public.countertop_edge_profiles(name, unit_price) values
 ('Eased Edge',0),('Pencil Edge',0),('1/4 Beveled',0),('Half Bull Nose',10),('1/2 Beveled',10),('Single Ogee',20),('DuPont',20),('Double O''gee',30),('Laminate',50),('Mitered',100)
on conflict do nothing;
insert into public.countertop_services(name, pricing_method, unit_price) values
 ('Regular Removal','flat',250),('Granite Removal','flat',400),('Kitchen Sink Plumbing','each',400),('Bathroom Sink Plumbing','each',250),('Outlet Cutout','each',50),('Kitchen Sink Cutout','each',200),('Bathroom Sink Cutout','each',150)
on conflict do nothing;

create table if not exists public.countertop_configurations (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.customer_orders(id) on delete cascade,
  order_item_id uuid not null unique references public.customer_order_items(id) on delete cascade,
  stone_product_id uuid not null references public.products(id) on delete restrict,
  sink_product_id uuid references public.products(id) on delete restrict,
  price_group_id uuid references public.price_groups(id) on delete restrict,
  sqft numeric(18,4) not null, edge_linear_ft numeric(18,4) not null default 0,
  configuration jsonb not null default '{}'::jsonb, pricing_snapshot jsonb not null,
  subtotal numeric(18,4) not null, created_at timestamptz not null default now(),
  constraint countertop_config_dimensions_check check (sqft > 0 and edge_linear_ft >= 0),
  constraint countertop_config_totals_check check (subtotal >= 0)
);
create index if not exists countertop_configurations_order_idx on public.countertop_configurations(order_id);
create index if not exists countertop_configurations_stone_idx on public.countertop_configurations(stone_product_id);

alter table public.countertop_stone_types enable row level security;
alter table public.countertop_edge_profiles enable row level security;
alter table public.countertop_services enable row level security;
alter table public.countertop_configurations enable row level security;
grant select on public.countertop_stone_types, public.countertop_edge_profiles, public.countertop_services to authenticated;
grant select on public.countertop_configurations to authenticated;
revoke all on public.countertop_stone_types, public.countertop_edge_profiles, public.countertop_services, public.countertop_configurations from anon;
create policy countertop_reference_read on public.countertop_stone_types for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
create policy countertop_edge_read on public.countertop_edge_profiles for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
create policy countertop_service_read on public.countertop_services for select to authenticated using (is_active or public.current_user_has_any_role(array['super_admin','admin']));
create policy countertop_config_read on public.countertop_configurations for select to authenticated using (public.current_user_has_any_role(array['super_admin','admin','sales','warehouse','shipping']));

create or replace function public.calculate_countertop_price(
  p_stone_product_id uuid, p_price_group_id uuid, p_sqft numeric, p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0, p_sink_product_id uuid default null, p_services jsonb default '[]'::jsonb,
  p_manual_material_price numeric default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_material numeric(18,4); v_edge numeric(18,4) := 0; v_sink numeric(18,4) := 0; v_services numeric(18,4) := 0; v_item jsonb; v_service public.countertop_services%rowtype;
begin
  if p_sqft is null or p_sqft <= 0 or p_edge_linear_ft < 0 then raise exception 'Countertop dimensions must be positive.'; end if;
  if not exists (select 1 from public.products p where p.id = p_stone_product_id and p.status = 'active') then raise exception 'Stone product is unavailable.'; end if;
  if p_manual_material_price is not null then
    if p_manual_material_price < 0 then raise exception 'Manual material price cannot be negative.'; end if;
    v_material := round(p_manual_material_price * p_sqft, 4);
  else
    select round(pp.amount * p_sqft, 4) into v_material from public.product_prices pp
    where pp.product_id = p_stone_product_id and pp.price_group_id = p_price_group_id and pp.currency_code = 'USD' and pp.is_active and pp.valid_to is null
    order by pp.valid_from desc limit 1;
    if v_material is null then raise exception 'No active stone price exists for this price group.'; end if;
  end if;
  if p_edge_profile_id is not null then select round(ep.unit_price * p_edge_linear_ft,4) into v_edge from public.countertop_edge_profiles ep where ep.id=p_edge_profile_id and ep.is_active; if not found then raise exception 'Edge profile is unavailable.'; end if; end if;
  if p_sink_product_id is not null then select pp.amount into v_sink from public.product_prices pp join public.products p on p.id=pp.product_id where pp.product_id=p_sink_product_id and p.status='active' and pp.price_group_id=p_price_group_id and pp.currency_code='USD' and pp.is_active and pp.valid_to is null order by pp.valid_from desc limit 1; if v_sink is null then raise exception 'Sink is unavailable or has no price.'; end if; end if;
  if jsonb_typeof(p_services) <> 'array' then raise exception 'Services must be an array.'; end if;
  for v_item in select value from jsonb_array_elements(p_services) loop
    select * into v_service from public.countertop_services where id=(v_item->>'service_id')::uuid and is_active;
    if not found or coalesce((v_item->>'quantity')::numeric,0) <= 0 then raise exception 'Service is unavailable or quantity is invalid.'; end if;
    v_services := v_services + round(v_service.unit_price * (v_item->>'quantity')::numeric,4);
  end loop;
  return jsonb_build_object('material_subtotal',v_material,'edge_subtotal',v_edge,'sink_subtotal',v_sink,'services_subtotal',v_services,'subtotal',round(v_material+v_edge+v_sink+v_services,4));
end; $$;
revoke all on function public.calculate_countertop_price(uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) from public, anon;
grant execute on function public.calculate_countertop_price(uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) to authenticated;

create or replace function public.attach_countertop_configuration(
  p_order_item_id uuid, p_stone_product_id uuid, p_price_group_id uuid, p_sqft numeric,
  p_edge_profile_id uuid default null, p_edge_linear_ft numeric default 0, p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb, p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_order_id uuid; v_snapshot jsonb; v_subtotal numeric(18,4); v_item_id uuid := p_order_item_id;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then raise exception 'You do not have permission to configure countertop order items.'; end if;
  select oi.order_id into v_order_id from public.customer_order_items oi join public.customer_orders o on o.id=oi.order_id where oi.id=p_order_item_id and o.status='draft';
  if v_order_id is null then raise exception 'Countertop configuration is only editable on draft orders.'; end if;
  v_snapshot := public.calculate_countertop_price(p_stone_product_id,p_price_group_id,p_sqft,p_edge_profile_id,p_edge_linear_ft,p_sink_product_id,p_services,p_manual_material_price);
  v_subtotal := (v_snapshot->>'subtotal')::numeric;
  update public.customer_order_items set product_id=p_stone_product_id, quantity=1, unit_price=v_subtotal, discount_amount=0, line_subtotal=v_subtotal, line_total=v_subtotal, price_source=case when p_manual_material_price is null then 'price_group' else 'manual' end where id=p_order_item_id;
  insert into public.countertop_configurations(order_id,order_item_id,stone_product_id,sink_product_id,price_group_id,sqft,edge_linear_ft,configuration,pricing_snapshot,subtotal)
  values(v_order_id,p_order_item_id,p_stone_product_id,p_sink_product_id,p_price_group_id,p_sqft,p_edge_linear_ft,coalesce(p_configuration,'{}'::jsonb),v_snapshot,v_subtotal)
  on conflict (order_item_id) do update set stone_product_id=excluded.stone_product_id,sink_product_id=excluded.sink_product_id,price_group_id=excluded.price_group_id,sqft=excluded.sqft,edge_linear_ft=excluded.edge_linear_ft,configuration=excluded.configuration,pricing_snapshot=excluded.pricing_snapshot,subtotal=excluded.subtotal;
  return v_item_id;
end; $$;
revoke all on function public.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric) from public, anon;
grant execute on function public.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric) to authenticated;
