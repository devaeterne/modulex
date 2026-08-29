begin;

create or replace function public.validate_customer_master_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and old.status <> 'prospect'
     and new.status = 'prospect' then
    raise exception 'A converted customer cannot return to prospect status.';
  end if;

  if new.customer_type_id is distinct from old.customer_type_id
     and new.customer_type_id is not null
     and not exists (
       select 1
       from public.customer_types ct
       where ct.id = new.customer_type_id
         and ct.is_active = true
     ) then
    raise exception 'Customer type does not exist or is inactive.';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_master_update_guard on public.customers;
create trigger customers_master_update_guard
before update of status, customer_type_id on public.customers
for each row
execute function public.validate_customer_master_update();

create or replace function public.audit_customer_master_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed_fields text[] := array[]::text[];
  v_metadata jsonb := '{}'::jsonb;
begin
  if new.name is distinct from old.name then v_changed_fields := array_append(v_changed_fields, 'name'); end if;
  if new.legal_name is distinct from old.legal_name then v_changed_fields := array_append(v_changed_fields, 'legal_name'); end if;
  if new.customer_type_id is distinct from old.customer_type_id then
    v_changed_fields := array_append(v_changed_fields, 'customer_type_id');
    v_metadata := v_metadata || jsonb_build_object(
      'customer_type', jsonb_build_object('from', old.customer_type_id, 'to', new.customer_type_id)
    );
  end if;
  if new.status is distinct from old.status then
    v_changed_fields := array_append(v_changed_fields, 'status');
    v_metadata := v_metadata || jsonb_build_object(
      'status', jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  if new.tax_number is distinct from old.tax_number then v_changed_fields := array_append(v_changed_fields, 'tax_number'); end if;
  if new.registration_number is distinct from old.registration_number then v_changed_fields := array_append(v_changed_fields, 'registration_number'); end if;
  if new.email is distinct from old.email then v_changed_fields := array_append(v_changed_fields, 'email'); end if;
  if new.phone is distinct from old.phone then v_changed_fields := array_append(v_changed_fields, 'phone'); end if;
  if new.website is distinct from old.website then v_changed_fields := array_append(v_changed_fields, 'website'); end if;
  if new.country_code is distinct from old.country_code then v_changed_fields := array_append(v_changed_fields, 'country_code'); end if;
  if new.language_code is distinct from old.language_code then v_changed_fields := array_append(v_changed_fields, 'language_code'); end if;
  if new.currency_code is distinct from old.currency_code then v_changed_fields := array_append(v_changed_fields, 'currency_code'); end if;
  if new.sales_rep_id is distinct from old.sales_rep_id then v_changed_fields := array_append(v_changed_fields, 'sales_rep_id'); end if;
  if new.customer_since is distinct from old.customer_since then v_changed_fields := array_append(v_changed_fields, 'customer_since'); end if;

  if coalesce(array_length(v_changed_fields, 1), 0) = 0 then
    return new;
  end if;

  v_metadata := v_metadata || jsonb_build_object('changed_fields', to_jsonb(v_changed_fields));

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    metadata
  ) values (
    new.id,
    'customer_master_updated',
    'Customer master updated',
    v_metadata
  );

  return new;
end;
$$;

drop trigger if exists customers_master_update_audit on public.customers;
create trigger customers_master_update_audit
after update of name, legal_name, customer_type_id, status, tax_number, registration_number, email, phone, website, country_code, language_code, currency_code, sales_rep_id, customer_since on public.customers
for each row
execute function public.audit_customer_master_update();

create or replace function public.update_customer_master(
  p_customer_id uuid,
  p_name text,
  p_legal_name text,
  p_customer_type_id uuid,
  p_status text,
  p_tax_number text,
  p_registration_number text,
  p_email text,
  p_phone text,
  p_website text,
  p_country_code text,
  p_language_code text,
  p_currency_code text,
  p_sales_rep_id uuid,
  p_customer_since date
)
returns public.customers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_status text := lower(trim(coalesce(p_status, '')));
  v_country_code text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_language_code text := trim(coalesce(p_language_code, ''));
  v_currency_code text := upper(trim(coalesce(p_currency_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to update customer master data.';
  end if;

  select *
  into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if v_customer.id is null then
    raise exception 'Customer not found.';
  end if;

  if v_name = '' then
    raise exception 'Customer name is required.';
  end if;

  if v_status not in ('prospect', 'active', 'inactive', 'blocked') then
    raise exception 'Invalid customer status.';
  end if;

  if v_customer.status <> 'prospect' and v_status = 'prospect' then
    raise exception 'A converted customer cannot return to prospect status.';
  end if;

  if p_customer_type_id is distinct from v_customer.customer_type_id
     and p_customer_type_id is not null
     and not exists (
       select 1
       from public.customer_types ct
       where ct.id = p_customer_type_id
         and ct.is_active = true
     ) then
    raise exception 'Customer type does not exist or is inactive.';
  end if;

  if v_country_code is not null and length(v_country_code) <> 2 then
    raise exception 'Country code must be a 2-letter code.';
  end if;

  if v_language_code = '' then
    raise exception 'Language code is required.';
  end if;

  if length(v_currency_code) <> 3 then
    raise exception 'Currency code must be a 3-letter code.';
  end if;

  update public.customers
  set name = v_name,
      legal_name = nullif(trim(coalesce(p_legal_name, '')), ''),
      customer_type_id = p_customer_type_id,
      status = v_status,
      tax_number = nullif(trim(coalesce(p_tax_number, '')), ''),
      registration_number = nullif(trim(coalesce(p_registration_number, '')), ''),
      email = nullif(trim(coalesce(p_email, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      website = nullif(trim(coalesce(p_website, '')), ''),
      country_code = v_country_code,
      language_code = v_language_code,
      currency_code = v_currency_code,
      sales_rep_id = p_sales_rep_id,
      customer_since = p_customer_since,
      updated_by = auth.uid()
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

revoke all on function public.update_customer_master(uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,uuid,date) from public;
revoke all on function public.update_customer_master(uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,uuid,date) from anon;
grant execute on function public.update_customer_master(uuid,text,text,uuid,text,text,text,text,text,text,text,text,text,uuid,date) to authenticated;

notify pgrst, 'reload schema';

commit;
