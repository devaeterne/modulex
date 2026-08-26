begin;

-- ============================================================
-- MODULEX US DEFAULTS + CONTACT INPUT VALIDATION
-- ============================================================

alter table public.warehouses
  alter column country set default 'United States';

create or replace function private.set_warehouse_country_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(new.country), '') is null then
    new.country := 'United States';
  end if;
  return new;
end;
$$;

revoke all on function private.set_warehouse_country_default()
from public, anon, authenticated;

drop trigger if exists trg_warehouses_country_default
on public.warehouses;

create trigger trg_warehouses_country_default
before insert on public.warehouses
for each row
execute function private.set_warehouse_country_default();

create or replace function private.is_valid_email(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_value is null
    or btrim(p_value) = ''
    or btrim(p_value) ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';
$$;

create or replace function private.is_valid_phone(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_value is null
    or btrim(p_value) = ''
    or (
      btrim(p_value) !~ '[A-Za-z]'
      and btrim(p_value) ~ '^[-+0-9().[:space:]]+$'
      and length(regexp_replace(p_value, '[^0-9]', '', 'g')) between 7 and 15
    );
$$;

create or replace function private.is_valid_http_url(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_value is null
    or btrim(p_value) = ''
    or btrim(p_value) ~* '^https?://[^[:space:]]+$';
$$;

create or replace function private.is_valid_email_list(p_value text)
returns boolean
language sql
immutable
set search_path = private, pg_catalog
as $$
  select
    p_value is null
    or btrim(p_value) = ''
    or not exists (
      select 1
      from regexp_split_to_table(p_value, E'[,;\\n]+') as part
      where btrim(part) <> ''
        and not private.is_valid_email(btrim(part))
    );
$$;

revoke all on function private.is_valid_email(text)
from public, anon, authenticated;
revoke all on function private.is_valid_phone(text)
from public, anon, authenticated;
revoke all on function private.is_valid_http_url(text)
from public, anon, authenticated;
revoke all on function private.is_valid_email_list(text)
from public, anon, authenticated;

create or replace function private.validate_contact_fields()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  case tg_table_name
    when 'customers' then
      new.email := nullif(lower(btrim(new.email)), '');
      new.phone := nullif(btrim(new.phone), '');
      new.website := nullif(btrim(new.website), '');

      if not private.is_valid_email(new.email) then
        raise exception 'INVALID_EMAIL: Enter a valid customer email address.' using errcode = '22023';
      end if;
      if not private.is_valid_phone(new.phone) then
        raise exception 'INVALID_PHONE: Customer phone must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;
      if not private.is_valid_http_url(new.website) then
        raise exception 'INVALID_URL: Customer website must start with http:// or https://.' using errcode = '22023';
      end if;

    when 'customer_contacts' then
      new.email := nullif(lower(btrim(new.email)), '');
      new.phone := nullif(btrim(new.phone), '');
      new.mobile := nullif(btrim(new.mobile), '');

      if not private.is_valid_email(new.email) then
        raise exception 'INVALID_EMAIL: Enter a valid contact email address.' using errcode = '22023';
      end if;
      if not private.is_valid_phone(new.phone) then
        raise exception 'INVALID_PHONE: Contact phone must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;
      if not private.is_valid_phone(new.mobile) then
        raise exception 'INVALID_PHONE: Contact mobile number must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;

    when 'customer_addresses' then
      new.phone := nullif(btrim(new.phone), '');
      if not private.is_valid_phone(new.phone) then
        raise exception 'INVALID_PHONE: Address phone must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;

    when 'profiles' then
      new.email := nullif(lower(btrim(new.email)), '');
      new.phone := nullif(btrim(new.phone), '');

      if not private.is_valid_email(new.email) then
        raise exception 'INVALID_EMAIL: Enter a valid profile email address.' using errcode = '22023';
      end if;
      if not private.is_valid_phone(new.phone) then
        raise exception 'INVALID_PHONE: Profile phone must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;

    when 'general_settings' then
      new.email := nullif(lower(btrim(new.email)), '');
      new.phone := nullif(btrim(new.phone), '');
      new.website := nullif(btrim(new.website), '');
      new.logo_url := nullif(btrim(new.logo_url), '');
      new.email_sender_email := nullif(lower(btrim(new.email_sender_email)), '');
      new.email_reply_to := nullif(lower(btrim(new.email_reply_to)), '');
      new.order_notification_emails := nullif(btrim(new.order_notification_emails), '');
      new.stock_notification_emails := nullif(btrim(new.stock_notification_emails), '');
      new.pricing_notification_emails := nullif(btrim(new.pricing_notification_emails), '');
      new.invoice_notification_emails := nullif(btrim(new.invoice_notification_emails), '');

      if not private.is_valid_email(new.email) then
        raise exception 'INVALID_EMAIL: Enter a valid company email address.' using errcode = '22023';
      end if;
      if not private.is_valid_phone(new.phone) then
        raise exception 'INVALID_PHONE: Company phone must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;
      if not private.is_valid_http_url(new.website) then
        raise exception 'INVALID_URL: Company website must start with http:// or https://.' using errcode = '22023';
      end if;
      if not private.is_valid_http_url(new.logo_url) then
        raise exception 'INVALID_URL: Logo URL must start with http:// or https://.' using errcode = '22023';
      end if;
      if not private.is_valid_email(new.email_sender_email) then
        raise exception 'INVALID_EMAIL: Enter a valid sender email address.' using errcode = '22023';
      end if;
      if not private.is_valid_email(new.email_reply_to) then
        raise exception 'INVALID_EMAIL: Enter a valid reply-to email address.' using errcode = '22023';
      end if;
      if not private.is_valid_email_list(new.order_notification_emails) then
        raise exception 'INVALID_EMAIL: Order notification recipients contain an invalid email address.' using errcode = '22023';
      end if;
      if not private.is_valid_email_list(new.stock_notification_emails) then
        raise exception 'INVALID_EMAIL: Stock notification recipients contain an invalid email address.' using errcode = '22023';
      end if;
      if not private.is_valid_email_list(new.pricing_notification_emails) then
        raise exception 'INVALID_EMAIL: Pricing notification recipients contain an invalid email address.' using errcode = '22023';
      end if;
      if not private.is_valid_email_list(new.invoice_notification_emails) then
        raise exception 'INVALID_EMAIL: Invoice notification recipients contain an invalid email address.' using errcode = '22023';
      end if;

    when 'customer_installations' then
      new.contact_phone := nullif(btrim(new.contact_phone), '');
      if not private.is_valid_phone(new.contact_phone) then
        raise exception 'INVALID_PHONE: Installation contact phone must contain 7 to 15 digits and cannot contain letters.' using errcode = '22023';
      end if;

    when 'customer_portal_users' then
      new.login_email := nullif(lower(btrim(new.login_email)), '');
      if not private.is_valid_email(new.login_email) then
        raise exception 'INVALID_EMAIL: Enter a valid portal login email address.' using errcode = '22023';
      end if;
  end case;

  return new;
end;
$$;

revoke all on function private.validate_contact_fields()
from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'customers',
    'customer_contacts',
    'customer_addresses',
    'profiles',
    'general_settings',
    'customer_installations',
    'customer_portal_users'
  ]
  loop
    execute format('drop trigger if exists trg_validate_contact_fields on public.%I', v_table);
    execute format(
      'create trigger trg_validate_contact_fields before insert or update on public.%I for each row execute function private.validate_contact_fields()',
      v_table
    );
  end loop;
end;
$$;

commit;
