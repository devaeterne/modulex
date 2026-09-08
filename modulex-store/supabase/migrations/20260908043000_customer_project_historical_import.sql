-- PB-9 Historical Excel Import
-- Legacy workbook values are evidence to reconcile against canonical Project / Order / Finance truth.
-- They are never a second financial ledger and never overwrite canonical profitability.

create table public.customer_project_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null check (length(btrim(source_name)) > 0),
  source_sha256 text not null check (length(source_sha256) = 64 and source_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'staged' check (status in ('staged','review','ready','committed','failed')),
  row_count integer not null default 0 check (row_count >= 0),
  dry_run_fingerprint text check (dry_run_fingerprint is null or (length(dry_run_fingerprint) = 64 and dry_run_fingerprint ~ '^[0-9a-f]{64}$')),
  dry_run_at timestamptz,
  committed_at timestamptz,
  committed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_sha256)
);

create table public.customer_project_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.customer_project_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  row_sha256 text not null check (length(row_sha256) = 64 and row_sha256 ~ '^[0-9a-f]{64}$'),
  source_customer_name text,
  source_project_name text,
  source_project_address text,
  source_start_date date,
  source_end_date date,
  source_sales_rep_name text,
  legacy_initial_contract_price numeric(18,2),
  legacy_price_after_change_orders numeric(18,2),
  legacy_profit_margin numeric(18,4),
  legacy_profit_margin_unit text check (legacy_profit_margin_unit is null or legacy_profit_margin_unit in ('number','percent')),
  raw_payload jsonb not null default '{}'::jsonb,
  customer_id uuid references public.customers(id) on update cascade on delete restrict,
  sales_rep_id uuid references public.profiles(id) on delete set null,
  target_status text check (target_status is null or target_status in ('draft','quoted','approved','ordered','in_progress','completed','cancelled')),
  customer_match_count integer not null default 0 check (customer_match_count >= 0),
  sales_rep_match_count integer not null default 0 check (sales_rep_match_count >= 0),
  mapping_status text not null default 'unresolved' check (mapping_status in ('unresolved','invalid','ready','committed')),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  mapping_note text,
  canonical_project_id uuid references public.customer_projects(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, row_number),
  unique (batch_id, row_sha256)
);

-- legacy_profit_margin remains reconciliation evidence in public.customer_project_import_rows;
-- legacy_initial_contract_price and legacy_price_after_change_orders are treated the same way.

create index customer_project_import_rows_batch_status_idx
  on public.customer_project_import_rows(batch_id, mapping_status, row_number);
create index customer_project_import_rows_customer_idx
  on public.customer_project_import_rows(customer_id) where customer_id is not null;
create index customer_project_import_rows_sales_rep_idx
  on public.customer_project_import_rows(sales_rep_id) where sales_rep_id is not null;
create index customer_project_import_rows_project_idx
  on public.customer_project_import_rows(canonical_project_id) where canonical_project_id is not null;

alter table public.customer_project_import_batches enable row level security;
alter table public.customer_project_import_rows enable row level security;

revoke all on table public.customer_project_import_batches from public, anon, authenticated;
revoke all on table public.customer_project_import_rows from public, anon, authenticated;

create or replace function private.customer_project_import_assert_admin()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null
     or not public.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'PROJECT_IMPORT_ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.customer_project_import_fingerprint(p_batch_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        coalesce((
          select string_agg(
            concat_ws(':',
              r.row_number::text,
              r.row_sha256,
              coalesce(r.customer_id::text, ''),
              coalesce(r.sales_rep_id::text, ''),
              coalesce(r.target_status, ''),
              r.mapping_status,
              coalesce(r.validation_errors::text, '[]')
            ),
            '|' order by r.row_number
          )
          from public.customer_project_import_rows r
          where r.batch_id = p_batch_id
        ), 'empty'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.stage_customer_project_import(
  p_source_name text,
  p_source_sha256 text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_batch_id uuid;
  v_existing_status text;
  v_input_count integer;
  v_distinct_hash_count integer;
  v_row jsonb;
  v_customer_name text;
  v_project_name text;
  v_project_address text;
  v_sales_rep_name text;
  v_target_status text;
  v_start_date date;
  v_end_date date;
  v_customer_id uuid;
  v_sales_rep_id uuid;
  v_customer_count integer;
  v_sales_count integer;
  v_errors jsonb;
  v_mapping_status text;
begin
  perform private.customer_project_import_assert_admin();

  if nullif(btrim(coalesce(p_source_name,'')), '') is null then
    raise exception 'PROJECT_IMPORT_SOURCE_NAME_REQUIRED';
  end if;
  if lower(coalesce(p_source_sha256,'')) !~ '^[0-9a-f]{64}$' then
    raise exception 'PROJECT_IMPORT_SOURCE_SHA_INVALID';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'PROJECT_IMPORT_ROWS_ARRAY_REQUIRED';
  end if;

  v_input_count := jsonb_array_length(p_rows);
  if v_input_count = 0 then
    raise exception 'PROJECT_IMPORT_EMPTY';
  end if;

  select count(distinct lower(value->>'row_sha256'))
  into v_distinct_hash_count
  from jsonb_array_elements(p_rows);
  if v_distinct_hash_count <> v_input_count then
    raise exception 'PROJECT_IMPORT_DUPLICATE_ROWS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer_project_import:' || lower(p_source_sha256), 0));

  select b.id, b.status
  into v_batch_id, v_existing_status
  from public.customer_project_import_batches b
  where b.source_sha256 = lower(p_source_sha256)
  for update;

  if v_batch_id is not null then
    return jsonb_build_object(
      'ok', true,
      'batch_id', v_batch_id,
      'existing', true,
      'status', v_existing_status
    );
  end if;

  insert into public.customer_project_import_batches(
    source_name, source_sha256, status, row_count, created_by, updated_by
  ) values (
    btrim(p_source_name), lower(p_source_sha256), 'staged', v_input_count, auth.uid(), auth.uid()
  ) returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if lower(coalesce(v_row->>'row_sha256','')) !~ '^[0-9a-f]{64}$' then
      raise exception 'PROJECT_IMPORT_ROW_SHA_INVALID';
    end if;

    v_customer_name := nullif(btrim(coalesce(v_row->>'customer','')), '');
    v_project_name := nullif(btrim(coalesce(v_row->>'project_name','')), '');
    v_project_address := nullif(btrim(coalesce(v_row->>'project_address','')), '');
    v_sales_rep_name := nullif(btrim(coalesce(v_row->>'sales_rep','')), '');
    v_target_status := nullif(lower(btrim(coalesce(v_row->>'target_status',''))), '');
    v_start_date := nullif(v_row->>'start_date','')::date;
    v_end_date := nullif(v_row->>'end_date','')::date;
    v_errors := '[]'::jsonb;

    if v_customer_name is null then
      v_errors := v_errors || jsonb_build_array('customer_required');
    end if;
    if v_project_name is null then
      v_errors := v_errors || jsonb_build_array('project_name_required');
    end if;
    if v_start_date is not null and v_end_date is not null and v_end_date < v_start_date then
      v_errors := v_errors || jsonb_build_array('end_date_before_start_date');
    end if;
    if v_target_status is null then
      v_errors := v_errors || jsonb_build_array('target_status_required');
    elsif v_target_status not in ('draft','quoted','approved','ordered','in_progress','completed','cancelled') then
      v_errors := v_errors || jsonb_build_array('target_status_invalid');
    end if;

    v_customer_count := 0;
    v_customer_id := null;
    if v_customer_name is not null then
      select count(*)::integer
      into v_customer_count
      from public.customers c
      where lower(btrim(c.name)) = lower(v_customer_name)
         or lower(btrim(coalesce(c.legal_name,''))) = lower(v_customer_name);
      if v_customer_count = 1 then
        select c.id into v_customer_id
        from public.customers c
        where lower(btrim(c.name)) = lower(v_customer_name)
           or lower(btrim(coalesce(c.legal_name,''))) = lower(v_customer_name)
        order by c.created_at
        limit 1;
      end if;
    end if;

    v_sales_count := 0;
    v_sales_rep_id := null;
    if v_sales_rep_name is not null then
      select count(*)::integer
      into v_sales_count
      from public.profiles p
      where lower(btrim(coalesce(p.full_name,''))) = lower(v_sales_rep_name);
      if v_sales_count = 1 then
        select p.id into v_sales_rep_id
        from public.profiles p
        where lower(btrim(coalesce(p.full_name,''))) = lower(v_sales_rep_name)
        order by p.created_at
        limit 1;
      end if;
    end if;

    if jsonb_array_length(v_errors) > 0 then
      v_mapping_status := 'invalid';
    elsif v_customer_count <> 1
       or (v_sales_rep_name is not null and v_sales_count <> 1) then
      v_mapping_status := 'unresolved';
    else
      v_mapping_status := 'ready';
    end if;

    insert into public.customer_project_import_rows(
      batch_id,
      row_number,
      row_sha256,
      source_customer_name,
      source_project_name,
      source_project_address,
      source_start_date,
      source_end_date,
      source_sales_rep_name,
      legacy_initial_contract_price,
      legacy_price_after_change_orders,
      legacy_profit_margin,
      legacy_profit_margin_unit,
      raw_payload,
      customer_id,
      sales_rep_id,
      target_status,
      customer_match_count,
      sales_rep_match_count,
      mapping_status,
      validation_errors
    ) values (
      v_batch_id,
      (v_row->>'row_number')::integer,
      lower(v_row->>'row_sha256'),
      v_customer_name,
      v_project_name,
      v_project_address,
      v_start_date,
      v_end_date,
      v_sales_rep_name,
      nullif(v_row->>'initial_contract_price','')::numeric,
      nullif(v_row->>'price_after_change_orders','')::numeric,
      nullif(v_row->>'profit_margin','')::numeric,
      nullif(lower(v_row->>'profit_margin_unit'),''),
      coalesce(v_row->'raw_payload', '{}'::jsonb),
      v_customer_id,
      v_sales_rep_id,
      v_target_status,
      v_customer_count,
      v_sales_count,
      v_mapping_status,
      v_errors
    );
  end loop;

  if exists (
    select 1 from public.customer_project_import_rows
    where batch_id = v_batch_id and mapping_status in ('invalid','unresolved')
  ) then
    update public.customer_project_import_batches
    set status='review', updated_at=now(), updated_by=auth.uid()
    where id=v_batch_id;
  end if;

  return jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'existing', false, 'status',
    (select status from public.customer_project_import_batches where id=v_batch_id));
end;
$$;

create or replace function public.set_customer_project_import_row_mapping(
  p_row_id uuid,
  p_customer_id uuid,
  p_sales_rep_id uuid,
  p_target_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.customer_project_import_rows%rowtype;
  v_status text := lower(btrim(coalesce(p_target_status,'')));
  v_mapping_status text;
begin
  perform private.customer_project_import_assert_admin();

  select * into v_row
  from public.customer_project_import_rows
  where id = p_row_id
  for update;
  if not found then raise exception 'PROJECT_IMPORT_ROW_NOT_FOUND'; end if;

  if exists (
    select 1 from public.customer_project_import_batches
    where id=v_row.batch_id and status='committed'
  ) then
    raise exception 'PROJECT_IMPORT_ALREADY_COMMITTED';
  end if;
  if p_customer_id is null or not exists(select 1 from public.customers where id=p_customer_id) then
    raise exception 'PROJECT_IMPORT_CUSTOMER_INVALID';
  end if;
  if p_sales_rep_id is not null and not exists(select 1 from public.profiles where id=p_sales_rep_id) then
    raise exception 'PROJECT_IMPORT_SALES_REP_INVALID';
  end if;
  if v_status not in ('draft','quoted','approved','ordered','in_progress','completed','cancelled') then
    raise exception 'PROJECT_IMPORT_STATUS_INVALID';
  end if;
  if nullif(btrim(coalesce(p_note,'')), '') is null then
    raise exception 'PROJECT_IMPORT_MAPPING_NOTE_REQUIRED';
  end if;

  if jsonb_array_length(v_row.validation_errors - 'target_status_required' - 'target_status_invalid') > 0 then
    v_mapping_status := 'invalid';
  elsif v_row.source_sales_rep_name is not null and p_sales_rep_id is null then
    v_mapping_status := 'unresolved';
  else
    v_mapping_status := 'ready';
  end if;

  update public.customer_project_import_rows
  set customer_id=p_customer_id,
      sales_rep_id=p_sales_rep_id,
      target_status=v_status,
      customer_match_count=1,
      sales_rep_match_count=case when source_sales_rep_name is null then 0 when p_sales_rep_id is null then 0 else 1 end,
      mapping_status=v_mapping_status,
      validation_errors=validation_errors - 'target_status_required' - 'target_status_invalid',
      mapping_note=btrim(p_note),
      updated_at=now()
  where id=p_row_id;

  update public.customer_project_import_batches
  set status='review', dry_run_fingerprint=null, dry_run_at=null, updated_at=now(), updated_by=auth.uid()
  where id=v_row.batch_id;

  return jsonb_build_object('ok',true,'row_id',p_row_id,'mapping_status',v_mapping_status);
end;
$$;

create or replace function public.get_customer_project_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_batch jsonb;
  v_rows jsonb;
begin
  perform private.customer_project_import_assert_admin();

  select jsonb_build_object(
    'id',b.id,
    'source_name',b.source_name,
    'source_sha256',b.source_sha256,
    'status',b.status,
    'row_count',b.row_count,
    'dry_run_fingerprint',b.dry_run_fingerprint,
    'dry_run_at',b.dry_run_at,
    'committed_at',b.committed_at
  ) into v_batch
  from public.customer_project_import_batches b
  where b.id=p_batch_id;
  if v_batch is null then raise exception 'PROJECT_IMPORT_BATCH_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'row_number',r.row_number,
    'row_sha256',r.row_sha256,
    'customer',r.source_customer_name,
    'project_name',r.source_project_name,
    'project_address',r.source_project_address,
    'start_date',r.source_start_date,
    'end_date',r.source_end_date,
    'sales_rep',r.source_sales_rep_name,
    'legacy_initial_contract_price',r.legacy_initial_contract_price,
    'legacy_price_after_change_orders',r.legacy_price_after_change_orders,
    'legacy_profit_margin',r.legacy_profit_margin,
    'legacy_profit_margin_unit',r.legacy_profit_margin_unit,
    'customer_id',r.customer_id,
    'sales_rep_id',r.sales_rep_id,
    'target_status',r.target_status,
    'customer_match_count',r.customer_match_count,
    'sales_rep_match_count',r.sales_rep_match_count,
    'mapping_status',r.mapping_status,
    'validation_errors',r.validation_errors,
    'mapping_note',r.mapping_note,
    'canonical_project_id',r.canonical_project_id
  ) order by r.row_number),'[]'::jsonb)
  into v_rows
  from public.customer_project_import_rows r
  where r.batch_id=p_batch_id;

  return jsonb_build_object('ok',true,'batch',v_batch,'rows',v_rows);
end;
$$;

create or replace function public.dry_run_customer_project_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_batch public.customer_project_import_batches%rowtype;
  v_total integer;
  v_ready integer;
  v_unresolved integer;
  v_invalid integer;
  v_fingerprint text;
  v_initial_total numeric(18,2);
  v_after_change_total numeric(18,2);
  v_margin_evidence_count integer;
begin
  perform private.customer_project_import_assert_admin();

  select * into v_batch
  from public.customer_project_import_batches
  where id=p_batch_id
  for update;
  if not found then raise exception 'PROJECT_IMPORT_BATCH_NOT_FOUND'; end if;
  if v_batch.status='committed' then raise exception 'PROJECT_IMPORT_ALREADY_COMMITTED'; end if;

  select
    count(*)::integer,
    count(*) filter (where mapping_status='ready')::integer,
    count(*) filter (where mapping_status='unresolved')::integer,
    count(*) filter (where mapping_status='invalid')::integer,
    coalesce(sum(legacy_initial_contract_price),0),
    coalesce(sum(legacy_price_after_change_orders),0),
    count(legacy_profit_margin)::integer
  into v_total,v_ready,v_unresolved,v_invalid,v_initial_total,v_after_change_total,v_margin_evidence_count
  from public.customer_project_import_rows
  where batch_id=p_batch_id;

  if v_total <> v_batch.row_count then
    raise exception 'PROJECT_IMPORT_ROW_COUNT_MISMATCH';
  end if;

  v_fingerprint := private.customer_project_import_fingerprint(p_batch_id);

  update public.customer_project_import_batches
  set status=case when v_total>0 and v_unresolved=0 and v_invalid=0 then 'ready' else 'review' end,
      dry_run_fingerprint=v_fingerprint,
      dry_run_at=now(),
      updated_at=now(),
      updated_by=auth.uid()
  where id=p_batch_id;

  return jsonb_build_object(
    'ok',true,
    'batch_id',p_batch_id,
    'status',case when v_total>0 and v_unresolved=0 and v_invalid=0 then 'ready' else 'review' end,
    'row_count',v_total,
    'ready_count',v_ready,
    'unresolved_count',v_unresolved,
    'invalid_count',v_invalid,
    'legacy_initial_contract_price_total',v_initial_total,
    'legacy_price_after_change_orders_total',v_after_change_total,
    'legacy_profit_margin_evidence_count',v_margin_evidence_count,
    'fingerprint',v_fingerprint
  );
end;
$$;

create or replace function public.commit_customer_project_import(
  p_batch_id uuid,
  p_expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_batch public.customer_project_import_batches%rowtype;
  v_current_fingerprint text;
  v_row public.customer_project_import_rows%rowtype;
  v_project_id uuid;
  v_imported integer := 0;
  v_project_ids jsonb := '[]'::jsonb;
begin
  perform private.customer_project_import_assert_admin();
  perform pg_advisory_xact_lock(hashtextextended('customer_project_import_batch:' || p_batch_id::text, 0));

  select * into v_batch
  from public.customer_project_import_batches
  where id=p_batch_id
  for update;
  if not found then raise exception 'PROJECT_IMPORT_BATCH_NOT_FOUND'; end if;
  if v_batch.status='committed' then raise exception 'PROJECT_IMPORT_ALREADY_COMMITTED'; end if;
  if lower(coalesce(p_expected_fingerprint,'')) !~ '^[0-9a-f]{64}$' then
    raise exception 'PROJECT_IMPORT_FINGERPRINT_INVALID';
  end if;

  v_current_fingerprint := private.customer_project_import_fingerprint(p_batch_id);
  if v_batch.dry_run_fingerprint is null
     or v_batch.dry_run_at is null
     or v_batch.status <> 'ready'
     or v_batch.dry_run_fingerprint <> lower(p_expected_fingerprint)
     or v_current_fingerprint <> lower(p_expected_fingerprint) then
    raise exception 'PROJECT_IMPORT_STALE_DRY_RUN';
  end if;

  if exists (
    select 1 from public.customer_project_import_rows
    where batch_id=p_batch_id and mapping_status <> 'ready'
  ) then
    raise exception 'PROJECT_IMPORT_UNRESOLVED_ROWS';
  end if;

  for v_row in
    select * from public.customer_project_import_rows
    where batch_id=p_batch_id
    order by row_number
    for update
  loop
    if v_row.customer_id is null
       or v_row.target_status is null
       or (v_row.source_sales_rep_name is not null and v_row.sales_rep_id is null) then
      raise exception 'PROJECT_IMPORT_UNRESOLVED_ROWS';
    end if;

    v_project_id := private.create_customer_project(
      v_row.customer_id,
      v_row.source_project_name,
      v_row.sales_rep_id,
      null,
      v_row.source_start_date,
      null,
      null,
      null,
      v_row.target_status
    );

    if v_row.source_project_address is not null then
      update public.customer_projects
      set project_address_snapshot=jsonb_build_object(
            'legacy_text',v_row.source_project_address,
            'source','historical_excel'
          ),
          updated_by=auth.uid(),
          updated_at=now()
      where id=v_project_id;
    end if;

    update public.customer_project_import_rows
    set canonical_project_id=v_project_id,
        mapping_status='committed',
        updated_at=now()
    where id=v_row.id;

    v_imported := v_imported + 1;
    v_project_ids := v_project_ids || jsonb_build_array(v_project_id);
  end loop;

  update public.customer_project_import_batches
  set status='committed',
      committed_at=now(),
      committed_by=auth.uid(),
      updated_at=now(),
      updated_by=auth.uid()
  where id=p_batch_id;

  return jsonb_build_object(
    'ok',true,
    'batch_id',p_batch_id,
    'imported_count',v_imported,
    'project_ids',v_project_ids
  );
end;
$$;

revoke all on function private.customer_project_import_assert_admin() from public, anon, authenticated, service_role;
revoke all on function private.customer_project_import_fingerprint(uuid) from public, anon, authenticated, service_role;

revoke all on function public.stage_customer_project_import(text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.set_customer_project_import_row_mapping(uuid,uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.get_customer_project_import_batch(uuid) from public, anon, authenticated, service_role;
revoke all on function public.dry_run_customer_project_import(uuid) from public, anon, authenticated, service_role;
revoke all on function public.commit_customer_project_import(uuid,text) from public, anon, authenticated, service_role;

grant execute on function public.stage_customer_project_import(text,text,jsonb) to authenticated;
grant execute on function public.set_customer_project_import_row_mapping(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.get_customer_project_import_batch(uuid) to authenticated;
grant execute on function public.dry_run_customer_project_import(uuid) to authenticated;
grant execute on function public.commit_customer_project_import(uuid,text) to authenticated;
