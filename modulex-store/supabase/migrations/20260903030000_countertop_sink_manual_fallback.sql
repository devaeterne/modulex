-- Countertop Sink manual fallback pricing.
-- Additive/backward-compatible: existing calculate/attach/create RPC signatures remain intact.

alter table public.countertop_configurations
  add column if not exists manual_sink_price numeric(18,4);

comment on column public.countertop_configurations.manual_sink_price is
  'Positive USD Sink price persisted only when the selected Sink has no current active commercial price.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.countertop_configurations'::regclass
      and conname = 'countertop_configurations_manual_sink_price_positive'
  ) then
    alter table public.countertop_configurations
      add constraint countertop_configurations_manual_sink_price_positive
      check (manual_sink_price is null or manual_sink_price > 0);
  end if;
end;
$$;

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

  -- Reuse the existing authoritative material/edge/service calculator with Sink omitted.
  -- Sink is resolved below so active commercial pricing can always win over fallback input.
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
    order by pp.valid_from desc
    limit 1;

    if v_sink is null and p_manual_sink_price is not null then
      v_sink := p_manual_sink_price;
      v_sink_price_source := 'manual_fallback';
    elsif v_sink is null then
      raise exception 'Sink has no active price for this price group. Enter a manual Sink fallback price.';
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

revoke all on function public.calculate_countertop_price_with_sink_fallback(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric,numeric) from public;
revoke all on function public.calculate_countertop_price_with_sink_fallback(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric,numeric) from anon;
grant execute on function public.calculate_countertop_price_with_sink_fallback(uuid,uuid,uuid,numeric,uuid,numeric,uuid,jsonb,numeric,numeric) to authenticated;

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
set search_path to 'pg_catalog', 'public'
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
  v_requested_manual_sink_price numeric;
  v_manual_sink_price numeric(18,4);
  v_configuration jsonb;
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

  begin
    v_requested_manual_sink_price := nullif(btrim(coalesce(p_configuration->>'manual_sink_price','')), '')::numeric;
  exception
    when invalid_text_representation then
      raise exception 'Manual Sink fallback price must be a valid decimal number.';
  end;

  select oi.order_id
    into v_order_id
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and o.status = 'draft';

  if v_order_id is null then
    raise exception 'Countertop configuration is only editable on draft orders.';
  end if;

  v_snapshot := public.calculate_countertop_price_with_sink_fallback(
    p_stone_product_id,
    p_material_price_band_id,
    p_price_group_id,
    p_sqft,
    p_edge_profile_id,
    p_edge_linear_ft,
    p_sink_product_id,
    p_services,
    p_manual_material_price,
    v_requested_manual_sink_price
  );
  v_subtotal := (v_snapshot->>'subtotal')::numeric;
  v_manual_sink_price := case
    when v_snapshot->>'sink_price_source' = 'manual_fallback' then v_requested_manual_sink_price
    else null
  end;
  v_configuration := coalesce(p_configuration, '{}'::jsonb) - 'manual_sink_price';
  if v_manual_sink_price is not null then
    v_configuration := v_configuration || jsonb_build_object('manual_sink_price', v_manual_sink_price);
  end if;

  insert into private.countertop_order_pricing_gate(
    backend_pid,
    transaction_id,
    order_item_id
  ) values (
    pg_backend_pid(),
    txid_current(),
    p_order_item_id
  )
  on conflict do nothing;

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
      price_source = case
        when p_manual_material_price is null and v_manual_sink_price is null then 'price_group'
        else 'manual'
      end
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
    manual_sink_price,
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
    v_manual_sink_price,
    nullif(btrim(p_override_reason), ''),
    case when p_manual_material_price is null then null else v_actor end,
    case when p_manual_material_price is null then null else now() end,
    v_configuration,
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
    manual_sink_price = case
      when excluded.pricing_snapshot->>'sink_price_source' = 'manual_fallback' then excluded.manual_sink_price
      else null
    end,
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

  delete from private.countertop_order_pricing_gate
  where backend_pid = pg_backend_pid()
    and transaction_id = txid_current()
    and order_item_id = p_order_item_id;

  return p_order_item_id;
end;
$$;

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

drop trigger if exists trg_countertop_snapshot_enrich on public.countertop_configurations;
create trigger trg_countertop_snapshot_enrich
before insert or update of edge_profile_id, sink_product_id, price_group_id, sqft, edge_linear_ft, slab_quantity, manual_price_per_sqft, manual_sink_price, override_reason, overridden_by, overridden_at, configuration
on public.countertop_configurations
for each row
execute function private.enrich_countertop_snapshot();
