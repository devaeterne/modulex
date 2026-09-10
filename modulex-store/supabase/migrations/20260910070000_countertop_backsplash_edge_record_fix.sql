-- Fix optional backsplash edge pricing after the initial multi-backsplash rollout.
-- The original function used an untyped PL/pgSQL record for edge metadata. When
-- top_edge=false, referencing record fields while building the response raises
-- `record "v_edge" is not assigned yet`. Keep the public contract unchanged and
-- store optional edge metadata in typed scalar variables instead.

create or replace function public.calculate_countertop_price_multi_v2(
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_services jsonb default '[]'::jsonb,
  p_manual_material_price numeric default null,
  p_material_cost numeric default null,
  p_fixtures jsonb default '[]'::jsonb,
  p_backsplashes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_material_rate numeric(18,4);
  v_mode text;
  v_linear_ft numeric(12,4);
  v_height numeric(12,4);
  v_backsplash_sqft numeric(18,4);
  v_material_subtotal numeric(18,4);
  v_top_edge boolean;
  v_edge_profile_id uuid;
  v_edge_name text;
  v_edge_pricing_method text;
  v_edge_unit_price numeric(18,4);
  v_edge_linear_ft numeric(12,4);
  v_edge_subtotal numeric(18,4);
  v_line_subtotal numeric(18,4);
  v_backsplash_total numeric(18,4) := 0;
  v_sort_order integer;
begin
  if jsonb_typeof(coalesce(p_backsplashes,'[]'::jsonb)) <> 'array' then
    raise exception 'Backsplashes must be an array.';
  end if;

  v_base := public.calculate_countertop_price_multi(
    p_stone_product_id,
    p_material_price_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_services,
    p_manual_material_price,
    p_material_cost,
    p_fixtures
  );
  v_material_rate := nullif(v_base->'stone'->>'price_per_sqft','')::numeric;
  if v_material_rate is null or v_material_rate < 0 then
    raise exception 'Backsplash material rate is unavailable.';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_backsplashes,'[]'::jsonb)) loop
    v_mode := lower(coalesce(nullif(btrim(v_item->>'height_mode'),''),''));
    if v_mode not in ('1','2','3','4','5','6','7','8','9','10','full_height') then
      raise exception 'Backsplash height must be 1 through 10 inches or Full Height.';
    end if;

    begin
      v_linear_ft := nullif(v_item->>'linear_ft','')::numeric;
    exception when others then
      raise exception 'Backsplash linear feet is invalid.';
    end;
    if v_linear_ft is null or v_linear_ft <= 0 then
      raise exception 'Backsplash linear feet must be greater than zero.';
    end if;

    if v_mode = 'full_height' then
      begin
        v_height := nullif(v_item->>'height_inches','')::numeric;
      exception when others then
        raise exception 'Full Height backsplash height is invalid.';
      end;
      if v_height is null or v_height <= 0 then
        raise exception 'Full Height backsplash requires a height greater than zero.';
      end if;
    else
      v_height := v_mode::numeric;
    end if;

    v_backsplash_sqft := round(v_linear_ft * v_height / 12, 4);
    v_material_subtotal := round(v_material_rate * v_backsplash_sqft, 4);

    begin
      v_top_edge := coalesce(nullif(v_item->>'top_edge','')::boolean, false);
    exception when others then
      raise exception 'Backsplash top-edge selection is invalid.';
    end;
    v_edge_profile_id := null;
    v_edge_name := null;
    v_edge_pricing_method := null;
    v_edge_unit_price := 0;
    v_edge_linear_ft := 0;
    v_edge_subtotal := 0;

    if v_top_edge then
      begin
        v_edge_profile_id := nullif(v_item->>'edge_profile_id','')::uuid;
      exception when others then
        raise exception 'Backsplash edge profile is invalid.';
      end;
      if v_edge_profile_id is null then
        raise exception 'Polished top edge requires an Edge Profile.';
      end if;

      select ep.name,ep.pricing_method,ep.unit_price
        into v_edge_name,v_edge_pricing_method,v_edge_unit_price
      from public.countertop_edge_profiles ep
      where ep.id = v_edge_profile_id and ep.is_active;
      if not found then
        raise exception 'Backsplash Edge Profile is unavailable.';
      end if;

      v_edge_linear_ft := v_linear_ft;
      v_edge_subtotal := round(v_edge_unit_price * case
        when v_edge_pricing_method='linear_ft' then v_edge_linear_ft
        when v_edge_pricing_method='sq_ft' then v_backsplash_sqft
        else 1
      end, 4);
    end if;

    begin
      v_sort_order := greatest(coalesce(nullif(v_item->>'sort_order','')::integer,0),0);
    exception when others then
      raise exception 'Backsplash sort order is invalid.';
    end;

    v_line_subtotal := round(v_material_subtotal + v_edge_subtotal, 4);
    v_backsplash_total := v_backsplash_total + v_line_subtotal;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'height_mode',v_mode,
      'height_label',case when v_mode='full_height' then 'Full Height' else v_mode || '"' end,
      'linear_ft',v_linear_ft,
      'height_inches',v_height,
      'sqft',v_backsplash_sqft,
      'material_rate',v_material_rate,
      'material_subtotal',v_material_subtotal,
      'top_edge',v_top_edge,
      'edge_profile_id',v_edge_profile_id,
      'edge_name',case when v_top_edge then v_edge_name else null end,
      'edge_linear_ft',v_edge_linear_ft,
      'edge_subtotal',v_edge_subtotal,
      'subtotal',v_line_subtotal,
      'sort_order',v_sort_order
    ));
  end loop;

  return v_base || jsonb_build_object(
    'backsplashes',v_lines,
    'backsplash_subtotal',round(v_backsplash_total,4),
    'subtotal',round(coalesce((v_base->>'subtotal')::numeric,0) + v_backsplash_total,4)
  );
end;
$$;

revoke all on function public.calculate_countertop_price_multi_v2(uuid,uuid,uuid,numeric,uuid,numeric,jsonb,numeric,numeric,jsonb,jsonb) from public, anon;
grant execute on function public.calculate_countertop_price_multi_v2(uuid,uuid,uuid,numeric,uuid,numeric,jsonb,numeric,numeric,jsonb,jsonb) to authenticated;

comment on function public.calculate_countertop_price_multi_v2(uuid,uuid,uuid,numeric,uuid,numeric,jsonb,numeric,numeric,jsonb,jsonb)
is 'Countertop multi-fixture pricing plus zero-to-many backsplashes using typed optional edge metadata so no-edge rows remain valid.';
