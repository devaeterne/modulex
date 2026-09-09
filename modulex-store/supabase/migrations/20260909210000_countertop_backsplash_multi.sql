-- Countertop multi-backsplash support.
-- Additive to the existing multi-fixture/manual-pricing package: legacy RPCs remain intact.

create table if not exists public.countertop_configuration_backsplashes (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.countertop_configurations(id) on delete cascade,
  height_mode text not null check (height_mode in ('1','2','3','4','5','6','7','8','9','10','full_height')),
  linear_ft numeric(12,4) not null check (linear_ft > 0),
  height_inches numeric(12,4) not null check (height_inches > 0),
  sqft numeric(18,4) not null check (sqft > 0),
  top_edge boolean not null default false,
  edge_profile_id uuid references public.countertop_edge_profiles(id) on delete restrict,
  edge_linear_ft numeric(12,4) not null default 0 check (edge_linear_ft >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countertop_configuration_backsplashes_edge_check check (
    (top_edge and edge_profile_id is not null and edge_linear_ft > 0)
    or
    (not top_edge and edge_profile_id is null and edge_linear_ft = 0)
  )
);

create index if not exists countertop_configuration_backsplashes_configuration_idx
  on public.countertop_configuration_backsplashes(configuration_id, sort_order, id);
create index if not exists countertop_configuration_backsplashes_edge_profile_idx
  on public.countertop_configuration_backsplashes(edge_profile_id) where edge_profile_id is not null;

alter table public.countertop_configuration_backsplashes enable row level security;
revoke all on table public.countertop_configuration_backsplashes from public, anon;
grant select on table public.countertop_configuration_backsplashes to authenticated;
drop policy if exists countertop_configuration_backsplashes_admin_read on public.countertop_configuration_backsplashes;
create policy countertop_configuration_backsplashes_admin_read
on public.countertop_configuration_backsplashes
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance']));

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
  v_edge record;
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
    v_edge_linear_ft := 0;
    v_edge_subtotal := 0;
    v_edge := null;

    if v_top_edge then
      begin
        v_edge_profile_id := nullif(v_item->>'edge_profile_id','')::uuid;
      exception when others then
        raise exception 'Backsplash edge profile is invalid.';
      end;
      if v_edge_profile_id is null then
        raise exception 'Polished top edge requires an Edge Profile.';
      end if;

      select ep.id,ep.name,ep.pricing_method,ep.unit_price
        into v_edge
      from public.countertop_edge_profiles ep
      where ep.id = v_edge_profile_id and ep.is_active;
      if not found then
        raise exception 'Backsplash Edge Profile is unavailable.';
      end if;

      v_edge_linear_ft := v_linear_ft;
      v_edge_subtotal := round(v_edge.unit_price * case
        when v_edge.pricing_method='linear_ft' then v_edge_linear_ft
        when v_edge.pricing_method='sq_ft' then v_backsplash_sqft
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
      'edge_name',case when v_top_edge then v_edge.name else null end,
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

create or replace function private.attach_countertop_configuration_multi_v2(
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
  p_override_reason text default null,
  p_backsplashes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_configuration_id uuid;
  v_order_id uuid;
  v_existing_snapshot jsonb;
  v_preview jsonb;
  v_snapshot jsonb;
  v_backsplash_lines jsonb;
  v_item jsonb;
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
begin
  perform private.attach_countertop_configuration_multi(
    p_order_item_id,p_stone_product_id,p_material_price_band_id,p_price_group_id,p_sqft,
    p_edge_profile_id,p_edge_linear_ft,p_services,p_configuration,p_manual_material_price,
    p_material_cost,p_fixtures,p_slab_quantity,p_override_reason
  );

  v_preview := public.calculate_countertop_price_multi_v2(
    p_stone_product_id,p_material_price_band_id,p_price_group_id,p_sqft,p_edge_profile_id,
    p_edge_linear_ft,p_services,p_manual_material_price,p_material_cost,p_fixtures,p_backsplashes
  );
  v_backsplash_lines := coalesce(v_preview->'backsplashes','[]'::jsonb);
  v_subtotal := (v_preview->>'subtotal')::numeric;

  select c.id,c.order_id,c.pricing_snapshot
    into v_configuration_id,v_order_id,v_existing_snapshot
  from public.countertop_configurations c
  where c.order_item_id=p_order_item_id
  for update;
  if v_configuration_id is null then
    raise exception 'Countertop configuration was not created.';
  end if;

  v_snapshot := coalesce(v_existing_snapshot,'{}'::jsonb) || jsonb_build_object(
    'backsplashes',v_backsplash_lines,
    'backsplash_subtotal',coalesce(v_preview->'backsplash_subtotal','0'::jsonb),
    'subtotal',v_preview->'subtotal',
    'totals',coalesce(v_existing_snapshot->'totals','{}'::jsonb) || jsonb_build_object(
      'backsplash_subtotal',coalesce(v_preview->'backsplash_subtotal','0'::jsonb),
      'subtotal',v_preview->>'subtotal'
    )
  );

  update public.countertop_configurations
  set pricing_snapshot=v_snapshot,subtotal=v_subtotal,updated_at=now()
  where id=v_configuration_id;

  delete from public.countertop_configuration_backsplashes where configuration_id=v_configuration_id;
  for v_item in select value from jsonb_array_elements(v_backsplash_lines) loop
    insert into public.countertop_configuration_backsplashes(
      configuration_id,height_mode,linear_ft,height_inches,sqft,top_edge,edge_profile_id,edge_linear_ft,sort_order
    ) values(
      v_configuration_id,
      v_item->>'height_mode',
      (v_item->>'linear_ft')::numeric,
      (v_item->>'height_inches')::numeric,
      (v_item->>'sqft')::numeric,
      coalesce((v_item->>'top_edge')::boolean,false),
      nullif(v_item->>'edge_profile_id','')::uuid,
      coalesce(nullif(v_item->>'edge_linear_ft','')::numeric,0),
      coalesce(nullif(v_item->>'sort_order','')::integer,0)
    );
  end loop;

  insert into private.countertop_order_pricing_gate(backend_pid,transaction_id,order_item_id)
  values(pg_backend_pid(),txid_current(),p_order_item_id)
  on conflict do nothing;
  update public.customer_order_items
  set unit_price=v_subtotal,line_subtotal=v_subtotal,line_total=v_subtotal
  where id=p_order_item_id;
  delete from private.countertop_order_pricing_gate
  where backend_pid=pg_backend_pid() and transaction_id=txid_current() and order_item_id=p_order_item_id;

  select o.discount_amount,o.tax_rate,o.payment_commission_percent
    into v_order_discount,v_tax_rate,v_commission_rate
  from public.customer_orders o where o.id=v_order_id for update;
  select coalesce(sum(i.line_total),0) into v_order_subtotal
  from public.customer_order_items i where i.order_id=v_order_id;
  if coalesce(v_order_discount,0)>v_order_subtotal then raise exception 'Order discount cannot exceed subtotal.'; end if;
  v_taxable:=greatest(v_order_subtotal-coalesce(v_order_discount,0),0);
  v_tax_amount:=round(v_taxable*(coalesce(v_tax_rate,0)/100),4);
  v_total:=round(v_taxable+v_tax_amount,4);
  v_commission_amount:=round(v_total*(coalesce(v_commission_rate,0)/100),4);
  v_grand_total:=round(v_total+v_commission_amount,4);
  update public.customer_orders set
    item_count=(select count(*) from public.customer_order_items where order_id=v_order_id),
    subtotal=round(v_order_subtotal,4),tax_amount=v_tax_amount,total_amount=v_total,
    payment_commission_amount=v_commission_amount,grand_total=v_grand_total
  where id=v_order_id;

  return p_order_item_id;
end;
$$;

create or replace function public.attach_countertop_configuration_multi_v2(
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
  p_override_reason text default null,
  p_backsplashes jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.attach_countertop_configuration_multi_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);
$$;

revoke all on function private.attach_countertop_configuration_multi_v2(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) from public,anon,service_role;
revoke all on function public.attach_countertop_configuration_multi_v2(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) from public,anon,service_role;
grant execute on function private.attach_countertop_configuration_multi_v2(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) to authenticated;
grant execute on function public.attach_countertop_configuration_multi_v2(uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) to authenticated;

create or replace function private.create_and_attach_countertop_order_item_multi_v2(
  p_order_id uuid,
  p_request_id uuid,
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
  p_override_reason text default null,
  p_backsplashes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_item_id uuid;
begin
  v_item_id := private.create_and_attach_countertop_order_item_multi(
    p_order_id,p_request_id,p_stone_product_id,p_material_price_band_id,p_price_group_id,p_sqft,
    p_edge_profile_id,p_edge_linear_ft,p_services,p_configuration,p_manual_material_price,p_material_cost,
    p_fixtures,p_slab_quantity,p_override_reason
  );
  perform private.attach_countertop_configuration_multi_v2(
    v_item_id,p_stone_product_id,p_material_price_band_id,p_price_group_id,p_sqft,p_edge_profile_id,
    p_edge_linear_ft,p_services,p_configuration,p_manual_material_price,p_material_cost,p_fixtures,
    p_slab_quantity,p_override_reason,p_backsplashes
  );
  return v_item_id;
end;
$$;

create or replace function public.create_and_attach_countertop_order_item_multi_v2(
  p_order_id uuid,
  p_request_id uuid,
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
  p_override_reason text default null,
  p_backsplashes jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.create_and_attach_countertop_order_item_multi_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16);
$$;

revoke all on function private.create_and_attach_countertop_order_item_multi_v2(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) from public,anon,service_role;
revoke all on function public.create_and_attach_countertop_order_item_multi_v2(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) from public,anon,service_role;
grant execute on function private.create_and_attach_countertop_order_item_multi_v2(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) to authenticated;
grant execute on function public.create_and_attach_countertop_order_item_multi_v2(uuid,uuid,uuid,uuid,uuid,numeric,uuid,numeric,jsonb,jsonb,numeric,numeric,jsonb,numeric,text,jsonb) to authenticated;

-- Preserve the new backsplash total if a later configuration update invokes the
-- legacy-compatible snapshot enrichment trigger.
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
    if not found then raise exception 'Service is unavailable while restoring Countertop snapshot.'; end if;
    begin v_qty := coalesce(nullif(v_item->>'quantity','')::numeric,0);
    exception when others then raise exception 'Service quantity is invalid while restoring Countertop snapshot.'; end;
    if v_qty <= 0 then raise exception 'Service quantity must be greater than zero while restoring Countertop snapshot.'; end if;
    if v_service.price_entry_mode='manual' then
      begin v_unit := nullif(v_item->>'manual_unit_price','')::numeric;
      exception when others then raise exception 'Manual service price is invalid while restoring Countertop snapshot.'; end;
      if v_unit is null or v_unit <= 0 then raise exception 'Manual Per Order service requires a price greater than zero.'; end if;
    else
      v_unit := v_service.unit_price;
    end if;
    v_measure := case when v_service.pricing_method='sq_ft' then new.sqft when v_service.pricing_method='linear_ft' then new.edge_linear_ft else 1 end;
    v_line := round(v_unit * case when v_service.pricing_method='flat' then 1 else v_qty*v_measure end,4);
    v_services := v_services || jsonb_build_array(jsonb_build_object(
      'service_id',v_service.id,'name',v_service.name,'pricing_method',v_service.pricing_method,
      'price_entry_mode',v_service.price_entry_mode,'quantity',v_qty,'unit_price',v_unit,
      'manual_unit_price',case when v_service.price_entry_mode='manual' then v_unit else null end,
      'price_source',case when v_service.price_entry_mode='manual' then 'manual_per_order' else 'fixed' end,
      'subtotal',v_line
    ));
  end loop;

  select x.value into v_sink
  from jsonb_array_elements(coalesce(new.pricing_snapshot->'fixtures','[]'::jsonb)) with ordinality as x(value,ord)
  where x.value->>'fixture_type'='sink' order by x.ord limit 1;
  select x.value into v_faucet
  from jsonb_array_elements(coalesce(new.pricing_snapshot->'fixtures','[]'::jsonb)) with ordinality as x(value,ord)
  where x.value->>'fixture_type'='faucet' order by x.ord limit 1;

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
      'backsplash_subtotal',coalesce(new.pricing_snapshot->'backsplash_subtotal','0'::jsonb),
      'subtotal',new.pricing_snapshot->>'subtotal'
    )
  )
  where c.id = new.id;
  return new;
end;
$$;

revoke all on function private.restore_countertop_multi_snapshot() from public, anon, authenticated, service_role;

comment on table public.countertop_configuration_backsplashes is 'Normalized Countertop backsplash rows. Preset heights are 1-10 inches; Full Height stores the entered wall height.';
comment on function public.calculate_countertop_price_multi_v2(uuid,uuid,uuid,numeric,uuid,numeric,jsonb,numeric,numeric,jsonb,jsonb) is 'Countertop multi-fixture pricing plus zero-to-many backsplashes using the same authoritative Stone material rate.';
