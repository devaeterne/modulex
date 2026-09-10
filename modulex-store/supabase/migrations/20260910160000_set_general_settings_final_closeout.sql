begin;

-- SET-A4: keep document configuration in the existing singleton. Sequences remain
-- the counters; only formatting is configurable.
alter table public.general_settings
  add column if not exists order_number_prefix text not null default 'ORD-',
  add column if not exists order_number_padding smallint not null default 6,
  add column if not exists invoice_number_prefix text not null default 'INV-',
  add column if not exists invoice_number_padding smallint not null default 6;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'general_settings_order_number_prefix_valid') then
    alter table public.general_settings
      add constraint general_settings_order_number_prefix_valid
      check (order_number_prefix = upper(order_number_prefix) and length(btrim(order_number_prefix)) between 1 and 12 and order_number_prefix = btrim(order_number_prefix));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'general_settings_order_number_padding_valid') then
    alter table public.general_settings
      add constraint general_settings_order_number_padding_valid
      check (order_number_padding between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'general_settings_invoice_number_prefix_valid') then
    alter table public.general_settings
      add constraint general_settings_invoice_number_prefix_valid
      check (invoice_number_prefix = upper(invoice_number_prefix) and length(btrim(invoice_number_prefix)) between 1 and 12 and invoice_number_prefix = btrim(invoice_number_prefix));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'general_settings_invoice_number_padding_valid') then
    alter table public.general_settings
      add constraint general_settings_invoice_number_padding_valid
      check (invoice_number_padding between 1 and 12);
  end if;
end
$$;

-- SET-A2: an omitted Customer currency is resolved from the current company
-- main currency at Customer creation time. Existing Customer currency snapshots
-- are intentionally unchanged.
alter table public.customers alter column currency_code drop default;

create or replace function public.set_customer_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.customer_code is null or trim(new.customer_code) = '' then
    new.customer_code := 'CUS-' || lpad(nextval('public.customer_code_seq')::text, 6, '0');
  end if;
  new.customer_code := upper(trim(new.customer_code));

  if new.customer_type_id is null then
    select ct.id into new.customer_type_id
    from public.customer_types ct
    where ct.system_key = 'company' and ct.is_active = true
    limit 1;
  end if;

  if new.price_group_id is null then
    select pg.id into new.price_group_id
    from public.price_groups pg
    where pg.is_base_price = true and pg.is_active = true
    order by pg.sort_order
    limit 1;
  end if;

  if new.currency_code is null or btrim(new.currency_code) = '' then
    select upper(btrim(gs.default_currency))
    into new.currency_code
    from public.general_settings gs
    where gs.id = 1;
  else
    new.currency_code := upper(btrim(new.currency_code));
  end if;

  if new.currency_code is null or new.currency_code !~ '^[A-Z]{3}$' then
    raise exception 'Company main currency is unavailable or invalid.';
  end if;

  if new.country_code is not null then
    new.country_code := upper(trim(new.country_code));
  end if;
  if new.email is not null then
    new.email := lower(trim(new.email));
  end if;

  return new;
end;
$function$;

-- Remove the unreachable hard-coded Order currency fallback from the canonical
-- core function without duplicating its large business implementation. The
-- guarded replacement fails the migration if the upstream function drifted.
do $patch$
declare
  v_signature regprocedure := 'private.create_customer_order_core(uuid,jsonb,uuid,uuid,uuid,date,text,text,text,numeric,numeric,uuid,numeric,text)'::regprocedure;
  v_definition text;
  v_before constant text := $needle$select coalesce(c.currency_code, 'USD') into v_currency
  from public.customers c where c.id = p_customer_id;$needle$;
  v_after constant text := $replacement$select upper(btrim(c.currency_code)) into v_currency
  from public.customers c where c.id = p_customer_id;

  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Customer currency is unavailable or invalid.';
  end if;$replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_before in v_definition) = 0 then
    raise exception 'create_customer_order_core currency contract drifted; refusing unsafe patch.';
  end if;
  v_definition := replace(v_definition, v_before, v_after);
  execute v_definition;
end
$patch$;

-- SET-A4/SET-A2: Order numbering and missing transaction currency consume the
-- canonical singleton. Padding is a minimum width and never truncates a sequence.
create or replace function public.set_customer_order_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_default_currency varchar(3);
  v_prefix text;
  v_padding integer;
  v_administrative_fee numeric(7,3);
  v_sequence_value bigint;
  v_sequence_text text;
begin
  select upper(btrim(gs.default_currency)), gs.order_number_prefix, gs.order_number_padding, gs.administrative_fee_default_percent
  into v_default_currency, v_prefix, v_padding, v_administrative_fee
  from public.general_settings gs
  where gs.id = 1;

  if v_default_currency is null or v_default_currency !~ '^[A-Z]{3}$' then
    raise exception 'Company main currency is unavailable or invalid.';
  end if;
  if v_prefix is null or v_padding is null then
    raise exception 'Order numbering settings are unavailable.';
  end if;

  if new.order_number is null or trim(new.order_number) = '' then
    v_sequence_value := nextval('public.customer_order_number_seq');
    v_sequence_text := v_sequence_value::text;
    new.order_number := v_prefix || lpad(v_sequence_text, greatest(v_padding, length(v_sequence_text)), '0');
  end if;
  new.order_number := upper(trim(new.order_number));

  if new.currency_code is null or btrim(new.currency_code) = '' then
    new.currency_code := v_default_currency;
  else
    new.currency_code := upper(btrim(new.currency_code));
  end if;

  if new.administrative_fee_percent is null then
    if v_administrative_fee is null then
      raise exception 'Administrative Fee default is unavailable.';
    end if;
    new.administrative_fee_percent := v_administrative_fee;
  end if;

  return new;
end;
$function$;

create or replace function public.set_customer_invoice_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_default_currency varchar(3);
  v_prefix text;
  v_padding integer;
  v_sequence_value bigint;
  v_sequence_text text;
begin
  select upper(btrim(gs.default_currency)), gs.invoice_number_prefix, gs.invoice_number_padding
  into v_default_currency, v_prefix, v_padding
  from public.general_settings gs
  where gs.id = 1;

  if v_default_currency is null or v_default_currency !~ '^[A-Z]{3}$' then
    raise exception 'Company main currency is unavailable or invalid.';
  end if;
  if v_prefix is null or v_padding is null then
    raise exception 'Invoice numbering settings are unavailable.';
  end if;

  if new.invoice_number is null or trim(new.invoice_number) = '' then
    v_sequence_value := nextval('public.customer_invoice_number_seq');
    v_sequence_text := v_sequence_value::text;
    new.invoice_number := v_prefix || lpad(v_sequence_text, greatest(v_padding, length(v_sequence_text)), '0');
  end if;
  new.invoice_number := upper(trim(new.invoice_number));

  if new.currency_code is null or btrim(new.currency_code) = '' then
    new.currency_code := v_default_currency;
  else
    new.currency_code := upper(btrim(new.currency_code));
  end if;

  return new;
end;
$function$;

-- SET-A3: preserve fulfillment Tax Rule semantics and add actor-level audit.
alter table public.order_tax_rules
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create index if not exists order_tax_rules_created_by_idx on public.order_tax_rules(created_by) where created_by is not null;
create index if not exists order_tax_rules_updated_by_idx on public.order_tax_rules(updated_by) where updated_by is not null;

create or replace function private.touch_order_tax_rule()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_order_tax_rules_updated on public.order_tax_rules;
create trigger trg_order_tax_rules_updated
before insert or update on public.order_tax_rules
for each row execute function private.touch_order_tax_rule();

revoke all privileges on table public.order_tax_rules from anon;

-- SET-A1/A5: Store callers use narrow public wrappers. Canonical migrations must
-- also define the private implementations so clean databases do not depend on
-- production-only drift.
create schema if not exists store_api_private;
revoke all on schema store_api_private from public;

create or replace function store_api_private.get_store_public_profile()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select jsonb_build_object(
    'companyName', g.company_name,
    'legalName', g.legal_name,
    'logoUrl', g.logo_url,
    'email', g.email,
    'phone', g.phone,
    'website', g.website,
    'addressLine1', g.address_line_1,
    'addressLine2', g.address_line_2,
    'city', g.city,
    'stateRegion', g.state_region,
    'postalCode', g.postal_code,
    'countryCode', g.country_code,
    'locale', g.locale
  )
  from public.general_settings g
  where g.id = 1;
$function$;

create or replace function store_api_private.get_store_public_company_locations()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select jsonb_build_object(
    'contactChannels', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'channelType', c.channel_type,
            'label', c.label,
            'value', c.value,
            'href', c.href
          ) order by c.sort_order asc, c.label asc, c.id asc
        )
        from public.company_contact_channels c
        where c.is_active = true
      ),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'locationType', l.location_type,
            'name', l.name,
            'email', l.email,
            'phone', l.phone,
            'addressLine1', l.address_line_1,
            'addressLine2', l.address_line_2,
            'city', l.city,
            'stateRegion', l.state_region,
            'postalCode', l.postal_code,
            'countryCode', l.country_code,
            'mapUrl', l.map_url,
            'hours', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'dayOfWeek', h.day_of_week,
                    'opensAt', h.opens_at,
                    'closesAt', h.closes_at,
                    'isClosed', h.is_closed,
                    'note', h.note
                  ) order by h.day_of_week asc, h.id asc
                )
                from public.company_location_hours h
                where h.location_id = l.id
              ),
              '[]'::jsonb
            )
          ) order by l.sort_order asc, l.name asc, l.id asc
        )
        from public.company_locations l
        where l.is_active = true
      ),
      '[]'::jsonb
    )
  );
$function$;

revoke all on function store_api_private.get_store_public_profile() from public;
revoke all on function store_api_private.get_store_public_company_locations() from public;
revoke execute on function store_api_private.get_store_public_profile() from anon, authenticated;
revoke execute on function store_api_private.get_store_public_company_locations() from anon, authenticated;

create or replace function public.get_store_public_profile()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'store_api_private'
as $function$
  select store_api_private.get_store_public_profile();
$function$;

create or replace function public.get_store_public_company_locations()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'store_api_private'
as $function$
  select store_api_private.get_store_public_company_locations();
$function$;

revoke all on function public.get_store_public_profile() from public;
revoke all on function public.get_store_public_company_locations() from public;
grant execute on function public.get_store_public_profile() to anon, authenticated, service_role;
grant execute on function public.get_store_public_company_locations() to anon, authenticated, service_role;

comment on column public.general_settings.order_number_prefix is 'Canonical prefix for generated customer Order numbers.';
comment on column public.general_settings.order_number_padding is 'Canonical zero-padding minimum width for generated customer Order numbers.';
comment on column public.general_settings.invoice_number_prefix is 'Canonical prefix for generated customer Invoice numbers.';
comment on column public.general_settings.invoice_number_padding is 'Canonical zero-padding minimum width for generated customer Invoice numbers.';

commit;
