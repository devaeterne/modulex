create schema if not exists private;

create or replace function private.convert_store_dealer_lead_to_customer(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_lead public.store_leads%rowtype;
  v_dealer_type_id uuid;
  v_customer_id uuid;
  v_customer_code text;
  v_customer_name text;
  v_existing_id uuid;
  v_existing_code text;
  v_existing_name text;
  v_email text;
  v_company_norm text;
  v_duplicate_match text;
begin
  if v_actor is null or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'Not authorized to convert dealer applications' using errcode = '42501';
  end if;

  select *
  into v_lead
  from public.store_leads
  where id = p_lead_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_found');
  end if;

  if v_lead.lead_type <> 'dealer_application' then
    return jsonb_build_object('ok', false, 'reason', 'not_dealer_application');
  end if;

  if v_lead.converted_customer_id is not null then
    select c.customer_code, c.name
    into v_existing_code, v_existing_name
    from public.customers c
    where c.id = v_lead.converted_customer_id;

    return jsonb_build_object(
      'ok', true,
      'created', false,
      'reason', 'already_converted',
      'customer_id', v_lead.converted_customer_id,
      'customer_code', v_existing_code,
      'customer_name', v_existing_name
    );
  end if;

  if v_lead.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'lead_not_approved');
  end if;

  if v_lead.company_name is null or btrim(v_lead.company_name) = '' then
    return jsonb_build_object('ok', false, 'reason', 'company_name_required');
  end if;

  select ct.id
  into v_dealer_type_id
  from public.customer_types ct
  where ct.system_key = 'dealer'
    and ct.is_active = true
  limit 1;

  if v_dealer_type_id is null then
    raise exception 'Active dealer customer type is not configured';
  end if;

  v_email := lower(btrim(v_lead.email));
  v_company_norm := lower(regexp_replace(btrim(v_lead.company_name), '\s+', ' ', 'g'));

  if v_email <> '' then
    perform pg_advisory_xact_lock(hashtextextended('dealer-email:' || v_email, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dealer-company:' || v_company_norm, 0));

  select c.id, c.customer_code, c.name,
         case
           when v_email <> '' and c.email is not null and lower(btrim(c.email)) = v_email
             and lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = v_company_norm then 'email_and_company'
           when v_email <> '' and c.email is not null and lower(btrim(c.email)) = v_email then 'email'
           else 'company_name'
         end
  into v_existing_id, v_existing_code, v_existing_name, v_duplicate_match
  from public.customers c
  where (v_email <> '' and c.email is not null and lower(btrim(c.email)) = v_email)
     or lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = v_company_norm
  order by
    case when v_email <> '' and c.email is not null and lower(btrim(c.email)) = v_email then 0 else 1 end,
    c.created_at asc
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'duplicate_customer',
      'duplicate_match', v_duplicate_match,
      'customer_id', v_existing_id,
      'customer_code', v_existing_code,
      'customer_name', v_existing_name
    );
  end if;

  insert into public.customers (
    name,
    customer_type_id,
    status,
    email,
    phone,
    website,
    country_code,
    sales_rep_id,
    portal_enabled,
    created_by,
    updated_by
  ) values (
    btrim(v_lead.company_name),
    v_dealer_type_id,
    'prospect',
    v_email,
    nullif(btrim(coalesce(v_lead.phone, '')), ''),
    nullif(btrim(coalesce(v_lead.company_website, '')), ''),
    v_lead.country_code,
    v_lead.assigned_to,
    false,
    v_actor,
    v_actor
  )
  returning id, customer_code, name
  into v_customer_id, v_customer_code, v_customer_name;

  insert into public.customer_contacts (
    customer_id,
    first_name,
    last_name,
    email,
    phone,
    is_primary,
    is_order_contact,
    created_by,
    updated_by
  ) values (
    v_customer_id,
    btrim(v_lead.first_name),
    nullif(btrim(v_lead.last_name), ''),
    v_email,
    nullif(btrim(coalesce(v_lead.phone, '')), ''),
    true,
    true,
    v_actor,
    v_actor
  );

  update public.store_leads
  set converted_customer_id = v_customer_id,
      status = 'closed',
      updated_by = v_actor
  where id = v_lead.id;

  insert into public.store_lead_activity (
    lead_id,
    action,
    from_status,
    to_status,
    note,
    actor_user_id
  ) values (
    v_lead.id,
    'converted_to_customer',
    'approved',
    'closed',
    v_customer_code,
    v_actor
  );

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    v_customer_id,
    'created_from_dealer_application',
    'Created from dealer application',
    'Converted from Store lead ' || v_lead.reference_code,
    jsonb_build_object(
      'source_lead_id', v_lead.id,
      'source_reference_code', v_lead.reference_code
    ),
    v_actor
  );

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'reason', 'converted',
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'customer_name', v_customer_name
  );
end;
$$;

create or replace function public.convert_store_dealer_lead_to_customer(p_lead_id uuid)
returns jsonb
language sql
set search_path = ''
as $$
  select private.convert_store_dealer_lead_to_customer(p_lead_id);
$$;

revoke all on function private.convert_store_dealer_lead_to_customer(uuid) from public;
revoke all on function public.convert_store_dealer_lead_to_customer(uuid) from public;

grant usage on schema private to authenticated, service_role;
grant execute on function private.convert_store_dealer_lead_to_customer(uuid) to authenticated;
grant execute on function public.convert_store_dealer_lead_to_customer(uuid) to authenticated, service_role;
