-- Allow a Countertop order line to choose any active Material Price Band while
-- preserving the Stone Product Profile band as the catalog default.
-- Additive and backward-compatible: legacy RPC signatures continue to use the
-- Stone profile default band; new signatures accept an explicit selected band.

alter table public.countertop_configurations
  add column if not exists material_price_band_id uuid
  references public.countertop_material_price_bands(id) on delete restrict;

update public.countertop_configurations c
set material_price_band_id = sp.material_price_band_id
from public.countertop_stone_product_profiles sp
where sp.product_id = c.stone_product_id
  and c.material_price_band_id is null;

do $$
begin
  if exists (
    select 1
    from public.countertop_configurations
    where material_price_band_id is null
  ) then
    raise exception 'Countertop material band backfill failed for one or more configurations.';
  end if;
end;
$$;

alter table public.countertop_configurations
  alter column material_price_band_id set not null;

create index if not exists countertop_configurations_material_band_idx
  on public.countertop_configurations(material_price_band_id);

create or replace function public.calculate_countertop_price(
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_manual_material_price numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_material numeric(18,4);
  v_edge numeric(18,4) := 0;
  v_sink numeric(18,4) := 0;
  v_services numeric(18,4) := 0;
  v_item jsonb;
  v_service record;
  v_profile record;
  v_band record;
  v_qty numeric;
  v_measure numeric;
begin
  if p_sqft is null or p_sqft <= 0 or p_edge_linear_ft is null or p_edge_linear_ft < 0 then
    raise exception 'Countertop dimensions must be positive.';
  end if;

  select p.id,
         p.sku,
         p.name,
         st.name as stone_type,
         sp.material_price_band_id as default_material_price_band_id
    into v_profile
  from public.products p
  join public.countertop_stone_product_profiles sp
    on sp.product_id = p.id and sp.is_active
  join public.countertop_stone_types st
    on st.id = sp.stone_type_id and st.is_active
  where p.id = p_stone_product_id
    and p.status = 'active';

  if not found then
    raise exception 'Stone product is unavailable or has no active stone profile.';
  end if;

  select mb.id, mb.code, mb.price_per_sqft
    into v_band
  from public.countertop_material_price_bands mb
  where mb.id = p_material_price_band_id
    and mb.is_active;

  if not found then
    raise exception 'Material price band is unavailable.';
  end if;

  if p_manual_material_price is not null then
    if p_manual_material_price < 0 then
      raise exception 'Manual material price cannot be negative.';
    end if;
    v_material := round(p_manual_material_price * p_sqft, 4);
  else
    v_material := round(v_band.price_per_sqft * p_sqft, 4);
  end if;

  if p_edge_profile_id is not null then
    select round(
      ep.unit_price * case
        when ep.pricing_method = 'linear_ft' then p_edge_linear_ft
        when ep.pricing_method = 'sq_ft' then p_sqft
        else 1
      end,
      4
    )
      into v_edge
    from public.countertop_edge_profiles ep
    where ep.id = p_edge_profile_id
      and ep.is_active;

    if not found then
      raise exception 'Edge profile is unavailable.';
    end if;
  end if;

  if p_sink_product_id is not null then
    select pp.amount
      into v_sink
    from public.product_prices pp
    join public.products p on p.id = pp.product_id
    where pp.product_id = p_sink_product_id
      and p.status = 'active'
      and lower(coalesce(p.metadata->>'product_kind','')) = 'sink'
      and pp.price_group_id = p_price_group_id
      and pp.currency_code = 'USD'
      and pp.is_active
      and pp.valid_to is null
    order by pp.valid_from desc
    limit 1;

    if v_sink is null then
      raise exception 'Sink is unavailable or has no active sink price.';
    end if;
  end if;

  if jsonb_typeof(p_services) <> 'array' then
    raise exception 'Services must be an array.';
  end if;

  for v_item in select value from jsonb_array_elements(p_services)
  loop
    select s.id, s.name, s.pricing_method, s.unit_price
      into v_service
    from public.countertop_services s
    where s.id = (v_item->>'service_id')::uuid
      and s.is_active;

    v_qty := coalesce(nullif(v_item->>'quantity','')::numeric, 0);
    if not found or v_qty <= 0 then
      raise exception 'Service is unavailable or quantity is invalid.';
    end if;

    v_measure := case
      when v_service.pricing_method = 'sq_ft' then p_sqft
      when v_service.pricing_method = 'linear_ft' then p_edge_linear_ft
      else 1
    end;

    v_services := v_services + round(
      v_service.unit_price * case
        when v_service.pricing_method = 'flat' then 1
        else v_qty * v_measure
      end,
      4
    );
  end loop;

  return jsonb_build_object(
    'material_subtotal', v_material,
    'edge_subtotal', v_edge,
    'sink_subtotal', v_sink,
    'services_subtotal', v_services,
    'subtotal', round(v_material + v_edge + v_sink + v_services, 4),
    'stone', jsonb_build_object(
      'product_id', v_profile.id,
      'sku', v_profile.sku,
      'name', v_profile.name,
      'stone_type', v_profile.stone_type,
      'default_material_price_band_id', v_profile.default_material_price_band_id,
      'material_price_band_id', v_band.id,
      'material_price_band', v_band.code,
      'material_band_price_per_sqft', v_band.price_per_sqft,
      'price_per_sqft', case
        when p_manual_material_price is null then v_band.price_per_sqft
        else p_manual_material_price
      end,
      'sqft', p_sqft
    )
  );
end;
$$;

revoke all on function public.calculate_countertop_price(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) from public, anon;
grant execute on function public.calculate_countertop_price(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) to authenticated;

-- Backward-compatible legacy pricing signature: use the Stone profile default band.
create or replace function public.calculate_countertop_price(
  p_stone_product_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_manual_material_price numeric default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.calculate_countertop_price(
    $1,
    (
      select sp.material_price_band_id
      from public.countertop_stone_product_profiles sp
      join public.countertop_material_price_bands mb
        on mb.id = sp.material_price_band_id and mb.is_active
      where sp.product_id = $1 and sp.is_active
    ),
    $2,$3,$4,$5,$6,$7,$8
  );
$$;

revoke all on function public.calculate_countertop_price(uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) from public, anon;
grant execute on function public.calculate_countertop_price(uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric) to authenticated;

create or replace function private.attach_countertop_configuration(
  p_order_item_id uuid,
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
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
  v_order_subtotal numeric(18,4);
  v_order_discount numeric(18,4);
  v_tax_rate numeric(7,3);
  v_commission_rate numeric(7,3);
  v_taxable numeric(18,4);
  v_tax_amount numeric(18,4);
  v_total numeric(18,4);
  v_commission_amount numeric(18,4);
  v_grand_total numeric(18,4);
  v_actor uuid := auth.uid();
begin
  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to configure countertop order items.';
  end if;
  if p_slab_quantity <= 0 then
    raise exception 'Slab quantity must be greater than zero.';
  end if;
  if p_manual_material_price is not null
     and nullif(btrim(coalesce(p_override_reason,'')), '') is null then
    raise exception 'Override reason is required.';
  end if;

  select oi.order_id
    into v_order_id
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and o.status = 'draft';

  if v_order_id is null then
    raise exception 'Countertop configuration is only editable on draft orders.';
  end if;

  v_snapshot := public.calculate_countertop_price(
    p_stone_product_id,
    p_material_price_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_sink_product_id,
    p_services,
    p_manual_material_price
  );
  v_subtotal := (v_snapshot->>'subtotal')::numeric;

  update public.customer_order_items
  set product_id = p_stone_product_id,
      countertop_reservation_quantity = p_slab_quantity,
      sku_snapshot = v_snapshot->'stone'->>'sku',
      product_name_snapshot = v_snapshot->'stone'->>'name',
      quantity = 1,
      unit_price = v_subtotal,
      discount_amount = 0,
      line_subtotal = v_subtotal,
      line_total = v_subtotal,
      price_source = case when p_manual_material_price is null then 'price_group' else 'manual' end
  where id = p_order_item_id;

  insert into public.countertop_configurations(
    order_id,
    order_item_id,
    stone_product_id,
    material_price_band_id,
    sink_product_id,
    price_group_id,
    edge_profile_id,
    sqft,
    edge_linear_ft,
    slab_quantity,
    manual_price_per_sqft,
    override_reason,
    overridden_by,
    overridden_at,
    configuration,
    pricing_snapshot,
    subtotal
  ) values (
    v_order_id,
    p_order_item_id,
    p_stone_product_id,
    p_material_price_band_id,
    p_sink_product_id,
    p_price_group_id,
    p_edge_profile_id,
    p_sqft,
    p_edge_linear_ft,
    p_slab_quantity,
    p_manual_material_price,
    nullif(btrim(p_override_reason), ''),
    case when p_manual_material_price is null then null else v_actor end,
    case when p_manual_material_price is null then null else now() end,
    coalesce(p_configuration, '{}'::jsonb),
    v_snapshot,
    v_subtotal
  )
  on conflict (order_item_id) do update set
    stone_product_id = excluded.stone_product_id,
    material_price_band_id = excluded.material_price_band_id,
    sink_product_id = excluded.sink_product_id,
    price_group_id = excluded.price_group_id,
    edge_profile_id = excluded.edge_profile_id,
    sqft = excluded.sqft,
    edge_linear_ft = excluded.edge_linear_ft,
    slab_quantity = excluded.slab_quantity,
    manual_price_per_sqft = excluded.manual_price_per_sqft,
    override_reason = excluded.override_reason,
    overridden_by = excluded.overridden_by,
    overridden_at = excluded.overridden_at,
    configuration = excluded.configuration,
    pricing_snapshot = excluded.pricing_snapshot,
    subtotal = excluded.subtotal,
    updated_at = now();

  select o.discount_amount, o.tax_rate, o.payment_commission_percent
    into v_order_discount, v_tax_rate, v_commission_rate
  from public.customer_orders o
  where o.id = v_order_id
  for update;

  select coalesce(sum(i.line_total), 0)
    into v_order_subtotal
  from public.customer_order_items i
  where i.order_id = v_order_id;

  if coalesce(v_order_discount, 0) > v_order_subtotal then
    raise exception 'Order discount cannot exceed subtotal.';
  end if;

  v_taxable := greatest(v_order_subtotal - coalesce(v_order_discount, 0), 0);
  v_tax_amount := round(v_taxable * (coalesce(v_tax_rate, 0) / 100), 4);
  v_total := round(v_taxable + v_tax_amount, 4);
  v_commission_amount := round(v_total * (coalesce(v_commission_rate, 0) / 100), 4);
  v_grand_total := round(v_total + v_commission_amount, 4);

  update public.customer_orders
  set item_count = (select count(*) from public.customer_order_items where order_id = v_order_id),
      subtotal = round(v_order_subtotal, 4),
      tax_amount = v_tax_amount,
      total_amount = v_total,
      payment_commission_amount = v_commission_amount,
      grand_total = v_grand_total
  where id = v_order_id;

  return p_order_item_id;
end;
$$;

revoke all on function private.attach_countertop_configuration(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function private.attach_countertop_configuration(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

-- Backward-compatible legacy attach signature: use the Stone profile default band.
create or replace function private.attach_countertop_configuration(
  p_order_item_id uuid,
  p_stone_product_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_default_band_id uuid;
begin
  select sp.material_price_band_id
    into v_default_band_id
  from public.countertop_stone_product_profiles sp
  join public.countertop_material_price_bands mb
    on mb.id = sp.material_price_band_id and mb.is_active
  where sp.product_id = p_stone_product_id
    and sp.is_active;

  if v_default_band_id is null then
    raise exception 'Stone product is unavailable or has no active default material price band.';
  end if;

  return private.attach_countertop_configuration(
    p_order_item_id,
    p_stone_product_id,
    v_default_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_sink_product_id,
    p_services,
    p_configuration,
    p_manual_material_price,
    p_slab_quantity,
    p_override_reason
  );
end;
$$;

revoke all on function private.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function private.attach_countertop_configuration(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

create or replace function public.attach_countertop_configuration(
  p_order_item_id uuid,
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.attach_countertop_configuration($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13);
$$;

revoke all on function public.attach_countertop_configuration(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function public.attach_countertop_configuration(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

create or replace function private.create_and_attach_countertop_order_item(
  p_order_id uuid,
  p_request_id uuid,
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_item_id uuid := gen_random_uuid();
  v_existing_item_id uuid;
  v_existing_actor uuid;
  v_line_no integer;
  v_stone record;
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to add countertop order items.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Countertop initiation request id is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text || ':' || p_request_id::text, 0));

  select i.order_item_id, i.created_by
    into v_existing_item_id, v_existing_actor
  from private.countertop_order_item_initiations i
  where i.order_id = p_order_id
    and i.request_id = p_request_id;

  if v_existing_item_id is not null then
    if v_existing_actor is distinct from v_actor then
      raise exception 'Countertop initiation request belongs to another actor.' using errcode = '42501';
    end if;
    return v_existing_item_id;
  end if;

  select o.*
    into v_order
  from public.customer_orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'Countertop order items can only be added to draft orders.';
  end if;

  select p.sku, p.name
    into v_stone
  from public.products p
  join public.countertop_stone_product_profiles sp
    on sp.product_id = p.id and sp.is_active = true
  join public.product_types pt on pt.id = p.product_type_id
  where p.id = p_stone_product_id
    and p.status = 'active'
    and pt.pricing_model = 'countertop_material_band';

  if not found then
    raise exception 'Stone product is unavailable or is not a canonical Countertop Material Band product.';
  end if;

  if not exists (
    select 1
    from public.countertop_material_price_bands mb
    where mb.id = p_material_price_band_id
      and mb.is_active
  ) then
    raise exception 'Material price band is unavailable.';
  end if;

  select coalesce(max(oi.line_no), 0) + 1
    into v_line_no
  from public.customer_order_items oi
  where oi.order_id = p_order_id;

  insert into private.countertop_order_pricing_gate(backend_pid, transaction_id, order_item_id)
  values (pg_backend_pid(), txid_current(), v_item_id)
  on conflict do nothing;

  insert into public.customer_order_items(
    id,
    order_id,
    product_id,
    line_no,
    sku_snapshot,
    product_name_snapshot,
    quantity,
    unit_price,
    discount_percent,
    discount_amount,
    line_subtotal,
    line_total,
    price_source,
    countertop_reservation_quantity,
    created_by
  ) values (
    v_item_id,
    p_order_id,
    p_stone_product_id,
    v_line_no,
    v_stone.sku,
    v_stone.name,
    1,
    0,
    0,
    0,
    0,
    0,
    'price_group',
    p_slab_quantity,
    v_actor
  );

  perform private.attach_countertop_configuration(
    v_item_id,
    p_stone_product_id,
    p_material_price_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_sink_product_id,
    p_services,
    p_configuration,
    p_manual_material_price,
    p_slab_quantity,
    p_override_reason
  );

  delete from private.countertop_order_pricing_gate
  where backend_pid = pg_backend_pid()
    and transaction_id = txid_current()
    and order_item_id = v_item_id;

  insert into private.countertop_order_item_initiations(order_id, request_id, order_item_id, created_by)
  values (p_order_id, p_request_id, v_item_id, v_actor);

  insert into public.customer_activity(customer_id, activity_type, title, description, metadata)
  values (
    v_order.customer_id,
    'order_updated',
    'Countertop added',
    v_order.order_number || ' countertop line ' || v_line_no,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_item_id', v_item_id,
      'request_id', p_request_id,
      'material_price_band_id', p_material_price_band_id
    )
  );

  return v_item_id;
end;
$$;

revoke all on function private.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function private.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

-- Backward-compatible legacy initiation signature: use the Stone profile default band.
create or replace function private.create_and_attach_countertop_order_item(
  p_order_id uuid,
  p_request_id uuid,
  p_stone_product_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_default_band_id uuid;
begin
  select sp.material_price_band_id
    into v_default_band_id
  from public.countertop_stone_product_profiles sp
  join public.countertop_material_price_bands mb
    on mb.id = sp.material_price_band_id and mb.is_active
  where sp.product_id = p_stone_product_id
    and sp.is_active;

  if v_default_band_id is null then
    raise exception 'Stone product is unavailable or has no active default material price band.';
  end if;

  return private.create_and_attach_countertop_order_item(
    p_order_id,
    p_request_id,
    p_stone_product_id,
    v_default_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_sink_product_id,
    p_services,
    p_configuration,
    p_manual_material_price,
    p_slab_quantity,
    p_override_reason
  );
end;
$$;

revoke all on function private.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function private.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

create or replace function public.create_and_attach_countertop_order_item(
  p_order_id uuid,
  p_request_id uuid,
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_configuration jsonb default '{}'::jsonb,
  p_manual_material_price numeric default null,
  p_slab_quantity numeric default 1,
  p_override_reason text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_and_attach_countertop_order_item($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14);
$$;

revoke all on function public.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) from public, anon;
grant execute on function public.create_and_attach_countertop_order_item(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,jsonb,numeric,numeric,text) to authenticated;

notify pgrst, 'reload schema';
