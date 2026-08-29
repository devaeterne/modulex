alter table public.store_leads
  add column if not exists request_kind text not null default 'general_inquiry',
  add column if not exists project_type text,
  add column if not exists consultation_intent text,
  add column if not exists project_address text,
  add column if not exists project_city text,
  add column if not exists project_postal_code text,
  add column if not exists preferred_consultation_date date;

alter table public.store_leads drop constraint if exists store_leads_request_kind_check;
alter table public.store_leads add constraint store_leads_request_kind_check
  check (request_kind in ('general_inquiry', 'project_consultation'));

alter table public.store_leads drop constraint if exists store_leads_gc4_scope_check;
alter table public.store_leads add constraint store_leads_gc4_scope_check check (
  (lead_type = 'contact' and request_kind = 'project_consultation')
  or (
    request_kind = 'general_inquiry'
    and project_type is null
    and consultation_intent is null
    and project_address is null
    and project_city is null
    and project_postal_code is null
    and preferred_consultation_date is null
  )
);

create table if not exists public.store_lead_form_options (
  id uuid primary key default gen_random_uuid(),
  option_group text not null,
  option_key text not null,
  label text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint store_lead_form_options_group_check check (option_group in ('project_type', 'consultation_intent')),
  constraint store_lead_form_options_key_check check (option_key ~ '^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$' and char_length(option_key) between 1 and 64),
  constraint store_lead_form_options_label_check check (btrim(label) <> '' and char_length(label) <= 160),
  constraint store_lead_form_options_group_key_key unique (option_group, option_key)
);

create index if not exists idx_store_lead_form_options_public_order
  on public.store_lead_form_options (option_group, is_active, sort_order, label, id);

drop trigger if exists trg_store_lead_form_options_updated_at on public.store_lead_form_options;
create trigger trg_store_lead_form_options_updated_at
before update on public.store_lead_form_options
for each row execute function private.touch_store_updated_at();

alter table public.store_lead_form_options enable row level security;

revoke all on table public.store_lead_form_options from anon;
revoke all on table public.store_lead_form_options from authenticated;
grant select, insert, update, delete on table public.store_lead_form_options to authenticated;

drop policy if exists store_lead_form_options_admin_all on public.store_lead_form_options;
create policy store_lead_form_options_admin_all
on public.store_lead_form_options for all to authenticated
using ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])));

create schema if not exists store_api_private;
revoke all on schema store_api_private from public;

create or replace function store_api_private.get_store_public_lead_form_options()
returns table(option_group text, option_key text, label text, sort_order integer)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select o.option_group, o.option_key, o.label, o.sort_order
  from public.store_lead_form_options o
  where o.is_active = true
  order by o.option_group, o.sort_order, o.label, o.id;
$$;

revoke all on function store_api_private.get_store_public_lead_form_options() from public;
grant execute on function store_api_private.get_store_public_lead_form_options() to anon, authenticated, service_role;

create or replace function public.get_store_public_lead_form_options()
returns table(option_group text, option_key text, label text, sort_order integer)
language sql
stable
set search_path = pg_catalog, store_api_private
as $$
  select * from store_api_private.get_store_public_lead_form_options();
$$;

revoke all on function public.get_store_public_lead_form_options() from public;
grant execute on function public.get_store_public_lead_form_options() to anon, authenticated, service_role;

create or replace function store_api_private.submit_store_lead(p_payload jsonb)
returns table(id uuid, reference_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_payload->>'lead_type','contact')));
  v_request_kind text := lower(trim(coalesce(p_payload->>'request_kind','general_inquiry')));
  v_first text := trim(coalesce(p_payload->>'first_name',''));
  v_last text := trim(coalesce(p_payload->>'last_name',''));
  v_email text := lower(trim(coalesce(p_payload->>'email','')));
  v_country text := upper(trim(coalesce(p_payload->>'country_code','')));
  v_privacy boolean := coalesce((p_payload->>'privacy_accepted')::boolean, false);
  v_document_token text := lower(trim(coalesce(p_payload->>'document_upload_token','')));
  v_project_type text := nullif(lower(trim(coalesce(p_payload->>'project_type',''))), '');
  v_consultation_intent text := nullif(lower(trim(coalesce(p_payload->>'consultation_intent',''))), '');
  v_project_address text := nullif(trim(coalesce(p_payload->>'project_address','')), '');
  v_project_city text := nullif(trim(coalesce(p_payload->>'project_city','')), '');
  v_project_postal_code text := nullif(trim(coalesce(p_payload->>'project_postal_code','')), '');
  v_preferred_date_text text := nullif(trim(coalesce(p_payload->>'preferred_consultation_date','')), '');
  v_preferred_date date;
  v_has_project_fields boolean;
  v_id uuid;
  v_ref text;
begin
  if coalesce(trim(p_payload->>'website_hp'),'') <> '' then
    raise exception 'Unable to submit request';
  end if;

  if v_type not in ('contact','dealer_application') then
    raise exception 'Invalid request type';
  end if;
  if v_request_kind not in ('general_inquiry','project_consultation') then
    raise exception 'Invalid request kind';
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
  if v_document_token <> '' and (v_type <> 'dealer_application' or v_document_token !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid supporting document upload request';
  end if;

  if v_project_type is not null and (char_length(v_project_type) > 64 or v_project_type !~ '^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$') then
    raise exception 'Invalid project type';
  end if;
  if v_consultation_intent is not null and (char_length(v_consultation_intent) > 64 or v_consultation_intent !~ '^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$') then
    raise exception 'Invalid consultation intent';
  end if;
  if char_length(coalesce(v_project_address, '')) > 300 or char_length(coalesce(v_project_city, '')) > 160 or char_length(coalesce(v_project_postal_code, '')) > 32 then
    raise exception 'Project location is too long';
  end if;
  if v_preferred_date_text is not null then
    if v_preferred_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid preferred consultation date';
    end if;
    begin
      v_preferred_date := v_preferred_date_text::date;
    exception when others then
      raise exception 'Invalid preferred consultation date';
    end;
    if to_char(v_preferred_date, 'YYYY-MM-DD') <> v_preferred_date_text then
      raise exception 'Invalid preferred consultation date';
    end if;
  end if;

  v_has_project_fields := v_project_type is not null or v_consultation_intent is not null or v_project_address is not null or v_project_city is not null or v_project_postal_code is not null or v_preferred_date is not null;

  if v_type = 'dealer_application' and (v_request_kind <> 'general_inquiry' or v_has_project_fields) then
    raise exception 'Project consultation fields are not valid for dealer applications';
  end if;
  if v_type = 'contact' and v_request_kind = 'general_inquiry' and v_has_project_fields then
    raise exception 'Project consultation fields require project consultation request kind';
  end if;

  if v_type = 'contact' and v_request_kind = 'project_consultation' then
    if v_project_type is not null and not exists (
      select 1 from public.store_lead_form_options o
      where o.option_group = 'project_type' and o.option_key = v_project_type and o.is_active = true
    ) then
      raise exception 'Invalid or inactive project type';
    end if;
    if v_consultation_intent is not null and not exists (
      select 1 from public.store_lead_form_options o
      where o.option_group = 'consultation_intent' and o.option_key = v_consultation_intent and o.is_active = true
    ) then
      raise exception 'Invalid or inactive consultation intent';
    end if;
  end if;

  insert into public.store_leads (
    lead_type, request_kind, first_name, last_name, email, phone, company_name, company_website,
    country_code, city, address, business_type, has_showroom, sales_channels,
    estimated_annual_volume, product_interests, message, marketing_consent,
    privacy_accepted, source, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, landing_page, referrer, project_type, consultation_intent, project_address,
    project_city, project_postal_code, preferred_consultation_date, updated_by
  ) values (
    v_type,
    case when v_type = 'contact' then v_request_kind else 'general_inquiry' end,
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
    case when v_type = 'contact' and v_request_kind = 'project_consultation' then v_project_type else null end,
    case when v_type = 'contact' and v_request_kind = 'project_consultation' then v_consultation_intent else null end,
    case when v_type = 'contact' and v_request_kind = 'project_consultation' then v_project_address else null end,
    case when v_type = 'contact' and v_request_kind = 'project_consultation' then v_project_city else null end,
    case when v_type = 'contact' and v_request_kind = 'project_consultation' then v_project_postal_code else null end,
    case when v_type = 'contact' and v_request_kind = 'project_consultation' then v_preferred_date else null end,
    null
  )
  returning store_leads.id, store_leads.reference_code into v_id, v_ref;

  if v_document_token <> '' then
    insert into public.store_lead_document_upload_tokens(lead_id, token_hash)
    values (v_id, encode(extensions.digest(v_document_token, 'sha256'), 'hex'));
  end if;

  return query select v_id, v_ref;
end;
$$;

revoke all on function store_api_private.submit_store_lead(jsonb) from public;
grant execute on function store_api_private.submit_store_lead(jsonb) to anon, service_role;

create or replace function public.submit_store_lead(p_payload jsonb)
returns table(id uuid, reference_code text)
language sql
set search_path = pg_catalog, store_api_private
as $$
  select * from store_api_private.submit_store_lead($1);
$$;

revoke all on function public.submit_store_lead(jsonb) from public;
revoke execute on function public.submit_store_lead(jsonb) from authenticated;
grant execute on function public.submit_store_lead(jsonb) to anon, service_role;
