-- Countertop Additional Services seed + customer-provided Sink snapshot semantics.
-- Backward compatible: no column/signature changes; existing configuration JSONB is extended.

insert into public.countertop_services (name, pricing_method, unit_price, is_active)
select 'Vessel Sink Cutout', 'each', 50.0000, true
where not exists (
  select 1
  from public.countertop_services
  where lower(name) = lower('Vessel Sink Cutout')
);

create or replace function private.enrich_countertop_snapshot()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_edge jsonb := null;
  v_sink jsonb := null;
  v_services jsonb := '[]'::jsonb;
  v_sink_price_source text;
  v_customer_sink_product_id uuid;
  v_customer_sink_product_name text;
  v_customer_sink_product_sku text;
  v_customer_sink_note text;
  v_customer_sink_display_name text;
begin
  if new.edge_profile_id is null and nullif(new.configuration->>'edge_profile_id','') is not null then
    new.edge_profile_id := (new.configuration->>'edge_profile_id')::uuid;
  end if;

  if new.edge_profile_id is not null then
    select jsonb_build_object(
      'edge_profile_id', ep.id,
      'name', ep.name,
      'pricing_method', ep.pricing_method,
      'unit_price', ep.unit_price,
      'linear_ft', new.edge_linear_ft,
      'applicable_measure', case when ep.pricing_method='sq_ft' then new.sqft else new.edge_linear_ft end,
      'subtotal', new.pricing_snapshot->'edge_subtotal'
    )
      into v_edge
    from public.countertop_edge_profiles ep
    where ep.id = new.edge_profile_id;
  end if;

  if new.configuration->>'sink_source' = 'customer_provided' then
    if new.sink_product_id is not null or new.manual_sink_price is not null then
      raise exception 'Customer-provided Sink cannot use Modulex Sink pricing.';
    end if;

    begin
      v_customer_sink_product_id := nullif(new.configuration->>'customer_provided_sink_product_id','')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Customer-provided Sink catalog reference is invalid.';
    end;
    v_customer_sink_note := nullif(btrim(coalesce(new.configuration->>'customer_provided_sink_note','')), '');

    if v_customer_sink_product_id is not null then
      select p.name, p.sku
        into v_customer_sink_product_name, v_customer_sink_product_sku
      from public.products p
      where p.id = v_customer_sink_product_id
        and lower(coalesce(p.metadata->>'product_kind','')) = 'sink';

      if not found then
        raise exception 'Customer-provided Sink catalog reference is unavailable.';
      end if;
    end if;

    if v_customer_sink_product_id is null and v_customer_sink_note is null then
      raise exception 'Customer-provided Sink requires a catalog match or product details.';
    end if;

    v_customer_sink_display_name := concat_ws(
      ' · ',
      'Customer Provides',
      v_customer_sink_product_name,
      v_customer_sink_note
    );
    v_sink_price_source := 'customer_provided';
    v_sink := jsonb_build_object(
      'product_id', null,
      'sku', v_customer_sink_product_sku,
      'name', 'Customer Provides' || substr(v_customer_sink_display_name, length('Customer Provides') + 1),
      'customer_provided', true,
      'customer_provided_product_id', v_customer_sink_product_id,
      'customer_provided_product_name', v_customer_sink_product_name,
      'customer_provided_product_sku', v_customer_sink_product_sku,
      'customer_provided_sink_note', v_customer_sink_note,
      'price_source', 'customer_provided',
      'unit_price', 0,
      'subtotal', 0
    );
  else
    v_sink_price_source := case
      when new.sink_product_id is null then null
      when new.manual_sink_price is not null then 'manual_fallback'
      else coalesce(new.pricing_snapshot->>'sink_price_source', 'price_group')
    end;

    if new.sink_product_id is not null then
      select jsonb_build_object(
        'product_id', p.id,
        'sku', p.sku,
        'name', p.name,
        'commercial_price_group_id', new.price_group_id,
        'price_source', v_sink_price_source,
        'manual_fallback_price', new.manual_sink_price,
        'unit_price', new.pricing_snapshot->'sink_subtotal',
        'subtotal', new.pricing_snapshot->'sink_subtotal'
      )
        into v_sink
      from public.products p
      where p.id = new.sink_product_id;
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'service_id', s.id,
        'name', s.name,
        'pricing_method', s.pricing_method,
        'unit_price', s.unit_price,
        'quantity', coalesce(nullif(x->>'quantity','')::numeric,0),
        'applicable_measure', case when s.pricing_method='sq_ft' then new.sqft when s.pricing_method='linear_ft' then new.edge_linear_ft else 1 end,
        'subtotal', round(
          s.unit_price * case
            when s.pricing_method='flat' then 1
            when s.pricing_method='each' then coalesce(nullif(x->>'quantity','')::numeric,0)
            when s.pricing_method='sq_ft' then new.sqft*coalesce(nullif(x->>'quantity','')::numeric,0)
            else new.edge_linear_ft*coalesce(nullif(x->>'quantity','')::numeric,0)
          end,
          4
        )
      ) order by s.name
    ),
    '[]'::jsonb
  )
    into v_services
  from jsonb_array_elements(coalesce(new.configuration->'service_selection','[]'::jsonb)) x
  join public.countertop_services s on s.id=(x->>'service_id')::uuid;

  new.pricing_snapshot := new.pricing_snapshot || jsonb_build_object(
    'manual_override', jsonb_build_object(
      'applied', new.manual_price_per_sqft is not null,
      'price_per_sqft', new.manual_price_per_sqft,
      'reason', new.override_reason,
      'actor_id', new.overridden_by,
      'overridden_at', new.overridden_at
    ),
    'sink_price_source', v_sink_price_source,
    'sink_manual_fallback', jsonb_build_object(
      'applied', new.manual_sink_price is not null,
      'amount', new.manual_sink_price
    ),
    'edge', v_edge,
    'sink', v_sink,
    'services', v_services,
    'totals', jsonb_build_object(
      'material_subtotal', new.pricing_snapshot->'material_subtotal',
      'edge_subtotal', new.pricing_snapshot->'edge_subtotal',
      'sink_subtotal', new.pricing_snapshot->'sink_subtotal',
      'services_subtotal', new.pricing_snapshot->'services_subtotal',
      'subtotal', new.pricing_snapshot->>'subtotal'
    )
  );

  return new;
end;
$$;
