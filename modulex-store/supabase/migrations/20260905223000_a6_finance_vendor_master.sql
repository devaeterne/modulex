-- A6-F3A: Canonical Vendor/Supplier Master + Compliance.
-- Existing-system-first rules:
--   * Vendor Catalog vendor_code values remain integration/source identities, not AP identity.
--   * Existing procurement/invoice vendor_code + vendor_name_snapshot history is preserved.
--   * Compliance is warning metadata only; this package does not block Finance payments.
--   * F3B/F3C vendor bills/payments remain out of scope.

create schema if not exists private;

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  legal_name text not null,
  display_name text not null,
  normalized_name text not null,
  vendor_type text not null default 'supplier'
    check (vendor_type in ('supplier','contractor','service_provider','other')),
  status text not null default 'onboarding'
    check (status in ('onboarding','active','inactive')),
  default_currency_code varchar(3) null
    check (default_currency_code is null or (default_currency_code = upper(default_currency_code) and length(default_currency_code) = 3)),
  payment_term_id uuid null references public.payment_terms(id) on update cascade on delete restrict,
  remit_to_name text null,
  remit_address_line1 text null,
  remit_address_line2 text null,
  remit_city text null,
  remit_state_region text null,
  remit_postal_code text null,
  remit_country_code varchar(2) null
    check (remit_country_code is null or (remit_country_code = upper(remit_country_code) and length(remit_country_code) = 2)),
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_code_not_empty check (length(btrim(code)) > 0),
  constraint vendors_legal_name_not_empty check (length(btrim(legal_name)) > 0),
  constraint vendors_display_name_not_empty check (length(btrim(display_name)) > 0),
  constraint vendors_normalized_name_not_empty check (length(btrim(normalized_name)) > 0)
);

create unique index vendors_code_uidx on public.vendors(lower(code));
create index vendors_normalized_name_idx on public.vendors(normalized_name);
create index vendors_status_name_idx on public.vendors(status, display_name, id);
create index vendors_payment_term_idx on public.vendors(payment_term_id) where payment_term_id is not null;

create table public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on update cascade on delete restrict,
  contact_type text not null default 'primary'
    check (contact_type in ('primary','orders','billing','remittance','compliance','other')),
  name text not null,
  title text null,
  email text null,
  phone text null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_contacts_name_not_empty check (length(btrim(name)) > 0),
  constraint vendor_contacts_method_check check (
    nullif(btrim(coalesce(email,'')), '') is not null
    or nullif(btrim(coalesce(phone,'')), '') is not null
  )
);

create index vendor_contacts_vendor_idx on public.vendor_contacts(vendor_id, is_active, contact_type, name);
create unique index vendor_contacts_primary_type_uidx
  on public.vendor_contacts(vendor_id, contact_type)
  where is_primary and is_active;

create table public.vendor_source_identities (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on update cascade on delete restrict,
  source_system text not null
    check (source_system in ('vendor_catalog','procurement','vendor_invoice','legacy','manual')),
  source_code text not null,
  source_name_snapshot text null,
  is_primary boolean not null default false,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_source_identities_code_not_empty check (length(btrim(source_code)) > 0)
);

create unique index vendor_source_identities_source_uidx
  on public.vendor_source_identities(source_system, lower(source_code));
create index vendor_source_identities_vendor_idx
  on public.vendor_source_identities(vendor_id, source_system, source_code);

create table public.vendor_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on update cascade on delete restrict,
  document_type text not null check (document_type in ('w9','coi','license','other')),
  status text not null default 'pending'
    check (status in ('pending','valid','expired','rejected','not_required')),
  title text not null,
  document_number text null,
  issued_on date null,
  expires_on date null,
  verified_at timestamptz null,
  verified_by uuid null references public.profiles(id) on delete set null,
  storage_bucket text null,
  storage_path text null,
  file_name text null,
  mime_type text null,
  file_size_bytes bigint null check (file_size_bytes is null or file_size_bytes >= 0),
  notes text null,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_compliance_title_not_empty check (length(btrim(title)) > 0),
  constraint vendor_compliance_date_order check (expires_on is null or issued_on is null or expires_on >= issued_on),
  constraint vendor_compliance_storage_pair check (
    (storage_bucket is null and storage_path is null)
    or (nullif(btrim(coalesce(storage_bucket,'')), '') is not null and nullif(btrim(coalesce(storage_path,'')), '') is not null)
  )
);

create index vendor_compliance_vendor_type_idx
  on public.vendor_compliance_documents(vendor_id, document_type, is_active, created_at desc);
create index vendor_compliance_expiry_idx
  on public.vendor_compliance_documents(expires_on)
  where is_active and expires_on is not null;

create table public.vendor_audit_log (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on update cascade on delete restrict,
  action_type text not null,
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vendor_audit_action_not_empty check (length(btrim(action_type)) > 0)
);

create index vendor_audit_vendor_idx on public.vendor_audit_log(vendor_id, created_at desc);
create index vendor_audit_actor_idx on public.vendor_audit_log(actor_id, created_at desc) where actor_id is not null;

alter table public.vendors enable row level security;
alter table public.vendor_contacts enable row level security;
alter table public.vendor_source_identities enable row level security;
alter table public.vendor_compliance_documents enable row level security;
alter table public.vendor_audit_log enable row level security;

-- Preserve legacy vendor_code/vendor_name_snapshot columns and add only nullable canonical bridges.
alter table public.vendor_invoices add column if not exists vendor_id uuid;
alter table public.customer_project_procurement_commitments add column if not exists vendor_id uuid;
alter table public.finance_transaction_links add column if not exists vendor_id uuid;

do $block$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_vendor_id_fkey') then
    alter table public.vendor_invoices
      add constraint vendor_invoices_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_project_procurement_commitments_vendor_id_fkey') then
    alter table public.customer_project_procurement_commitments
      add constraint customer_project_procurement_commitments_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finance_transaction_links_vendor_id_fkey') then
    alter table public.finance_transaction_links
      add constraint finance_transaction_links_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on update cascade on delete restrict;
  end if;
end;
$block$;

create index if not exists vendor_invoices_vendor_id_idx on public.vendor_invoices(vendor_id) where vendor_id is not null;
create index if not exists customer_project_procurement_commitments_vendor_id_idx
  on public.customer_project_procurement_commitments(vendor_id) where vendor_id is not null;
create index if not exists finance_transaction_links_vendor_id_idx
  on public.finance_transaction_links(vendor_id, created_at) where vendor_id is not null;

alter table public.finance_transaction_links drop constraint if exists finance_transaction_links_context_check;
alter table public.finance_transaction_links
  add constraint finance_transaction_links_context_check check (
    project_id is not null or order_id is not null or customer_id is not null or employee_id is not null
    or vendor_id is not null
    or nullif(btrim(coalesce(vendor_code,'')), '') is not null
    or source_document_id is not null
  );

create or replace function private.normalize_vendor_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce($1,'')),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  );
$function$;

create or replace function private.vendor_write_audit(
  p_vendor_id uuid,
  p_action_type text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.vendor_audit_log(vendor_id, action_type, before_snapshot, after_snapshot, actor_id)
  values (p_vendor_id, btrim(p_action_type), p_before, p_after, auth.uid());
end;
$function$;

create or replace function private.vendor_compliance_state(p_vendor_id uuid, p_document_type text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc public.vendor_compliance_documents%rowtype;
begin
  select * into v_doc
  from public.vendor_compliance_documents d
  where d.vendor_id = p_vendor_id
    and d.document_type = p_document_type
    and d.is_active
  order by d.created_at desc, d.id desc
  limit 1;

  if v_doc.id is null then
    return 'missing';
  end if;
  if v_doc.status = 'not_required' then
    return 'not_required';
  end if;
  if v_doc.expires_on is not null and v_doc.expires_on < current_date then
    return 'expired';
  end if;
  return v_doc.status;
end;
$function$;

create or replace function private.get_vendors_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null,
  p_search text default null
)
returns table(
  id uuid,
  code text,
  legal_name text,
  display_name text,
  vendor_type text,
  status text,
  default_currency_code varchar,
  remit_city text,
  remit_state_region text,
  remit_country_code varchar,
  contact_count bigint,
  source_identity_count bigint,
  w9_status text,
  coi_status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  if p_status is not null and p_status not in ('onboarding','active','inactive') then
    raise exception 'Invalid vendor status filter.' using errcode = '22023';
  end if;

  return query
  select v.id,
         v.code,
         v.legal_name,
         v.display_name,
         v.vendor_type,
         v.status,
         v.default_currency_code,
         v.remit_city,
         v.remit_state_region,
         v.remit_country_code,
         (select count(*) from public.vendor_contacts c where c.vendor_id = v.id and c.is_active),
         (select count(*) from public.vendor_source_identities s where s.vendor_id = v.id),
         private.vendor_compliance_state(v.id, 'w9'),
         private.vendor_compliance_state(v.id, 'coi'),
         v.created_at,
         v.updated_at,
         count(*) over()
  from public.vendors v
  where (p_status is null or v.status = p_status)
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or v.code ilike '%' || btrim(p_search) || '%'
      or v.display_name ilike '%' || btrim(p_search) || '%'
      or v.legal_name ilike '%' || btrim(p_search) || '%'
    )
  order by case v.status when 'active' then 0 when 'onboarding' then 1 else 2 end,
           v.display_name,
           v.id
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.get_vendor_detail(p_vendor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_vendor public.vendors%rowtype;
begin
  perform private.finance_assert_view();
  select * into v_vendor from public.vendors where id = p_vendor_id;
  if v_vendor.id is null then
    raise exception 'Vendor not found.' using errcode = '23503';
  end if;

  return jsonb_build_object(
    'vendor', to_jsonb(v_vendor),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.is_primary desc, c.contact_type, c.name)
      from public.vendor_contacts c
      where c.vendor_id = p_vendor_id and c.is_active
    ), '[]'::jsonb),
    'source_identities', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.source_system, s.source_code)
      from public.vendor_source_identities s
      where s.vendor_id = p_vendor_id
    ), '[]'::jsonb),
    'compliance_documents', coalesce((
      select jsonb_agg(
        to_jsonb(d) || jsonb_build_object(
          'effective_status', case
            when d.status = 'not_required' then 'not_required'
            when d.expires_on is not null and d.expires_on < current_date then 'expired'
            else d.status
          end
        )
        order by d.document_type, d.created_at desc
      )
      from public.vendor_compliance_documents d
      where d.vendor_id = p_vendor_id and d.is_active
    ), '[]'::jsonb),
    'compliance_summary', jsonb_build_object(
      'w9', private.vendor_compliance_state(p_vendor_id, 'w9'),
      'coi', private.vendor_compliance_state(p_vendor_id, 'coi')
    )
  );
end;
$function$;

create or replace function private.get_vendor_source_candidates()
returns table(
  source_system text,
  source_code text,
  source_name_snapshot text,
  occurrence_count bigint,
  mapped_vendor_id uuid,
  mapped_vendor_code text,
  mapped_vendor_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();

  return query
  with candidates as (
    select 'vendor_catalog'::text as source_system,
           i.vendor_code::text as source_code,
           null::text as source_name_snapshot,
           count(*)::bigint as occurrence_count
    from public.vendor_catalog_items i
    where nullif(btrim(i.vendor_code),'') is not null
    group by i.vendor_code

    union all

    select 'procurement'::text,
           c.vendor_code::text,
           max(nullif(btrim(c.vendor_name_snapshot),''))::text,
           count(*)::bigint
    from public.customer_project_procurement_commitments c
    where nullif(btrim(c.vendor_code),'') is not null
    group by c.vendor_code

    union all

    select 'vendor_invoice'::text,
           i.vendor_code::text,
           max(nullif(btrim(i.vendor_name_snapshot),''))::text,
           count(*)::bigint
    from public.vendor_invoices i
    where nullif(btrim(i.vendor_code),'') is not null
    group by i.vendor_code
  )
  select c.source_system,
         c.source_code,
         c.source_name_snapshot,
         c.occurrence_count,
         s.vendor_id,
         v.code,
         v.display_name
  from candidates c
  left join public.vendor_source_identities s
    on s.source_system = c.source_system
   and lower(s.source_code) = lower(c.source_code)
  left join public.vendors v on v.id = s.vendor_id
  order by c.source_system, c.source_code;
end;
$function$;

create or replace function private.create_vendor(
  p_code text,
  p_legal_name text,
  p_display_name text,
  p_vendor_type text default 'supplier',
  p_status text default 'onboarding',
  p_default_currency_code text default null,
  p_payment_term_id uuid default null,
  p_remit_to_name text default null,
  p_remit_address_line1 text default null,
  p_remit_address_line2 text default null,
  p_remit_city text default null,
  p_remit_state_region text default null,
  p_remit_postal_code text default null,
  p_remit_country_code text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_normalized text;
  v_after jsonb;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_code,'')), '') is null then raise exception 'Vendor code is required.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_legal_name,'')), '') is null then raise exception 'Vendor legal name is required.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_display_name,'')), '') is null then raise exception 'Vendor display name is required.' using errcode='22023'; end if;
  if p_vendor_type not in ('supplier','contractor','service_provider','other') then raise exception 'Invalid vendor type.' using errcode='22023'; end if;
  if p_status not in ('onboarding','active','inactive') then raise exception 'Invalid vendor status.' using errcode='22023'; end if;

  v_normalized := private.normalize_vendor_name(p_legal_name);
  if v_normalized = '' then raise exception 'Vendor legal name cannot normalize to empty.' using errcode='22023'; end if;
  if exists (select 1 from public.vendors v where v.normalized_name = v_normalized) then
    raise exception 'Vendor with matching normalized name already exists; map source identity instead.' using errcode='23505';
  end if;

  insert into public.vendors(
    code, legal_name, display_name, normalized_name, vendor_type, status,
    default_currency_code, payment_term_id, remit_to_name, remit_address_line1,
    remit_address_line2, remit_city, remit_state_region, remit_postal_code,
    remit_country_code, notes, created_by, updated_by
  ) values (
    btrim(p_code), btrim(p_legal_name), btrim(p_display_name), v_normalized, p_vendor_type, p_status,
    case when nullif(btrim(coalesce(p_default_currency_code,'')), '') is null then null else upper(btrim(p_default_currency_code)) end,
    p_payment_term_id,
    nullif(btrim(coalesce(p_remit_to_name,'')), ''),
    nullif(btrim(coalesce(p_remit_address_line1,'')), ''),
    nullif(btrim(coalesce(p_remit_address_line2,'')), ''),
    nullif(btrim(coalesce(p_remit_city,'')), ''),
    nullif(btrim(coalesce(p_remit_state_region,'')), ''),
    nullif(btrim(coalesce(p_remit_postal_code,'')), ''),
    case when nullif(btrim(coalesce(p_remit_country_code,'')), '') is null then null else upper(btrim(p_remit_country_code)) end,
    nullif(btrim(coalesce(p_notes,'')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  select to_jsonb(v) into v_after from public.vendors v where v.id = v_id;
  perform private.vendor_write_audit(v_id, 'create', null, v_after);
  return v_id;
end;
$function$;

create or replace function private.update_vendor(
  p_vendor_id uuid,
  p_code text,
  p_legal_name text,
  p_display_name text,
  p_vendor_type text,
  p_default_currency_code text default null,
  p_payment_term_id uuid default null,
  p_remit_to_name text default null,
  p_remit_address_line1 text default null,
  p_remit_address_line2 text default null,
  p_remit_city text default null,
  p_remit_state_region text default null,
  p_remit_postal_code text default null,
  p_remit_country_code text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_normalized text;
begin
  perform private.finance_assert_manage();
  select to_jsonb(v) into v_before from public.vendors v where v.id = p_vendor_id for update;
  if v_before is null then raise exception 'Vendor not found.' using errcode='23503'; end if;
  if nullif(btrim(coalesce(p_code,'')), '') is null then raise exception 'Vendor code is required.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_legal_name,'')), '') is null then raise exception 'Vendor legal name is required.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_display_name,'')), '') is null then raise exception 'Vendor display name is required.' using errcode='22023'; end if;
  if p_vendor_type not in ('supplier','contractor','service_provider','other') then raise exception 'Invalid vendor type.' using errcode='22023'; end if;

  v_normalized := private.normalize_vendor_name(p_legal_name);
  if exists (select 1 from public.vendors v where v.normalized_name = v_normalized and v.id <> p_vendor_id) then
    raise exception 'Vendor with matching normalized name already exists; map source identity instead.' using errcode='23505';
  end if;

  update public.vendors
  set code = btrim(p_code),
      legal_name = btrim(p_legal_name),
      display_name = btrim(p_display_name),
      normalized_name = v_normalized,
      vendor_type = p_vendor_type,
      default_currency_code = case when nullif(btrim(coalesce(p_default_currency_code,'')), '') is null then null else upper(btrim(p_default_currency_code)) end,
      payment_term_id = p_payment_term_id,
      remit_to_name = nullif(btrim(coalesce(p_remit_to_name,'')), ''),
      remit_address_line1 = nullif(btrim(coalesce(p_remit_address_line1,'')), ''),
      remit_address_line2 = nullif(btrim(coalesce(p_remit_address_line2,'')), ''),
      remit_city = nullif(btrim(coalesce(p_remit_city,'')), ''),
      remit_state_region = nullif(btrim(coalesce(p_remit_state_region,'')), ''),
      remit_postal_code = nullif(btrim(coalesce(p_remit_postal_code,'')), ''),
      remit_country_code = case when nullif(btrim(coalesce(p_remit_country_code,'')), '') is null then null else upper(btrim(p_remit_country_code)) end,
      notes = nullif(btrim(coalesce(p_notes,'')), ''),
      updated_by = auth.uid(), updated_at = now()
  where id = p_vendor_id;

  select to_jsonb(v) into v_after from public.vendors v where v.id = p_vendor_id;
  perform private.vendor_write_audit(p_vendor_id, 'update', v_before, v_after);
  return p_vendor_id;
end;
$function$;

create or replace function private.set_vendor_status(p_vendor_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform private.finance_assert_manage();
  if p_status not in ('onboarding','active','inactive') then raise exception 'Invalid vendor status.' using errcode='22023'; end if;
  select to_jsonb(v) into v_before from public.vendors v where v.id = p_vendor_id for update;
  if v_before is null then raise exception 'Vendor not found.' using errcode='23503'; end if;
  update public.vendors set status = p_status, updated_by = auth.uid(), updated_at = now() where id = p_vendor_id;
  select to_jsonb(v) into v_after from public.vendors v where v.id = p_vendor_id;
  perform private.vendor_write_audit(p_vendor_id, 'status', v_before, v_after);
  return p_vendor_id;
end;
$function$;

create or replace function private.upsert_vendor_contact(
  p_vendor_id uuid,
  p_contact_id uuid default null,
  p_contact_type text default 'primary',
  p_name text default null,
  p_title text default null,
  p_email text default null,
  p_phone text default null,
  p_is_primary boolean default false,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  perform private.finance_assert_manage();
  if not exists (select 1 from public.vendors where id = p_vendor_id) then raise exception 'Vendor not found.' using errcode='23503'; end if;
  if p_contact_type not in ('primary','orders','billing','remittance','compliance','other') then raise exception 'Invalid vendor contact type.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_name,'')), '') is null then raise exception 'Vendor contact name is required.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_email,'')), '') is null and nullif(btrim(coalesce(p_phone,'')), '') is null then
    raise exception 'Vendor contact requires email or phone.' using errcode='22023';
  end if;

  if p_is_primary and p_is_active then
    update public.vendor_contacts
    set is_primary = false, updated_by = auth.uid(), updated_at = now()
    where vendor_id = p_vendor_id and contact_type = p_contact_type and is_primary and is_active
      and (p_contact_id is null or id <> p_contact_id);
  end if;

  if p_contact_id is null then
    insert into public.vendor_contacts(vendor_id, contact_type, name, title, email, phone, is_primary, is_active, created_by, updated_by)
    values (p_vendor_id, p_contact_type, btrim(p_name), nullif(btrim(coalesce(p_title,'')), ''), nullif(btrim(coalesce(p_email,'')), ''), nullif(btrim(coalesce(p_phone,'')), ''), p_is_primary, p_is_active, auth.uid(), auth.uid())
    returning id into v_id;
  else
    select to_jsonb(c) into v_before from public.vendor_contacts c where c.id = p_contact_id and c.vendor_id = p_vendor_id for update;
    if v_before is null then raise exception 'Vendor contact not found.' using errcode='23503'; end if;
    update public.vendor_contacts
    set contact_type = p_contact_type, name = btrim(p_name), title = nullif(btrim(coalesce(p_title,'')), ''),
        email = nullif(btrim(coalesce(p_email,'')), ''), phone = nullif(btrim(coalesce(p_phone,'')), ''),
        is_primary = p_is_primary, is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
    where id = p_contact_id;
    v_id := p_contact_id;
  end if;

  select to_jsonb(c) into v_after from public.vendor_contacts c where c.id = v_id;
  perform private.vendor_write_audit(p_vendor_id, 'contact_upsert', v_before, v_after);
  return v_id;
end;
$function$;

create or replace function private.map_vendor_source_identity(
  p_vendor_id uuid,
  p_source_system text,
  p_source_code text,
  p_source_name_snapshot text default null,
  p_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.vendor_source_identities%rowtype;
  v_id uuid;
  v_after jsonb;
begin
  perform private.finance_assert_manage();
  if not exists (select 1 from public.vendors where id = p_vendor_id) then raise exception 'Vendor not found.' using errcode='23503'; end if;
  if p_source_system not in ('vendor_catalog','procurement','vendor_invoice','legacy','manual') then raise exception 'Invalid vendor source system.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_source_code,'')), '') is null then raise exception 'Vendor source code is required.' using errcode='22023'; end if;

  select * into v_existing
  from public.vendor_source_identities s
  where s.source_system = p_source_system and lower(s.source_code) = lower(btrim(p_source_code))
  for update;

  if v_existing.id is not null and v_existing.vendor_id <> p_vendor_id then
    raise exception 'Vendor source identity is already mapped to another canonical vendor.' using errcode='23505';
  end if;

  if p_is_primary then
    update public.vendor_source_identities
    set is_primary = false, updated_by = auth.uid(), updated_at = now()
    where vendor_id = p_vendor_id and source_system = p_source_system and is_primary;
  end if;

  if v_existing.id is null then
    insert into public.vendor_source_identities(vendor_id, source_system, source_code, source_name_snapshot, is_primary, created_by, updated_by)
    values (p_vendor_id, p_source_system, btrim(p_source_code), nullif(btrim(coalesce(p_source_name_snapshot,'')), ''), p_is_primary, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.vendor_source_identities
    set source_name_snapshot = coalesce(nullif(btrim(coalesce(p_source_name_snapshot,'')), ''), source_name_snapshot),
        is_primary = p_is_primary, updated_by = auth.uid(), updated_at = now()
    where id = v_existing.id;
    v_id := v_existing.id;
  end if;

  -- Explicit mappings may safely bridge matching legacy rows while preserving snapshots.
  if p_source_system = 'procurement' then
    update public.customer_project_procurement_commitments
    set vendor_id = p_vendor_id
    where lower(vendor_code) = lower(btrim(p_source_code)) and vendor_id is null;
  elsif p_source_system = 'vendor_invoice' then
    update public.vendor_invoices
    set vendor_id = p_vendor_id
    where lower(vendor_code) = lower(btrim(p_source_code)) and vendor_id is null;
  end if;

  select to_jsonb(s) into v_after from public.vendor_source_identities s where s.id = v_id;
  perform private.vendor_write_audit(p_vendor_id, 'source_identity_map', null, v_after);
  return v_id;
end;
$function$;

create or replace function private.upsert_vendor_compliance_document(
  p_vendor_id uuid,
  p_document_id uuid default null,
  p_document_type text default 'other',
  p_status text default 'pending',
  p_title text default null,
  p_document_number text default null,
  p_issued_on date default null,
  p_expires_on date default null,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_notes text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_verified_at timestamptz;
  v_verified_by uuid;
begin
  perform private.finance_assert_manage();
  if not exists (select 1 from public.vendors where id = p_vendor_id) then raise exception 'Vendor not found.' using errcode='23503'; end if;
  if p_document_type not in ('w9','coi','license','other') then raise exception 'Invalid vendor compliance document type.' using errcode='22023'; end if;
  if p_status not in ('pending','valid','expired','rejected','not_required') then raise exception 'Invalid vendor compliance status.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_title,'')), '') is null then raise exception 'Compliance document title is required.' using errcode='22023'; end if;
  if p_expires_on is not null and p_issued_on is not null and p_expires_on < p_issued_on then raise exception 'Compliance expiry cannot precede issue date.' using errcode='22023'; end if;
  if (nullif(btrim(coalesce(p_storage_bucket,'')), '') is null) <> (nullif(btrim(coalesce(p_storage_path,'')), '') is null) then
    raise exception 'Compliance storage bucket/path must be supplied together.' using errcode='22023';
  end if;

  if p_status in ('valid','expired','rejected') then
    v_verified_at := now();
    v_verified_by := auth.uid();
  end if;

  if p_document_id is null then
    insert into public.vendor_compliance_documents(
      vendor_id, document_type, status, title, document_number, issued_on, expires_on,
      verified_at, verified_by, storage_bucket, storage_path, file_name, mime_type,
      file_size_bytes, notes, is_active, created_by, updated_by
    ) values (
      p_vendor_id, p_document_type, p_status, btrim(p_title), nullif(btrim(coalesce(p_document_number,'')), ''),
      p_issued_on, p_expires_on, v_verified_at, v_verified_by,
      nullif(btrim(coalesce(p_storage_bucket,'')), ''), nullif(btrim(coalesce(p_storage_path,'')), ''),
      nullif(btrim(coalesce(p_file_name,'')), ''), nullif(btrim(coalesce(p_mime_type,'')), ''),
      p_file_size_bytes, nullif(btrim(coalesce(p_notes,'')), ''), p_is_active, auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    select to_jsonb(d) into v_before from public.vendor_compliance_documents d where d.id = p_document_id and d.vendor_id = p_vendor_id for update;
    if v_before is null then raise exception 'Vendor compliance document not found.' using errcode='23503'; end if;
    update public.vendor_compliance_documents
    set document_type = p_document_type, status = p_status, title = btrim(p_title),
        document_number = nullif(btrim(coalesce(p_document_number,'')), ''), issued_on = p_issued_on,
        expires_on = p_expires_on, verified_at = v_verified_at, verified_by = v_verified_by,
        storage_bucket = nullif(btrim(coalesce(p_storage_bucket,'')), ''), storage_path = nullif(btrim(coalesce(p_storage_path,'')), ''),
        file_name = nullif(btrim(coalesce(p_file_name,'')), ''), mime_type = nullif(btrim(coalesce(p_mime_type,'')), ''),
        file_size_bytes = p_file_size_bytes, notes = nullif(btrim(coalesce(p_notes,'')), ''),
        is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
    where id = p_document_id;
    v_id := p_document_id;
  end if;

  select to_jsonb(d) into v_after from public.vendor_compliance_documents d where d.id = v_id;
  perform private.vendor_write_audit(p_vendor_id, 'compliance_upsert', v_before, v_after);
  return v_id;
end;
$function$;

-- Public authenticated RPC wrappers. Browser code never writes Vendor tables directly.
create or replace function public.get_vendors_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null,
  p_search text default null
)
returns table(
  id uuid, code text, legal_name text, display_name text, vendor_type text, status text,
  default_currency_code varchar, remit_city text, remit_state_region text, remit_country_code varchar,
  contact_count bigint, source_identity_count bigint, w9_status text, coi_status text,
  created_at timestamptz, updated_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_vendors_page($1,$2,$3,$4);
$function$;

create or replace function public.get_vendor_detail(p_vendor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_vendor_detail($1);
$function$;

create or replace function public.get_vendor_source_candidates()
returns table(
  source_system text, source_code text, source_name_snapshot text, occurrence_count bigint,
  mapped_vendor_id uuid, mapped_vendor_code text, mapped_vendor_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_vendor_source_candidates();
$function$;

create or replace function public.create_vendor(
  p_code text,
  p_legal_name text,
  p_display_name text,
  p_vendor_type text default 'supplier',
  p_status text default 'onboarding',
  p_default_currency_code text default null,
  p_payment_term_id uuid default null,
  p_remit_to_name text default null,
  p_remit_address_line1 text default null,
  p_remit_address_line2 text default null,
  p_remit_city text default null,
  p_remit_state_region text default null,
  p_remit_postal_code text default null,
  p_remit_country_code text default null,
  p_notes text default null
)
returns uuid language sql security definer set search_path = ''
as $function$
  select private.create_vendor($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);
$function$;

create or replace function public.update_vendor(
  p_vendor_id uuid,
  p_code text,
  p_legal_name text,
  p_display_name text,
  p_vendor_type text,
  p_default_currency_code text default null,
  p_payment_term_id uuid default null,
  p_remit_to_name text default null,
  p_remit_address_line1 text default null,
  p_remit_address_line2 text default null,
  p_remit_city text default null,
  p_remit_state_region text default null,
  p_remit_postal_code text default null,
  p_remit_country_code text default null,
  p_notes text default null
)
returns uuid language sql security definer set search_path = ''
as $function$
  select private.update_vendor($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);
$function$;

create or replace function public.set_vendor_status(p_vendor_id uuid, p_status text)
returns uuid language sql security definer set search_path = ''
as $function$ select private.set_vendor_status($1,$2); $function$;

create or replace function public.upsert_vendor_contact(
  p_vendor_id uuid,
  p_contact_id uuid default null,
  p_contact_type text default 'primary',
  p_name text default null,
  p_title text default null,
  p_email text default null,
  p_phone text default null,
  p_is_primary boolean default false,
  p_is_active boolean default true
)
returns uuid language sql security definer set search_path = ''
as $function$ select private.upsert_vendor_contact($1,$2,$3,$4,$5,$6,$7,$8,$9); $function$;

create or replace function public.map_vendor_source_identity(
  p_vendor_id uuid,
  p_source_system text,
  p_source_code text,
  p_source_name_snapshot text default null,
  p_is_primary boolean default false
)
returns uuid language sql security definer set search_path = ''
as $function$ select private.map_vendor_source_identity($1,$2,$3,$4,$5); $function$;

create or replace function public.upsert_vendor_compliance_document(
  p_vendor_id uuid,
  p_document_id uuid default null,
  p_document_type text default 'other',
  p_status text default 'pending',
  p_title text default null,
  p_document_number text default null,
  p_issued_on date default null,
  p_expires_on date default null,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_notes text default null,
  p_is_active boolean default true
)
returns uuid language sql security definer set search_path = ''
as $function$
  select private.upsert_vendor_compliance_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);
$function$;

-- No direct browser mutations. Historical inactive vendors remain readable through RPCs and FKs use DELETE RESTRICT.
revoke insert, update, delete, truncate on public.vendors from anon, authenticated;
revoke insert, update, delete, truncate on public.vendor_contacts from anon, authenticated;
revoke insert, update, delete, truncate on public.vendor_source_identities from anon, authenticated;
revoke insert, update, delete, truncate on public.vendor_compliance_documents from anon, authenticated;
revoke insert, update, delete, truncate on public.vendor_audit_log from anon, authenticated;
revoke select on public.vendors, public.vendor_contacts, public.vendor_source_identities, public.vendor_compliance_documents, public.vendor_audit_log from anon, authenticated;

revoke all on function private.normalize_vendor_name(text) from public, anon, authenticated, service_role;
revoke all on function private.vendor_write_audit(uuid,text,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.vendor_compliance_state(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.get_vendors_page(integer,integer,text,text) from public, anon, authenticated, service_role;
revoke all on function private.get_vendor_detail(uuid) from public, anon, authenticated, service_role;
revoke all on function private.get_vendor_source_candidates() from public, anon, authenticated, service_role;
revoke all on function private.create_vendor(text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.update_vendor(uuid,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.set_vendor_status(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.upsert_vendor_contact(uuid,uuid,text,text,text,text,text,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function private.map_vendor_source_identity(uuid,text,text,text,boolean) from public, anon, authenticated, service_role;
revoke all on function private.upsert_vendor_compliance_document(uuid,uuid,text,text,text,text,date,date,text,text,text,text,bigint,text,boolean) from public, anon, authenticated, service_role;

revoke execute on function public.get_vendors_page(integer,integer,text,text) from public, anon;
revoke execute on function public.get_vendor_detail(uuid) from public, anon;
revoke execute on function public.get_vendor_source_candidates() from public, anon;
revoke execute on function public.create_vendor(text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.update_vendor(uuid,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.set_vendor_status(uuid,text) from public, anon;
revoke execute on function public.upsert_vendor_contact(uuid,uuid,text,text,text,text,text,boolean,boolean) from public, anon;
revoke execute on function public.map_vendor_source_identity(uuid,text,text,text,boolean) from public, anon;
revoke execute on function public.upsert_vendor_compliance_document(uuid,uuid,text,text,text,text,date,date,text,text,text,text,bigint,text,boolean) from public, anon;

grant execute on function public.get_vendors_page(integer,integer,text,text) to authenticated, service_role;
grant execute on function public.get_vendor_detail(uuid) to authenticated, service_role;
grant execute on function public.get_vendor_source_candidates() to authenticated, service_role;
grant execute on function public.create_vendor(text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.update_vendor(uuid,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.set_vendor_status(uuid,text) to authenticated, service_role;
grant execute on function public.upsert_vendor_contact(uuid,uuid,text,text,text,text,text,boolean,boolean) to authenticated, service_role;
grant execute on function public.map_vendor_source_identity(uuid,text,text,text,boolean) to authenticated, service_role;
grant execute on function public.upsert_vendor_compliance_document(uuid,uuid,text,text,text,text,date,date,text,text,text,text,bigint,text,boolean) to authenticated, service_role;
