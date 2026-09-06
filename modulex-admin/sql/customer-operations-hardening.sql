-- Customer Operations Hardening — Customer creation boundary
-- Keeps customer/default/commercial triggers canonical while making Customer + activity atomic.

begin;

create or replace function public.create_customer(
  p_name text,
  p_legal_name text default null,
  p_customer_type_id uuid default null,
  p_status text default 'prospect',
  p_email text default null,
  p_phone text default null,
  p_country_code text default null,
  p_price_group_id uuid default null,
  p_sales_rep_id uuid default null,
  p_customer_since date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_customer public.customers%rowtype;
  v_role text;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_status text := lower(btrim(coalesce(p_status, 'prospect')));
  v_country_code text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  v_price_group_result text := 'unchanged';
  v_insert_price_group_id uuid := p_price_group_id;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales') then
    raise exception 'You do not have permission to create customers.' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;

  if v_status not in ('prospect', 'active', 'inactive', 'blocked') then
    raise exception 'Invalid customer status.' using errcode = '22023';
  end if;

  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Country code must be a 2-letter ISO code.' using errcode = '22023';
  end if;

  if p_customer_type_id is not null
     and not exists (
       select 1
       from public.customer_types ct
       where ct.id = p_customer_type_id
         and ct.is_active = true
     ) then
    raise exception 'Customer type does not exist or is inactive.' using errcode = '22023';
  end if;

  if p_price_group_id is not null
     and not exists (
       select 1
       from public.price_groups pg
       where pg.id = p_price_group_id
         and pg.is_active = true
         and pg.available_for_orders = true
         and pg.internal_only = false
     ) then
    raise exception 'This price group cannot be assigned to customers.' using errcode = '22023';
  end if;

  if p_sales_rep_id is not null
     and not exists (
       select 1
       from public.profiles p
       where p.id = p_sales_rep_id
         and p.is_active = true
         and p.role in ('super_admin', 'admin', 'sales')
     ) then
    raise exception 'Sales representative does not exist or is inactive.' using errcode = '22023';
  end if;

  -- Sales cannot bypass the existing approval workflow while creating a customer.
  -- Let the canonical BEFORE INSERT trigger assign the base group first; after the
  -- customer exists, request_customer_price_group_change creates the normal approval.
  if v_role = 'sales' then
    v_insert_price_group_id := null;
  end if;

  insert into public.customers (
    name,
    legal_name,
    customer_type_id,
    status,
    email,
    phone,
    country_code,
    price_group_id,
    sales_rep_id,
    customer_since,
    created_by,
    updated_by
  ) values (
    v_name,
    nullif(btrim(coalesce(p_legal_name, '')), ''),
    p_customer_type_id,
    v_status,
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    v_country_code,
    v_insert_price_group_id,
    p_sales_rep_id,
    p_customer_since,
    auth.uid(),
    auth.uid()
  )
  returning * into v_customer;

  if v_role = 'sales'
     and p_price_group_id is not null
     and p_price_group_id is distinct from v_customer.price_group_id then
    v_price_group_result := public.request_customer_price_group_change(v_customer.id, p_price_group_id);
  elsif p_price_group_id is not null then
    v_price_group_result := 'saved';
  end if;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    v_customer.id,
    'customer_created',
    'Customer created',
    'Customer ' || v_customer.customer_code || ' was created.',
    jsonb_build_object(
      'status', v_customer.status,
      'price_group_result', v_price_group_result
    ),
    auth.uid()
  );

  -- Re-read after a direct Admin price-group assignment / Sales approval request so
  -- the returned customer reflects the committed canonical row state.
  select * into v_customer
  from public.customers
  where id = v_customer.id;

  return jsonb_build_object(
    'customer', to_jsonb(v_customer),
    'price_group_result', v_price_group_result
  );
end;
$$;

revoke all on function public.create_customer(text,text,uuid,text,text,text,text,uuid,uuid,date) from public;
revoke all on function public.create_customer(text,text,uuid,text,text,text,text,uuid,uuid,date) from anon;
grant execute on function public.create_customer(text,text,uuid,text,text,text,text,uuid,uuid,date) to authenticated;

notify pgrst, 'reload schema';

commit;
