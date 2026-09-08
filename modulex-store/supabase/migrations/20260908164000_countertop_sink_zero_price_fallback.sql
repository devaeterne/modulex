-- Countertop Sink zero-price fallback hardening.
-- Only a positive active commercial Sink price is authoritative. A zero-valued
-- active price is unpriced for sell pricing and may use the explicit manual fallback.

create or replace function public.calculate_countertop_price_with_sink_fallback(
  p_stone_product_id uuid,
  p_material_price_band_id uuid,
  p_price_group_id uuid,
  p_sqft numeric,
  p_edge_profile_id uuid default null,
  p_edge_linear_ft numeric default 0,
  p_sink_product_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_manual_material_price numeric default null,
  p_manual_sink_price numeric default null
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_snapshot jsonb;
  v_sink numeric(18,4) := 0;
  v_sink_price_source text := null;
begin
  if p_manual_sink_price is not null and p_manual_sink_price <= 0 then
    raise exception 'Manual Sink fallback price must be greater than zero.';
  end if;
  if p_manual_sink_price is not null and scale(p_manual_sink_price) > 4 then
    raise exception 'Manual Sink fallback price supports at most 4 decimal places.';
  end if;
  if p_manual_sink_price is not null and p_manual_sink_price >= 100000000000000 then
    raise exception 'Manual Sink fallback price exceeds the allowed numeric(18,4) range.';
  end if;
  if p_sink_product_id is null and p_manual_sink_price is not null then
    raise exception 'Select a Sink before entering a manual Sink fallback price.';
  end if;

  v_snapshot := public.calculate_countertop_price(
    p_stone_product_id,
    p_material_price_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    null,
    p_services,
    p_manual_material_price
  );

  if p_sink_product_id is not null then
    perform 1
    from public.products p
    where p.id = p_sink_product_id
      and p.status = 'active'
      and lower(coalesce(p.metadata->>'product_kind','')) = 'sink';

    if not found then
      raise exception 'Sink is unavailable.';
    end if;

    select pp.amount
      into v_sink
    from public.product_prices pp
    where pp.product_id = p_sink_product_id
      and pp.price_group_id = p_price_group_id
      and pp.currency_code = 'USD'
      and pp.is_active
      and pp.valid_to is null
      and pp.amount > 0
    order by pp.valid_from desc
    limit 1;

    if v_sink is null and p_manual_sink_price is not null then
      v_sink := p_manual_sink_price;
      v_sink_price_source := 'manual_fallback';
    elsif v_sink is null then
      raise exception 'Sink has no positive active price for this price group. Enter a manual Sink fallback price.';
    else
      v_sink_price_source := 'price_group';
    end if;
  end if;

  return v_snapshot || jsonb_build_object(
    'sink_subtotal', v_sink,
    'sink_price_source', v_sink_price_source,
    'subtotal', round((v_snapshot->>'subtotal')::numeric + v_sink, 4)
  );
end;
$$;

revoke all on function public.calculate_countertop_price_with_sink_fallback(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, numeric, numeric) from public, anon;
grant execute on function public.calculate_countertop_price_with_sink_fallback(uuid, uuid, uuid, numeric, uuid, numeric, uuid, jsonb, numeric, numeric) to authenticated;
