-- Customer Contact + Address lifecycle hardening.
-- Canonical browser mutation boundary for Customer operational master data.

create or replace function public.create_customer_contact(
  p_customer_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_job_title text default null,
  p_department text default null,
  p_email text default null,
  p_phone text default null,
  p_mobile text default null,
  p_is_primary boolean default false,
  p_is_billing_contact boolean default false,
  p_is_shipping_contact boolean default false,
  p_is_order_contact boolean default false
)
returns public.customer_contacts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact public.customer_contacts;
begin
  if not (select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])) then
    raise exception 'Customer contact mutation is not permitted for this role.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_first_name, '')), '') is null then
    raise exception 'Contact first name is required.' using errcode = '22023';
  end if;

  perform 1 from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  if coalesce(p_is_primary, false) then
    update public.customer_contacts
       set is_primary = false,
           updated_by = (select auth.uid()),
           updated_at = now()
     where customer_id = p_customer_id
       and is_active = true
       and is_primary = true;
  end if;

  insert into public.customer_contacts (
    customer_id, first_name, last_name, job_title, department, email, phone, mobile,
    is_primary, is_billing_contact, is_shipping_contact, is_order_contact,
    is_active, created_by, updated_by
  ) values (
    p_customer_id,
    btrim(p_first_name),
    nullif(btrim(coalesce(p_last_name, '')), ''),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    nullif(btrim(coalesce(p_department, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    coalesce(p_is_primary, false),
    coalesce(p_is_billing_contact, false),
    coalesce(p_is_shipping_contact, false),
    coalesce(p_is_order_contact, false),
    true,
    (select auth.uid()),
    (select auth.uid())
  ) returning * into v_contact;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id,
    'contact_added',
    'Contact added',
    concat_ws(' ', v_contact.first_name, v_contact.last_name),
    jsonb_build_object('contact_id', v_contact.id, 'is_primary', v_contact.is_primary),
    (select auth.uid())
  );

  return v_contact;
end;
$$;

create or replace function public.update_customer_contact(
  p_customer_id uuid,
  p_contact_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_job_title text default null,
  p_department text default null,
  p_email text default null,
  p_phone text default null,
  p_mobile text default null,
  p_is_primary boolean default false,
  p_is_billing_contact boolean default false,
  p_is_shipping_contact boolean default false,
  p_is_order_contact boolean default false
)
returns public.customer_contacts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact public.customer_contacts;
begin
  if not (select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])) then
    raise exception 'Customer contact mutation is not permitted for this role.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_first_name, '')), '') is null then
    raise exception 'Contact first name is required.' using errcode = '22023';
  end if;

  perform 1 from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  select * into v_contact
    from public.customer_contacts
   where id = p_contact_id and customer_id = p_customer_id and is_active = true
   for update;
  if not found then
    raise exception 'Active customer contact not found.' using errcode = 'P0002';
  end if;

  if coalesce(p_is_primary, false) then
    update public.customer_contacts
       set is_primary = false,
           updated_by = (select auth.uid()),
           updated_at = now()
     where customer_id = p_customer_id
       and is_active = true
       and is_primary = true
       and id <> p_contact_id;
  end if;

  update public.customer_contacts
     set first_name = btrim(p_first_name),
         last_name = nullif(btrim(coalesce(p_last_name, '')), ''),
         job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
         department = nullif(btrim(coalesce(p_department, '')), ''),
         email = nullif(btrim(coalesce(p_email, '')), ''),
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         mobile = nullif(btrim(coalesce(p_mobile, '')), ''),
         is_primary = coalesce(p_is_primary, false),
         is_billing_contact = coalesce(p_is_billing_contact, false),
         is_shipping_contact = coalesce(p_is_shipping_contact, false),
         is_order_contact = coalesce(p_is_order_contact, false),
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_contact_id and customer_id = p_customer_id and is_active = true
   returning * into v_contact;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id,
    'contact_updated',
    'Contact updated',
    concat_ws(' ', v_contact.first_name, v_contact.last_name),
    jsonb_build_object('contact_id', v_contact.id, 'is_primary', v_contact.is_primary),
    (select auth.uid())
  );

  return v_contact;
end;
$$;

create or replace function public.set_customer_contact_primary(
  p_customer_id uuid,
  p_contact_id uuid
)
returns public.customer_contacts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact public.customer_contacts;
begin
  if not (select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])) then
    raise exception 'Customer contact mutation is not permitted for this role.' using errcode = '42501';
  end if;

  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  select * into v_contact
    from public.customer_contacts
   where id = p_contact_id and customer_id = p_customer_id and is_active = true
   for update;
  if not found then raise exception 'Active customer contact not found.' using errcode = 'P0002'; end if;

  update public.customer_contacts
     set is_primary = false,
         updated_by = (select auth.uid()),
         updated_at = now()
   where customer_id = p_customer_id
     and is_active = true
     and is_primary = true
     and id <> p_contact_id;

  update public.customer_contacts
     set is_primary = true,
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_contact_id and customer_id = p_customer_id and is_active = true
   returning * into v_contact;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id,
    'contact_primary_changed',
    'Primary contact changed',
    concat_ws(' ', v_contact.first_name, v_contact.last_name),
    jsonb_build_object('contact_id', v_contact.id),
    (select auth.uid())
  );

  return v_contact;
end;
$$;

create or replace function public.deactivate_customer_contact(
  p_customer_id uuid,
  p_contact_id uuid
)
returns public.customer_contacts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact public.customer_contacts;
begin
  if not (select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])) then
    raise exception 'Customer contact mutation is not permitted for this role.' using errcode = '42501';
  end if;

  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  update public.customer_contacts
     set is_active = false,
         is_primary = false,
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_contact_id and customer_id = p_customer_id and is_active = true
   returning * into v_contact;
  if not found then raise exception 'Active customer contact not found.' using errcode = 'P0002'; end if;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id,
    'contact_deactivated',
    'Contact deactivated',
    concat_ws(' ', v_contact.first_name, v_contact.last_name),
    jsonb_build_object('contact_id', v_contact.id),
    (select auth.uid())
  );

  return v_contact;
end;
$$;

create or replace function public.update_customer_address(
  p_customer_id uuid,
  p_address_id uuid,
  p_address_name text,
  p_company_name text default null,
  p_contact_name text default null,
  p_address_line_1 text default null,
  p_address_line_2 text default null,
  p_postal_code text default null,
  p_city text default null,
  p_state_region text default null,
  p_country_code text default null,
  p_phone text default null,
  p_address_type text default 'shipping',
  p_is_default_billing boolean default false,
  p_is_default_shipping boolean default false
)
returns public.customer_addresses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_address public.customer_addresses;
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_address_type text := lower(btrim(coalesce(p_address_type, 'shipping')));
begin
  if not (select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])) then
    raise exception 'Customer address mutation is not permitted for this role.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_address_name, '')), '') is null
     or nullif(btrim(coalesce(p_address_line_1, '')), '') is null
     or nullif(btrim(coalesce(p_city, '')), '') is null then
    raise exception 'Address name, address line and city are required.' using errcode = '22023';
  end if;
  if v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Country code must be a 2-letter ISO code.' using errcode = '22023';
  end if;
  if v_address_type not in ('billing','shipping','both') then
    raise exception 'Address type must be billing, shipping or both.' using errcode = '22023';
  end if;
  if coalesce(p_is_default_billing, false) and v_address_type not in ('billing','both') then
    raise exception 'Billing default requires a billing or both address type.' using errcode = '22023';
  end if;
  if coalesce(p_is_default_shipping, false) and v_address_type not in ('shipping','both') then
    raise exception 'Shipping default requires a shipping or both address type.' using errcode = '22023';
  end if;

  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  select * into v_address
    from public.customer_addresses
   where id = p_address_id and customer_id = p_customer_id and is_active = true
   for update;
  if not found then raise exception 'Active customer address not found.' using errcode = 'P0002'; end if;

  if coalesce(p_is_default_billing, false) then
    update public.customer_addresses
       set is_default_billing = false,
           updated_by = (select auth.uid()),
           updated_at = now()
     where customer_id = p_customer_id and is_active = true and is_default_billing = true and id <> p_address_id;
  end if;
  if coalesce(p_is_default_shipping, false) then
    update public.customer_addresses
       set is_default_shipping = false,
           updated_by = (select auth.uid()),
           updated_at = now()
     where customer_id = p_customer_id and is_active = true and is_default_shipping = true and id <> p_address_id;
  end if;

  update public.customer_addresses
     set address_name = btrim(p_address_name),
         company_name = nullif(btrim(coalesce(p_company_name, '')), ''),
         contact_name = nullif(btrim(coalesce(p_contact_name, '')), ''),
         address_line_1 = btrim(p_address_line_1),
         address_line_2 = nullif(btrim(coalesce(p_address_line_2, '')), ''),
         postal_code = nullif(btrim(coalesce(p_postal_code, '')), ''),
         city = btrim(p_city),
         state_region = nullif(btrim(coalesce(p_state_region, '')), ''),
         country_code = v_country_code,
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         address_type = v_address_type,
         is_default_billing = coalesce(p_is_default_billing, false),
         is_default_shipping = coalesce(p_is_default_shipping, false),
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_address_id and customer_id = p_customer_id and is_active = true
   returning * into v_address;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id,
    'address_updated',
    'Address updated',
    v_address.address_name,
    jsonb_build_object(
      'address_id', v_address.id,
      'is_default_billing', v_address.is_default_billing,
      'is_default_shipping', v_address.is_default_shipping
    ),
    (select auth.uid())
  );

  return v_address;
end;
$$;

create or replace function public.deactivate_customer_address(
  p_customer_id uuid,
  p_address_id uuid
)
returns public.customer_addresses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_address public.customer_addresses;
begin
  if not (select public.current_user_has_any_role(array['super_admin','admin','sales']::text[])) then
    raise exception 'Customer address mutation is not permitted for this role.' using errcode = '42501';
  end if;

  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'P0002'; end if;

  update public.customer_addresses
     set is_active = false,
         is_default_billing = false,
         is_default_shipping = false,
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_address_id and customer_id = p_customer_id and is_active = true
   returning * into v_address;
  if not found then raise exception 'Active customer address not found.' using errcode = 'P0002'; end if;

  insert into public.customer_activity (
    customer_id, activity_type, title, description, metadata, actor_user_id
  ) values (
    p_customer_id,
    'address_deactivated',
    'Address deactivated',
    v_address.address_name,
    jsonb_build_object('address_id', v_address.id),
    (select auth.uid())
  );

  return v_address;
end;
$$;

revoke all on function public.create_customer_contact(uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean) from public;
grant execute on function public.create_customer_contact(uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean) to authenticated;

revoke all on function public.update_customer_contact(uuid,uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean) from public;
grant execute on function public.update_customer_contact(uuid,uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean) to authenticated;

revoke all on function public.set_customer_contact_primary(uuid,uuid) from public;
grant execute on function public.set_customer_contact_primary(uuid,uuid) to authenticated;

revoke all on function public.deactivate_customer_contact(uuid,uuid) from public;
grant execute on function public.deactivate_customer_contact(uuid,uuid) to authenticated;

revoke all on function public.update_customer_address(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) from public;
grant execute on function public.update_customer_address(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) to authenticated;

revoke all on function public.deactivate_customer_address(uuid,uuid) from public;
grant execute on function public.deactivate_customer_address(uuid,uuid) to authenticated;
