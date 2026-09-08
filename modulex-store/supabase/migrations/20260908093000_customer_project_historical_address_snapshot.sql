-- PB-9 production-closeout: preserve unstructured historical Project addresses without
-- inventing Customer Address master rows. Existing canonical address snapshots remain authoritative.

create or replace function private.prepare_customer_project()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_address public.customer_addresses%rowtype;
  v_is_historical_snapshot boolean;
  v_import_context boolean;
begin
  new.name := btrim(new.name);
  new.customer_notes := nullif(btrim(new.customer_notes), '');
  new.internal_notes := nullif(btrim(new.internal_notes), '');

  if tg_op = 'INSERT' or new.sales_rep_id is distinct from old.sales_rep_id then
    if new.sales_rep_id is not null
       and not exists (
         select 1
         from public.profiles p
         where p.id = new.sales_rep_id
           and p.is_active = true
       ) then
      raise exception 'Sales rep does not exist or is inactive.';
    end if;
  end if;

  v_is_historical_snapshot :=
    new.project_address_id is null
    and jsonb_typeof(new.project_address_snapshot) = 'object'
    and new.project_address_snapshot ->> 'source' = 'historical_excel'
    and nullif(btrim(coalesce(new.project_address_snapshot ->> 'legacy_text', '')), '') is not null;

  v_import_context :=
    coalesce(current_setting('modulex.customer_project_import', true), '') = 'on'
    and auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin']::text[]);

  if new.project_address_id is not null
     and (
       tg_op = 'INSERT'
       or new.project_address_id is distinct from old.project_address_id
       or new.customer_id is distinct from old.customer_id
     ) then
    select *
    into v_address
    from public.customer_addresses a
    where a.id = new.project_address_id
      and a.customer_id = new.customer_id;

    if v_address.id is null then
      raise exception 'Project address must belong to the project customer.';
    end if;

    new.project_address_snapshot := jsonb_build_object(
      'id', v_address.id,
      'address_name', v_address.address_name,
      'company_name', v_address.company_name,
      'contact_name', v_address.contact_name,
      'address_line_1', v_address.address_line_1,
      'address_line_2', v_address.address_line_2,
      'postal_code', v_address.postal_code,
      'city', v_address.city,
      'state_region', v_address.state_region,
      'country_code', v_address.country_code,
      'phone', v_address.phone
    );
  elsif new.project_address_id is null then
    if v_is_historical_snapshot then
      if (
        tg_op = 'INSERT'
        or old.project_address_snapshot is distinct from new.project_address_snapshot
      ) and not v_import_context then
        raise exception 'Historical Project address snapshots must be created through the canonical import.' using errcode = '42501';
      end if;
      -- Preserve an existing historical snapshot on ordinary future Project updates.
    else
      new.project_address_snapshot := null;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
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
  where id = p_batch_id
  for update;
  if not found then raise exception 'PROJECT_IMPORT_BATCH_NOT_FOUND'; end if;
  if v_batch.status = 'committed' then raise exception 'PROJECT_IMPORT_ALREADY_COMMITTED'; end if;
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
    select 1
    from public.customer_project_import_rows
    where batch_id = p_batch_id
      and mapping_status <> 'ready'
  ) then
    raise exception 'PROJECT_IMPORT_UNRESOLVED_ROWS';
  end if;

  for v_row in
    select *
    from public.customer_project_import_rows
    where batch_id = p_batch_id
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
      perform set_config('modulex.customer_project_import', 'on', true);
      update public.customer_projects
      set project_address_snapshot = jsonb_build_object(
            'legacy_text', v_row.source_project_address,
            'address_line_1', v_row.source_project_address,
            'source', 'historical_excel'
          ),
          updated_by = auth.uid(),
          updated_at = now()
      where id = v_project_id;
      perform set_config('modulex.customer_project_import', 'off', true);
    end if;

    update public.customer_project_import_rows
    set canonical_project_id = v_project_id,
        mapping_status = 'committed',
        updated_at = now()
    where id = v_row.id;

    v_imported := v_imported + 1;
    v_project_ids := v_project_ids || jsonb_build_array(v_project_id);
  end loop;

  update public.customer_project_import_batches
  set status = 'committed',
      committed_at = now(),
      committed_by = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'imported_count', v_imported,
    'project_ids', v_project_ids
  );
end;
$$;

revoke all on function public.commit_customer_project_import(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.commit_customer_project_import(uuid,text) to authenticated;
