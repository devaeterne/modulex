-- Preserve legacy Faucet pricing semantics in the multi-fixture calculator.
-- Sink pricing requires a positive commercial price (or its existing explicit
-- manual fallback). Faucet pricing only requires an active price row; a zero
-- active Faucet price remains a valid authoritative price, matching the
-- pre-multi-fixture calculate_countertop_price_with_faucet contract.

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
      and pp.currency_code='USD' and pp.is_active and pp.valid_to is null
      and (v_type <> 'sink' or pp.amount > 0)
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
