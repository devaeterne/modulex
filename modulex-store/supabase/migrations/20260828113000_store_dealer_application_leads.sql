create sequence if not exists public.store_lead_reference_seq;

create table if not exists public.store_leads (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'LD-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.store_lead_reference_seq')::text, 6, '0')
  ),
  lead_type text not null check (lead_type in ('contact','dealer_application')),
  status text not null default 'new' check (status in ('new','under_review','contacted','qualified','approved','rejected','closed')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  company_name text,
  company_website text,
  country_code varchar(2),
  city text,
  address text,
  business_type text,
  has_showroom boolean,
  sales_channels text[] not null default '{}',
  estimated_annual_volume text,
  product_interests text[] not null default '{}',
  message text,
  marketing_consent boolean not null default false,
  privacy_accepted boolean not null default false,
  source text not null default 'website',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_page text,
  referrer text,
  assigned_to uuid references public.profiles(id) on delete set null,
  internal_notes text,
  converted_customer_id uuid references public.customers(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint store_leads_email_length check (char_length(email) between 3 and 320),
  constraint store_leads_name_length check (char_length(first_name) between 1 and 120 and char_length(last_name) between 1 and 120),
  constraint store_leads_message_length check (message is null or char_length(message) <= 5000),
  constraint store_leads_country_code check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

create index if not exists idx_store_leads_created_at on public.store_leads(created_at desc);
create index if not exists idx_store_leads_status_created on public.store_leads(status, created_at desc);
create index if not exists idx_store_leads_type_created on public.store_leads(lead_type, created_at desc);
create index if not exists idx_store_leads_assigned_to on public.store_leads(assigned_to) where assigned_to is not null;
create index if not exists idx_store_leads_converted_customer on public.store_leads(converted_customer_id) where converted_customer_id is not null;
create index if not exists idx_store_leads_email_lower on public.store_leads(lower(email));

create table if not exists public.store_lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.store_leads(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_lead_activity_lead_created on public.store_lead_activity(lead_id, created_at desc);
create index if not exists idx_store_lead_activity_actor on public.store_lead_activity(actor_user_id) where actor_user_id is not null;

alter table public.store_leads enable row level security;
alter table public.store_lead_activity enable row level security;

revoke all on public.store_leads from anon;
revoke all on public.store_lead_activity from anon;
revoke all on sequence public.store_lead_reference_seq from anon;

grant select, insert, update on public.store_leads to authenticated;
grant select on public.store_lead_activity to authenticated;

create policy store_leads_staff_select
on public.store_leads for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales']::text[]));

create policy store_leads_staff_insert
on public.store_leads for insert to authenticated
with check (public.current_user_has_any_role(array['super_admin','admin','sales']::text[]));

create policy store_leads_staff_update
on public.store_leads for update to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales']::text[]))
with check (public.current_user_has_any_role(array['super_admin','admin','sales']::text[]));

create policy store_leads_admin_delete
on public.store_leads for delete to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']::text[]));

create policy store_lead_activity_staff_select
on public.store_lead_activity for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales']::text[]));

create or replace function public.store_leads_set_updated_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  if new.status in ('approved','rejected','closed') and old.status is distinct from new.status then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_store_leads_updated_metadata
before update on public.store_leads
for each row execute function public.store_leads_set_updated_metadata();

create or replace function public.store_leads_log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.store_lead_activity(lead_id, action, to_status, actor_user_id)
    values (new.id, 'created', new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.store_lead_activity(lead_id, action, from_status, to_status, actor_user_id)
    values (new.id, 'status_changed', old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_store_leads_activity
after insert or update on public.store_leads
for each row execute function public.store_leads_log_activity();

create or replace function public.submit_store_lead(p_payload jsonb)
returns table(id uuid, reference_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_payload->>'lead_type','contact')));
  v_first text := trim(coalesce(p_payload->>'first_name',''));
  v_last text := trim(coalesce(p_payload->>'last_name',''));
  v_email text := lower(trim(coalesce(p_payload->>'email','')));
  v_country text := upper(trim(coalesce(p_payload->>'country_code','')));
  v_privacy boolean := coalesce((p_payload->>'privacy_accepted')::boolean, false);
  v_id uuid;
  v_ref text;
begin
  if coalesce(trim(p_payload->>'website_hp'),'') <> '' then
    raise exception 'Unable to submit request';
  end if;

  if v_type not in ('contact','dealer_application') then
    raise exception 'Invalid request type';
  end if;
  if char_length(v_first) < 1 or char_length(v_first) > 120 or char_length(v_last) < 1 or char_length(v_last) > 120 then
    raise exception 'First and last name are required';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Valid email is required';
  end if;
  if not v_privacy then
    raise exception 'Privacy acknowledgement is required';
  end if;
  if v_country <> '' and v_country !~ '^[A-Z]{2}$' then
    raise exception 'Country code must be two letters';
  end if;
  if v_type = 'dealer_application' and coalesce(trim(p_payload->>'company_name'),'') = '' then
    raise exception 'Company name is required for dealer applications';
  end if;
  if char_length(coalesce(p_payload->>'message','')) > 5000 then
    raise exception 'Message is too long';
  end if;

  insert into public.store_leads (
    lead_type, first_name, last_name, email, phone, company_name, company_website,
    country_code, city, address, business_type, has_showroom, sales_channels,
    estimated_annual_volume, product_interests, message, marketing_consent,
    privacy_accepted, source, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, landing_page, referrer, updated_by
  ) values (
    v_type,
    v_first,
    v_last,
    v_email,
    nullif(left(trim(coalesce(p_payload->>'phone','')), 80), ''),
    nullif(left(trim(coalesce(p_payload->>'company_name','')), 200), ''),
    nullif(left(trim(coalesce(p_payload->>'company_website','')), 500), ''),
    nullif(v_country, ''),
    nullif(left(trim(coalesce(p_payload->>'city','')), 160), ''),
    nullif(left(trim(coalesce(p_payload->>'address','')), 500), ''),
    nullif(left(trim(coalesce(p_payload->>'business_type','')), 160), ''),
    case when p_payload ? 'has_showroom' then (p_payload->>'has_showroom')::boolean else null end,
    coalesce(array(select left(value, 120) from jsonb_array_elements_text(coalesce(p_payload->'sales_channels','[]'::jsonb)) value limit 20), '{}'),
    nullif(left(trim(coalesce(p_payload->>'estimated_annual_volume','')), 160), ''),
    coalesce(array(select left(value, 120) from jsonb_array_elements_text(coalesce(p_payload->'product_interests','[]'::jsonb)) value limit 30), '{}'),
    nullif(trim(coalesce(p_payload->>'message','')), ''),
    coalesce((p_payload->>'marketing_consent')::boolean, false),
    true,
    coalesce(nullif(left(trim(coalesce(p_payload->>'source','')), 80), ''), 'website'),
    nullif(left(trim(coalesce(p_payload->>'utm_source','')), 255), ''),
    nullif(left(trim(coalesce(p_payload->>'utm_medium','')), 255), ''),
    nullif(left(trim(coalesce(p_payload->>'utm_campaign','')), 255), ''),
    nullif(left(trim(coalesce(p_payload->>'utm_content','')), 255), ''),
    nullif(left(trim(coalesce(p_payload->>'utm_term','')), 255), ''),
    nullif(left(trim(coalesce(p_payload->>'landing_page','')), 1000), ''),
    nullif(left(trim(coalesce(p_payload->>'referrer','')), 1000), ''),
    null
  )
  returning store_leads.id, store_leads.reference_code into v_id, v_ref;

  return query select v_id, v_ref;
end;
$$;

revoke all on function public.submit_store_lead(jsonb) from public;
grant execute on function public.submit_store_lead(jsonb) to anon, authenticated;
