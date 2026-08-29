-- A1.1C customer address integrity
-- Atomic address creation/default assignment while preserving caller RLS.

create or replace function public.create_customer_address(
  p_customer_id uuid,
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
volatile
as $$
declare
  v_address public.customer_addresses;
  v_country_code text := upper(btrim(coalesce(p_country_code, '')));
  v_address_type text := lower(btrim(coalesce(p_address_type, 'shipping')));
begin
  if not (select public.current_user_has_any_role(array['super_admin', 'admin', 'sales']::text[])) then
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

  if v_address_type not in ('billing', 'shipping', 'both') then
    raise exception 'Address type must be billing, shipping or both.' using errcode = '22023';
  end if;

  if coalesce(p_is_default_billing, false) and v_address_type not in ('billing', 'both') then
    raise exception 'Billing default requires a billing or both address type.' using errcode = '22023';
  end if;

  if coalesce(p_is_default_shipping, false) and v_address_type not in ('shipping', 'both') then
    raise exception 'Shipping default requires a shipping or both address type.' using errcode = '22023';
  end if;

  -- Serialize default-address changes per customer so concurrent requests cannot
  -- interleave clear/set operations. The function itself is one transaction.
  perform 1
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  if coalesce(p_is_default_billing, false) then
    update public.customer_addresses
    set is_default_billing = false,
        updated_by = (select auth.uid()),
        updated_at = now()
    where customer_id = p_customer_id
      and is_active = true
      and is_default_billing = true;
  end if;

  if coalesce(p_is_default_shipping, false) then
    update public.customer_addresses
    set is_default_shipping = false,
        updated_by = (select auth.uid()),
        updated_at = now()
    where customer_id = p_customer_id
      and is_active = true
      and is_default_shipping = true;
  end if;

  insert into public.customer_addresses (
    customer_id,
    address_name,
    company_name,
    contact_name,
    address_line_1,
    address_line_2,
    postal_code,
    city,
    state_region,
    country_code,
    phone,
    address_type,
    is_default_billing,
    is_default_shipping,
    created_by,
    updated_by
  ) values (
    p_customer_id,
    btrim(p_address_name),
    nullif(btrim(coalesce(p_company_name, '')), ''),
    nullif(btrim(coalesce(p_contact_name, '')), ''),
    btrim(p_address_line_1),
    nullif(btrim(coalesce(p_address_line_2, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    btrim(p_city),
    nullif(btrim(coalesce(p_state_region, '')), ''),
    v_country_code,
    nullif(btrim(coalesce(p_phone, '')), ''),
    v_address_type,
    coalesce(p_is_default_billing, false),
    coalesce(p_is_default_shipping, false),
    (select auth.uid()),
    (select auth.uid())
  )
  returning * into v_address;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    p_customer_id,
    'address_added',
    'Address added',
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

create or replace function public.set_customer_address_default(
  p_customer_id uuid,
  p_address_id uuid,
  p_default_kind text
)
returns public.customer_addresses
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_address public.customer_addresses;
  v_default_kind text := lower(btrim(coalesce(p_default_kind, '')));
begin
  if not (select public.current_user_has_any_role(array['super_admin', 'admin', 'sales']::text[])) then
    raise exception 'Customer address mutation is not permitted for this role.' using errcode = '42501';
  end if;

  if v_default_kind not in ('billing', 'shipping') then
    raise exception 'Default kind must be billing or shipping.' using errcode = '22023';
  end if;

  perform 1
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  select *
  into v_address
  from public.customer_addresses
  where id = p_address_id
    and customer_id = p_customer_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Active customer address not found.' using errcode = 'P0002';
  end if;

  if v_default_kind = 'billing' and v_address.address_type not in ('billing', 'both') then
    raise exception 'Billing default requires a billing or both address type.' using errcode = '22023';
  end if;

  if v_default_kind = 'shipping' and v_address.address_type not in ('shipping', 'both') then
    raise exception 'Shipping default requires a shipping or both address type.' using errcode = '22023';
  end if;

  if v_default_kind = 'billing' then
    update public.customer_addresses
    set is_default_billing = false,
        updated_by = (select auth.uid()),
        updated_at = now()
    where customer_id = p_customer_id
      and is_active = true
      and is_default_billing = true
      and id <> p_address_id;

    update public.customer_addresses
    set is_default_billing = true,
        updated_by = (select auth.uid()),
        updated_at = now()
    where id = p_address_id
      and customer_id = p_customer_id
    returning * into v_address;
  else
    update public.customer_addresses
    set is_default_shipping = false,
        updated_by = (select auth.uid()),
        updated_at = now()
    where customer_id = p_customer_id
      and is_active = true
      and is_default_shipping = true
      and id <> p_address_id;

    update public.customer_addresses
    set is_default_shipping = true,
        updated_by = (select auth.uid()),
        updated_at = now()
    where id = p_address_id
      and customer_id = p_customer_id
    returning * into v_address;
  end if;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    p_customer_id,
    'address_default_changed',
    case when v_default_kind = 'billing' then 'Default billing address changed' else 'Default shipping address changed' end,
    v_address.address_name,
    jsonb_build_object('address_id', v_address.id, 'default_kind', v_default_kind),
    (select auth.uid())
  );

  return v_address;
end;
$$;

revoke all on function public.create_customer_address(uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) from public;
revoke all on function public.create_customer_address(uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) from anon;
grant execute on function public.create_customer_address(uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) to authenticated;

revoke all on function public.set_customer_address_default(uuid, uuid, text) from public;
revoke all on function public.set_customer_address_default(uuid, uuid, text) from anon;
grant execute on function public.set_customer_address_default(uuid, uuid, text) to authenticated;
