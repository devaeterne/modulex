-- Preserve the authoritative multi-fixture/manual-service snapshot after the
-- existing legacy Countertop enrichment trigger runs. The legacy trigger is
-- intentionally left intact for old single-fixture RPCs; this additive AFTER
-- trigger restores the new arrays and projects the first fixture back into the
-- legacy singular Sink/Faucet keys.

create or replace function private.restore_countertop_multi_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_service record;
  v_services jsonb := '[]'::jsonb;
  v_qty numeric;
  v_measure numeric;
  v_unit numeric;
  v_line numeric;
  v_sink jsonb := null;
  v_faucet jsonb := null;
begin
  if new.pricing_snapshot is null or not (new.pricing_snapshot ? 'fixtures') then
    return new;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(new.configuration->'service_selection','[]'::jsonb))
  loop
    select s.id,s.name,s.pricing_method,s.unit_price,s.price_entry_mode
      into v_service
    from public.countertop_services s
    where s.id = nullif(v_item->>'service_id','')::uuid
      and s.is_active;

    if not found then
      raise exception 'Service is unavailable while restoring Countertop snapshot.';
    end if;

    begin
      v_qty := coalesce(nullif(v_item->>'quantity','')::numeric,0);
    exception when others then
      raise exception 'Service quantity is invalid while restoring Countertop snapshot.';
    end;
    if v_qty <= 0 then
      raise exception 'Service quantity must be greater than zero while restoring Countertop snapshot.';
    end if;

    if v_service.price_entry_mode = 'manual' then
      begin
        v_unit := nullif(v_item->>'manual_unit_price','')::numeric;
      exception when others then
        raise exception 'Manual service price is invalid while restoring Countertop snapshot.';
      end;
      if v_unit is null or v_unit <= 0 then
        raise exception 'Manual Per Order service requires a price greater than zero.';
      end if;
    else
      v_unit := v_service.unit_price;
    end if;

    v_measure := case
      when v_service.pricing_method='sq_ft' then new.sqft
      when v_service.pricing_method='linear_ft' then new.edge_linear_ft
      else 1
    end;
    v_line := round(v_unit * case
      when v_service.pricing_method='flat' then 1
      else v_qty*v_measure
    end,4);

    v_services := v_services || jsonb_build_array(jsonb_build_object(
      'service_id',v_service.id,
      'name',v_service.name,
      'pricing_method',v_service.pricing_method,
      'price_entry_mode',v_service.price_entry_mode,
      'quantity',v_qty,
      'unit_price',v_unit,
      'manual_unit_price',case when v_service.price_entry_mode='manual' then v_unit else null end,
      'price_source',case when v_service.price_entry_mode='manual' then 'manual_per_order' else 'fixed' end,
      'subtotal',v_line
    ));
  end loop;

  select x.value into v_sink
  from jsonb_array_elements(coalesce(new.pricing_snapshot->'fixtures','[]'::jsonb)) with ordinality as x(value,ord)
  where x.value->>'fixture_type'='sink'
  order by x.ord
  limit 1;

  select x.value into v_faucet
  from jsonb_array_elements(coalesce(new.pricing_snapshot->'fixtures','[]'::jsonb)) with ordinality as x(value,ord)
  where x.value->>'fixture_type'='faucet'
  order by x.ord
  limit 1;

  update public.countertop_configurations c
  set pricing_snapshot = new.pricing_snapshot || jsonb_build_object(
    'services',v_services,
    'sink',v_sink,
    'faucet',v_faucet,
    'sink_price_source',v_sink->>'price_source',
    'faucet_price_source',v_faucet->>'price_source',
    'sink_manual_fallback',jsonb_build_object(
      'applied',coalesce(v_sink->>'price_source','')='manual_fallback',
      'amount',case when coalesce(v_sink->>'price_source','')='manual_fallback' then v_sink->'manual_unit_price' else null end
    ),
    'totals',jsonb_build_object(
      'material_subtotal',new.pricing_snapshot->'material_subtotal',
      'material_cost',coalesce(new.pricing_snapshot->'material_cost','0'::jsonb),
      'edge_subtotal',new.pricing_snapshot->'edge_subtotal',
      'sink_subtotal',new.pricing_snapshot->'sink_subtotal',
      'faucet_subtotal',new.pricing_snapshot->'faucet_subtotal',
      'services_subtotal',new.pricing_snapshot->'services_subtotal',
      'subtotal',new.pricing_snapshot->>'subtotal'
    )
  )
  where c.id = new.id;

  return new;
end;
$$;

revoke all on function private.restore_countertop_multi_snapshot() from public, anon, authenticated, service_role;

drop trigger if exists trg_countertop_multi_snapshot_restore on public.countertop_configurations;
create trigger trg_countertop_multi_snapshot_restore
after insert or update of configuration on public.countertop_configurations
for each row execute function private.restore_countertop_multi_snapshot();

-- Keep the duplicate-name behavior of the legacy reference RPC while adding
-- Fixed Price / Manual Per Order semantics.
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
  if exists(
    select 1 from public.countertop_services s
    where lower(s.name)=lower(v_name)
      and (p_id is null or s.id<>p_id)
  ) then
    raise exception 'Service already exists.';
  end if;
  if v_method not in ('each','sq_ft','linear_ft','flat') then raise exception 'Invalid pricing method.'; end if;
  if v_mode not in ('fixed','manual') then raise exception 'Invalid price entry mode.'; end if;
  if v_mode='fixed' and (v_price is null or v_price<0) then raise exception 'Fixed Price service requires a non-negative unit price.'; end if;
  if v_mode='manual' then v_price:=0; end if;

  insert into public.countertop_services(id,name,pricing_method,unit_price,is_active,price_entry_mode)
  values(v_id,v_name,v_method,v_price,coalesce(p_is_active,true),v_mode)
  on conflict(id) do update set
    name=excluded.name,
    pricing_method=excluded.pricing_method,
    unit_price=excluded.unit_price,
    is_active=excluded.is_active,
    price_entry_mode=excluded.price_entry_mode,
    updated_at=now();
  return v_id;
end;
$$;

revoke all on function private.upsert_countertop_service_reference(uuid,text,text,numeric,text,boolean) from public, anon, service_role;
grant execute on function private.upsert_countertop_service_reference(uuid,text,text,numeric,text,boolean) to authenticated;

comment on function private.restore_countertop_multi_snapshot() is 'Restores normalized multi-fixture/manual-service snapshot arrays after legacy Countertop snapshot enrichment and maintains first-fixture legacy projections.';
