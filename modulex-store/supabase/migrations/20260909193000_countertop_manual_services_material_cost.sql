-- Countertop multi-fixture + manual service/material-cost package.
-- Additive and backward-compatible: legacy single Sink/Faucet RPCs remain intact.

alter table public.countertop_services
  add column if not exists price_entry_mode text not null default 'fixed';

alter table public.countertop_services
  drop constraint if exists countertop_services_price_entry_mode_check;
alter table public.countertop_services
  add constraint countertop_services_price_entry_mode_check
  check (price_entry_mode in ('fixed','manual'));

alter table public.countertop_configurations
  add column if not exists material_cost numeric(18,4);
alter table public.countertop_configurations
  drop constraint if exists countertop_configurations_material_cost_check;
alter table public.countertop_configurations
  add constraint countertop_configurations_material_cost_check
  check (material_cost is null or material_cost >= 0);

-- A manually imported Stone can be operational with an active Stone Type before a
-- default Material Price Band is assigned. Pricing remains fail-closed unless an
-- order selects a band or supplies the existing manual $/sq-ft override.
alter table public.countertop_stone_product_profiles
  alter column material_price_band_id drop not null;
alter table public.countertop_configurations
  alter column material_price_band_id drop not null;

create table if not exists public.countertop_configuration_fixtures (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.countertop_configurations(id) on delete cascade,
  fixture_type text not null check (fixture_type in ('sink','faucet')),
  source text not null default 'modulex' check (source in ('modulex','customer_provided')),
  product_id uuid references public.products(id) on delete restrict,
  quantity numeric(12,4) not null default 1 check (quantity > 0),
  manual_unit_price numeric(18,4) check (manual_unit_price is null or manual_unit_price > 0),
  customer_description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countertop_configuration_fixtures_source_product_check check (
    (source = 'modulex' and product_id is not null and customer_description is null)
    or
    (source = 'customer_provided' and manual_unit_price is null and (product_id is not null or nullif(btrim(customer_description),'') is not null))
  )
);

create index if not exists countertop_configuration_fixtures_configuration_idx
  on public.countertop_configuration_fixtures(configuration_id, fixture_type, sort_order, id);
create index if not exists countertop_configuration_fixtures_product_idx
  on public.countertop_configuration_fixtures(product_id) where product_id is not null;
create unique index if not exists countertop_configuration_fixtures_modulex_unique_idx
  on public.countertop_configuration_fixtures(configuration_id, fixture_type, product_id)
  where source = 'modulex';

alter table public.countertop_configuration_fixtures enable row level security;
revoke all on table public.countertop_configuration_fixtures from public, anon;
grant select on table public.countertop_configuration_fixtures to authenticated;
drop policy if exists countertop_configuration_fixtures_admin_read on public.countertop_configuration_fixtures;
create policy countertop_configuration_fixtures_admin_read
on public.countertop_configuration_fixtures
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance']));

-- Deterministic legacy backfill. The old sink_product_id remains as a compatibility projection.
insert into public.countertop_configuration_fixtures(
  configuration_id, fixture_type, source, product_id, quantity, manual_unit_price, sort_order
)
select c.id, 'sink', 'modulex', c.sink_product_id, 1, c.manual_sink_price, 0
from public.countertop_configurations c
where c.sink_product_id is not null
on conflict do nothing;

insert into public.countertop_services(name, pricing_method, unit_price, is_active, price_entry_mode)
select v.name, 'each', 0, true, 'manual'
from (values
  ('New Garbage Disposal Install'),
  ('New Cooktop Install'),
  ('New Dishwasher Install')
) as v(name)
where not exists (
  select 1 from public.countertop_services s where lower(s.name) = lower(v.name)
);

update public.countertop_services
set price_entry_mode = 'manual', unit_price = 0, pricing_method = 'each', is_active = true, updated_at = now()
where lower(name) in (
  lower('New Garbage Disposal Install'),
  lower('New Cooktop Install'),
  lower('New Dishwasher Install')
);

create or replace function private.upsert_countertop_service_reference(
  p_id uuid default null,
  p_name text default null,
  p_pricing_method text default 'each',
  p_unit_price numeric default null,
  p_price_entry_mode text default 'fixed',
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text := nullif(btrim(p_name),'');
  v_mode text := lower(coalesce(nullif(btrim(p_price_entry_mode),''),'fixed'));
  v_method text := lower(coalesce(nullif(btrim(p_pricing_method),''),'each'));
  v_price numeric := p_unit_price;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'Countertop reference management requires admin permission.' using errcode='42501';
  end if;
  if v_name is null then raise exception 'Service name is required.'; end if;
  if v_method not in ('each','sq_ft','linear_ft','flat') then raise exception 'Invalid pricing method.'; end if;
  if v_mode not in ('fixed','manual') then raise exception 'Invalid price entry mode.'; end if;
  if v_mode = 'fixed' and (v_price is null or v_price < 0) then raise exception 'Fixed Price service requires a non-negative unit price.'; end if;
  if v_mode = 'manual' then v_price := 0; end if;

  insert into public.countertop_services(id,name,pricing_method,unit_price,is_active,price_entry_mode)
  values(v_id,v_name,v_method,v_price,coalesce(p_is_active,true),v_mode)
  on conflict (id) do update set
    name=excluded.name,
    pricing_method=excluded.pricing_method,
    unit_price=excluded.unit_price,
    is_active=excluded.is_active,
    price_entry_mode=excluded.price_entry_mode,
    updated_at=now();
  return v_id;
end;
$$;

create or replace function public.upsert_countertop_service_reference(
  p_id uuid default null,
  p_name text default null,
  p_pricing_method text default 'each',
  p_unit_price numeric default null,
  p_price_entry_mode text default 'fixed',
  p_is_active boolean default true
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.upsert_countertop_service_reference($1,$2,$3,$4,$5,$6);
$$;
revoke all on function private.upsert_countertop_service_reference(uuid,text,text,numeric,text,boolean) from public, anon, service_role;
revoke all on function public.upsert_countertop_service_reference(uuid,text,text,numeric,text,boolean) from public, anon, service_role;
grant execute on function private.upsert_countertop_service_reference(uuid,text,text,numeric,text,boolean) to authenticated;
grant execute on function public.upsert_countertop_service_reference(uuid,text,text,numeric,text,boolean) to authenticated;

create or replace function public.calculate_countertop_price_multi(
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_services jsonb default '[]'::jsonb,
  p_manual_material_price numeric default null,
  p_material_cost numeric default null,
  p_fixtures jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_stone record;
  v_band record;
  v_edge numeric(18,4) := 0;
  v_material numeric(18,4) := 0;
  v_material_cost numeric(18,4) := coalesce(p_material_cost,0);
  v_services numeric(18,4) := 0;
  v_sinks numeric(18,4) := 0;
  v_faucets numeric(18,4) := 0;
  v_service_lines jsonb := '[]'::jsonb;
  v_fixture_lines jsonb := '[]'::jsonb;
  v_item jsonb;
  v_service record;
  v_product record;
  v_qty numeric;
  v_measure numeric;
  v_unit numeric;
  v_line numeric;
  v_type text;
  v_source text;
  v_manual numeric;
  v_price_source text;
begin
  if p_sqft is null or p_sqft <= 0 or p_edge_linear_ft is null or p_edge_linear_ft < 0 then
    raise exception 'Countertop dimensions must be positive.';
  end if;
  if p_material_cost is not null and p_material_cost < 0 then raise exception 'Material Cost cannot be negative.'; end if;
  if p_manual_material_price is not null and p_manual_material_price < 0 then raise exception 'Manual material price cannot be negative.'; end if;
  if jsonb_typeof(coalesce(p_services,'[]'::jsonb)) <> 'array' then raise exception 'Services must be an array.'; end if;
  if jsonb_typeof(coalesce(p_fixtures,'[]'::jsonb)) <> 'array' then raise exception 'Fixtures must be an array.'; end if;

  select p.id,p.sku,p.name,st.name as stone_type,sp.material_price_band_id as default_material_price_band_id
  into v_stone
  from public.products p
  join public.countertop_stone_product_profiles sp on sp.product_id=p.id and sp.is_active
  join public.countertop_stone_types st on st.id=sp.stone_type_id and st.is_active
  join public.product_types pt on pt.id=p.product_type_id and pt.code='STONE' and pt.is_active
  where p.id=p_stone_product_id and p.status='active';
  if not found then raise exception 'Stone product is unavailable or has no active Stone Type.'; end if;

  if p_material_price_band_id is not null then
    select mb.id,mb.code,mb.price_per_sqft into v_band
    from public.countertop_material_price_bands mb
    where mb.id=p_material_price_band_id and mb.is_active;
    if not found then raise exception 'Material price band is unavailable.'; end if;
  elsif p_manual_material_price is null then
    raise exception 'Select a Material Price Band or enter a manual material price.';
  end if;

  v_material := round(coalesce(p_manual_material_price,v_band.price_per_sqft) * p_sqft,4);

  if p_edge_profile_id is not null then
    select round(ep.unit_price * case when ep.pricing_method='linear_ft' then p_edge_linear_ft when ep.pricing_method='sq_ft' then p_sqft else 1 end,4)
    into v_edge
    from public.countertop_edge_profiles ep where ep.id=p_edge_profile_id and ep.is_active;
    if not found then raise exception 'Edge profile is unavailable.'; end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_services,'[]'::jsonb)) loop
    begin v_qty := coalesce(nullif(v_item->>'quantity','')::numeric,0); exception when others then raise exception 'Service quantity is invalid.'; end;
    select s.id,s.name,s.pricing_method,s.unit_price,s.price_entry_mode into v_service
    from public.countertop_services s where s.id=nullif(v_item->>'service_id','')::uuid and s.is_active;
    if not found or v_qty <= 0 then raise exception 'Service is unavailable or quantity is invalid.'; end if;
    if v_service.price_entry_mode='manual' then
      begin v_unit := nullif(v_item->>'manual_unit_price','')::numeric; exception when others then raise exception 'Manual service price is invalid.'; end;
      if v_unit is null or v_unit <= 0 then raise exception 'Manual Per Order service requires a price greater than zero.'; end if;
      v_price_source := 'manual_per_order';
    else
      v_unit := v_service.unit_price;
      v_price_source := 'fixed';
    end if;
    v_measure := case when v_service.pricing_method='sq_ft' then p_sqft when v_service.pricing_method='linear_ft' then p_edge_linear_ft else 1 end;
    v_line := round(v_unit * case when v_service.pricing_method='flat' then 1 else v_qty*v_measure end,4);
    v_services := v_services + v_line;
    v_service_lines := v_service_lines || jsonb_build_array(jsonb_build_object(
      'service_id',v_service.id,'name',v_service.name,'pricing_method',v_service.pricing_method,
      'price_entry_mode',v_service.price_entry_mode,'quantity',v_qty,'unit_price',v_unit,
      'manual_unit_price',case when v_service.price_entry_mode='manual' then v_unit else null end,
      'price_source',v_price_source,'subtotal',v_line
    ));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_fixtures,'[]'::jsonb)) loop
    v_type := lower(coalesce(v_item->>'fixture_type',''));
    v_source := lower(coalesce(nullif(v_item->>'source',''),'modulex'));
    if v_type not in ('sink','faucet') then raise exception 'Fixture type must be sink or faucet.'; end if;
    if v_source not in ('modulex','customer_provided') then raise exception 'Fixture source is invalid.'; end if;
    begin v_qty := coalesce(nullif(v_item->>'quantity','')::numeric,0); exception when others then raise exception 'Fixture quantity is invalid.'; end;
    if v_qty <= 0 then raise exception 'Fixture quantity must be greater than zero.'; end if;

    if v_source='customer_provided' then
      if nullif(v_item->>'product_id','') is null and nullif(btrim(coalesce(v_item->>'customer_description','')),'') is null then
        raise exception 'Customer-provided fixture requires a catalog match or product details.';
      end if;
      v_fixture_lines := v_fixture_lines || jsonb_build_array(jsonb_build_object(
        'fixture_type',v_type,'source','customer_provided','product_id',nullif(v_item->>'product_id',''),
        'name',coalesce(nullif(v_item->>'customer_description',''),'Customer Provides'),'quantity',v_qty,
        'unit_price',0,'price_source','customer_provided','subtotal',0
      ));
      continue;
    end if;

    if nullif(v_item->>'product_id','') is null then raise exception 'Modulex fixture requires a product.'; end if;
    select p.id,p.sku,p.name,pt.code into v_product
    from public.products p join public.product_types pt on pt.id=p.product_type_id and pt.is_active
    where p.id=(v_item->>'product_id')::uuid and p.status='active';
    if not found or (v_type='sink' and v_product.code<>'SINK') or (v_type='faucet' and v_product.code<>'FUCST') then
      raise exception '% is unavailable or has the wrong Product Type.', initcap(v_type);
    end if;

    select pp.amount into v_unit
    from public.product_prices pp
    where pp.product_id=v_product.id and pp.price_group_id=p_price_group_id
      and pp.currency_code='USD' and pp.is_active and pp.valid_to is null and pp.amount>0
    order by pp.valid_from desc,pp.created_at desc limit 1;
    begin v_manual := nullif(v_item->>'manual_unit_price','')::numeric; exception when others then raise exception 'Manual fixture price is invalid.'; end;
    if v_unit is null and v_type='sink' and v_manual is not null and v_manual>0 then
      v_unit := v_manual; v_price_source := 'manual_fallback';
    elsif v_unit is null then
      if v_type='sink' then raise exception 'Sink has no positive active price for this price group. Enter a manual Sink fallback price.';
      else raise exception 'Faucet has no active price for this price group.'; end if;
    else
      v_price_source := 'price_group';
    end if;
    v_line := round(v_unit*v_qty,4);
    if v_type='sink' then v_sinks:=v_sinks+v_line; else v_faucets:=v_faucets+v_line; end if;
    v_fixture_lines := v_fixture_lines || jsonb_build_array(jsonb_build_object(
      'fixture_type',v_type,'source','modulex','product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
      'quantity',v_qty,'unit_price',v_unit,'manual_unit_price',case when v_price_source='manual_fallback' then v_manual else null end,
      'price_source',v_price_source,'subtotal',v_line
    ));
  end loop;

  return jsonb_build_object(
    'stone',jsonb_build_object(
      'product_id',v_stone.id,'sku',v_stone.sku,'name',v_stone.name,'stone_type',v_stone.stone_type,
      'default_material_price_band_id',v_stone.default_material_price_band_id,
      'material_price_band_id',p_material_price_band_id,
      'material_price_band',case when p_material_price_band_id is null then null else v_band.code end,
      'material_band_price_per_sqft',case when p_material_price_band_id is null then null else v_band.price_per_sqft end,
      'price_per_sqft',coalesce(p_manual_material_price,v_band.price_per_sqft),'sqft',p_sqft
    ),
    'material_subtotal',v_material,'material_cost',v_material_cost,'edge_subtotal',v_edge,
    'sink_subtotal',v_sinks,'faucet_subtotal',v_faucets,'services_subtotal',v_services,
    'fixtures',v_fixture_lines,
    'sinks',(select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_fixture_lines) x where x->>'fixture_type'='sink'),
    'faucets',(select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_fixture_lines) x where x->>'fixture_type'='faucet'),
    'services',v_service_lines,
    'subtotal',round(v_material+v_material_cost+v_edge+v_sinks+v_faucets+v_services,4)
  );
end;
$$;
revoke all on function public.calculate_countertop_price_multi(uuid,uuid,uuid,numeric,uuid,numeric,jsonb,numeric,numeric,jsonb) from public, anon;
grant execute on function public.calculate_countertop_price_multi(uuid,uuid,uuid,numeric,uuid,numeric,jsonb,numeric,numeric,jsonb) to authenticated;

create or replace function private.attach_countertop_configuration_multi(
  p_order_item_id uuid,
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_material_cost numeric default null,
  p_fixtures jsonb default '[]'::jsonb,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_snapshot jsonb;
  v_subtotal numeric(18,4);
  v_configuration_id uuid;
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_order_subtotal numeric(18,4);
  v_order_discount numeric(18,4);
  v_tax_rate numeric(7,3);
  v_commission_rate numeric(7,3);
  v_taxable numeric(18,4);
  v_tax_amount numeric(18,4);
  v_total numeric(18,4);
  v_commission_amount numeric(18,4);
  v_grand_total numeric(18,4);
  v_legacy_sink uuid;
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to configure countertop order items.' using errcode='42501';
  end if;
  if p_slab_quantity is null or p_slab_quantity<=0 then raise exception 'Slab quantity must be greater than zero.'; end if;
  if p_manual_material_price is not null and nullif(btrim(coalesce(p_override_reason,'')),'') is null then raise exception 'Override reason is required.'; end if;

  select oi.order_id into v_order_id
  from public.customer_order_items oi join public.customer_orders o on o.id=oi.order_id
  where oi.id=p_order_item_id and o.status='draft' for update of o;
  if v_order_id is null then raise exception 'Countertop configuration is only editable on draft orders.'; end if;

  v_snapshot := public.calculate_countertop_price_multi(
    p_stone_product_id,p_material_price_band_id,p_price_group_id,p_sqft,p_edge_profile_id,p_edge_linear_ft,
    p_services,p_manual_material_price,p_material_cost,p_fixtures
  );
  v_subtotal := (v_snapshot->>'subtotal')::numeric;
  select nullif(x->>'product_id','')::uuid into v_legacy_sink
  from jsonb_array_elements(coalesce(p_fixtures,'[]'::jsonb)) x
  where x->>'fixture_type'='sink' and coalesce(x->>'source','modulex')='modulex'
  order by coalesce((x->>'sort_order')::integer,0) limit 1;

  insert into private.countertop_order_pricing_gate(backend_pid,transaction_id,order_item_id)
  values(pg_backend_pid(),txid_current(),p_order_item_id) on conflict do nothing;

  update public.customer_order_items set
    product_id=p_stone_product_id,
    countertop_reservation_quantity=p_slab_quantity,
    sku_snapshot=v_snapshot->'stone'->>'sku',
    product_name_snapshot=v_snapshot->'stone'->>'name',
    quantity=1,unit_price=v_subtotal,discount_amount=0,line_subtotal=v_subtotal,line_total=v_subtotal,
    price_source=case when p_manual_material_price is not null or p_material_cost is not null or exists(
      select 1 from jsonb_array_elements(coalesce(p_fixtures,'[]'::jsonb)) x where nullif(x->>'manual_unit_price','') is not null
    ) then 'manual' else 'price_group' end
  where id=p_order_item_id;

  insert into public.countertop_configurations(
    order_id,order_item_id,stone_product_id,material_price_band_id,sink_product_id,price_group_id,edge_profile_id,
    sqft,edge_linear_ft,slab_quantity,manual_price_per_sqft,manual_sink_price,material_cost,override_reason,
    overridden_by,overridden_at,configuration,pricing_snapshot,subtotal
  ) values(
    v_order_id,p_order_item_id,p_stone_product_id,p_material_price_band_id,v_legacy_sink,p_price_group_id,p_edge_profile_id,
    p_sqft,p_edge_linear_ft,p_slab_quantity,p_manual_material_price,null,p_material_cost,nullif(btrim(p_override_reason),''),
    case when p_manual_material_price is null then null else v_actor end,
    case when p_manual_material_price is null then null else now() end,
    coalesce(p_configuration,'{}'::jsonb),v_snapshot,v_subtotal
  )
  on conflict(order_item_id) do update set
    stone_product_id=excluded.stone_product_id,material_price_band_id=excluded.material_price_band_id,
    sink_product_id=excluded.sink_product_id,price_group_id=excluded.price_group_id,edge_profile_id=excluded.edge_profile_id,
    sqft=excluded.sqft,edge_linear_ft=excluded.edge_linear_ft,slab_quantity=excluded.slab_quantity,
    manual_price_per_sqft=excluded.manual_price_per_sqft,manual_sink_price=null,material_cost=excluded.material_cost,
    override_reason=excluded.override_reason,overridden_by=excluded.overridden_by,overridden_at=excluded.overridden_at,
    configuration=excluded.configuration,pricing_snapshot=excluded.pricing_snapshot,subtotal=excluded.subtotal,updated_at=now()
  returning id into v_configuration_id;

  delete from public.countertop_configuration_fixtures where configuration_id=v_configuration_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_fixtures,'[]'::jsonb)) loop
    insert into public.countertop_configuration_fixtures(
      configuration_id,fixture_type,source,product_id,quantity,manual_unit_price,customer_description,sort_order
    ) values(
      v_configuration_id,lower(v_item->>'fixture_type'),lower(coalesce(nullif(v_item->>'source',''),'modulex')),
      nullif(v_item->>'product_id','')::uuid,(v_item->>'quantity')::numeric,
      nullif(v_item->>'manual_unit_price','')::numeric,nullif(btrim(coalesce(v_item->>'customer_description','')),''),
      coalesce(nullif(v_item->>'sort_order','')::integer,0)
    );
  end loop;

  select o.discount_amount,o.tax_rate,o.payment_commission_percent into v_order_discount,v_tax_rate,v_commission_rate
  from public.customer_orders o where o.id=v_order_id for update;
  select coalesce(sum(i.line_total),0) into v_order_subtotal from public.customer_order_items i where i.order_id=v_order_id;
  if coalesce(v_order_discount,0)>v_order_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  v_taxable:=greatest(v_order_subtotal-coalesce(v_order_discount,0),0);
  v_tax_amount:=round(v_taxable*(coalesce(v_tax_rate,0)/100),4);
  v_total:=round(v_taxable+v_tax_amount,4);
  v_commission_amount:=round(v_total*(coalesce(v_commission_rate,0)/100),4);
  v_grand_total:=round(v_total+v_commission_amount,4);
  update public.customer_orders set
    item_count=(select count(*) from public.customer_order_items where order_id=v_order_id),subtotal=round(v_order_subtotal,4),
    tax_amount=v_tax_amount,total_amount=v_total,payment_commission_amount=v_commission_amount,grand_total=v_grand_total
  where id=v_order_id;

  delete from private.countertop_order_pricing_gate where backend_pid=pg_backend_pid() and transaction_id=txid_current() and order_item_id=p_order_item_id;
  return p_order_item_id;
end;
$$;

create or replace function public.attach_countertop_configuration_multi(
  p_order_item_id uuid,p_stone_product_id uuid,p_material_price_band_id uuid,p_price_group_id uuid,p_sqft numeric,
  p_edge_profile_id uuid default null,p_edge_linear_ft numeric default 0,p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,p_manual_material_price numeric default null,p_material_cost numeric default null,
  p_fixtures jsonb default '[]'::jsonb,p_slab_quantity numeric default 1,p_override_reason text default null
)
returns uuid language sql security invoker set search_path=''
as $$ select private.attach_countertop_configuration_multi($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14); $$;
revoke all on function private.attach_countertop_configuration_multi(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) from public,anon,service_role;
revoke all on function public.attach_countertop_configuration_multi(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) from public,anon,service_role;
grant execute on function private.attach_countertop_configuration_multi(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) to authenticated;
grant execute on function public.attach_countertop_configuration_multi(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) to authenticated;

create or replace function private.create_and_attach_countertop_order_item_multi(
  p_order_id uuid,p_request_id uuid,p_stone_product_id uuid,p_material_price_band_id uuid,p_price_group_id uuid,p_sqft numeric,
  p_edge_profile_id uuid default null,p_edge_linear_ft numeric default 0,p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,p_manual_material_price numeric default null,p_material_cost numeric default null,
  p_fixtures jsonb default '[]'::jsonb,p_slab_quantity numeric default 1,p_override_reason text default null
)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
  v_actor uuid:=auth.uid(); v_order public.customer_orders%rowtype; v_item_id uuid:=gen_random_uuid();
  v_existing uuid; v_existing_actor uuid; v_line_no integer; v_stone record;
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then raise exception 'You do not have permission to add countertop order items.' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Countertop initiation request id is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text||':'||p_request_id::text,0));
  select i.order_item_id,i.created_by into v_existing,v_existing_actor from private.countertop_order_item_initiations i where i.order_id=p_order_id and i.request_id=p_request_id;
  if v_existing is not null then
    if v_existing_actor is distinct from v_actor then raise exception 'Countertop initiation request belongs to another actor.' using errcode='42501'; end if;
    return v_existing;
  end if;
  select o.* into v_order from public.customer_orders o where o.id=p_order_id for update;
  if v_order.id is null then raise exception 'Order not found.'; end if;
  if v_order.status<>'draft' then raise exception 'Countertop order items can only be added to draft orders.'; end if;
  select p.sku,p.name into v_stone from public.products p
  join public.countertop_stone_product_profiles sp on sp.product_id=p.id and sp.is_active
  join public.countertop_stone_types st on st.id=sp.stone_type_id and st.is_active
  join public.product_types pt on pt.id=p.product_type_id and pt.code='STONE' and pt.is_active
  where p.id=p_stone_product_id and p.status='active';
  if not found then raise exception 'Stone product is unavailable or has no active Stone Type.'; end if;
  select coalesce(max(oi.line_no),0)+1 into v_line_no from public.customer_order_items oi where oi.order_id=p_order_id;
  insert into private.countertop_order_pricing_gate(backend_pid,transaction_id,order_item_id) values(pg_backend_pid(),txid_current(),v_item_id) on conflict do nothing;
  insert into public.customer_order_items(id,order_id,product_id,line_no,sku_snapshot,product_name_snapshot,quantity,unit_price,discount_percent,discount_amount,line_subtotal,line_total,price_source,countertop_reservation_quantity,created_by)
  values(v_item_id,p_order_id,p_stone_product_id,v_line_no,v_stone.sku,v_stone.name,1,0,0,0,0,0,'price_group',p_slab_quantity,v_actor);
  perform private.attach_countertop_configuration_multi(v_item_id,p_stone_product_id,p_material_price_band_id,p_price_group_id,p_sqft,p_edge_profile_id,p_edge_linear_ft,p_services,p_configuration,p_manual_material_price,p_material_cost,p_fixtures,p_slab_quantity,p_override_reason);
  delete from private.countertop_order_pricing_gate where backend_pid=pg_backend_pid() and transaction_id=txid_current() and order_item_id=v_item_id;
  insert into private.countertop_order_item_initiations(order_id,request_id,order_item_id,created_by) values(p_order_id,p_request_id,v_item_id,v_actor);
  insert into public.customer_activity(customer_id,activity_type,title,description,metadata)
  values(v_order.customer_id,'order_updated','Countertop added',v_order.order_number||' countertop line '||v_line_no,jsonb_build_object('order_id',p_order_id,'order_item_id',v_item_id,'request_id',p_request_id));
  return v_item_id;
end;
$$;

create or replace function public.create_and_attach_countertop_order_item_multi(
  p_order_id uuid,p_request_id uuid,p_stone_product_id uuid,p_material_price_band_id uuid,p_price_group_id uuid,p_sqft numeric,
  p_edge_profile_id uuid default null,p_edge_linear_ft numeric default 0,p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,p_manual_material_price numeric default null,p_material_cost numeric default null,
  p_fixtures jsonb default '[]'::jsonb,p_slab_quantity numeric default 1,p_override_reason text default null
)
returns uuid language sql security invoker set search_path=''
as $$ select private.create_and_attach_countertop_order_item_multi($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15); $$;
revoke all on function private.create_and_attach_countertop_order_item_multi(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) from public,anon,service_role;
revoke all on function public.create_and_attach_countertop_order_item_multi(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) from public,anon,service_role;
grant execute on function private.create_and_attach_countertop_order_item_multi(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) to authenticated;
grant execute on function public.create_and_attach_countertop_order_item_multi(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text) to authenticated;

comment on table public.countertop_configuration_fixtures is 'Normalized Countertop Sink/Faucet selections. Legacy countertop_configurations.sink_product_id is retained as a first-Sink compatibility projection.';
comment on column public.countertop_services.price_entry_mode is 'fixed uses catalog unit_price; manual requires manual_unit_price in the order pricing request.';
comment on column public.countertop_configurations.material_cost is 'Optional one-time additive material cost for the Countertop order line.';
