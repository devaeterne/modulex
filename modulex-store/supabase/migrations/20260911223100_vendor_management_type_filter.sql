-- Add Vendor Type filtering to paginated Vendor Management without changing
-- the canonical vendor master or removing the existing 4-argument RPC.

create or replace function private.get_vendors_page(
  p_limit integer,
  p_offset integer,
  p_status text,
  p_search text,
  p_vendor_type text
)
returns table(
  id uuid,
  code text,
  legal_name text,
  display_name text,
  vendor_type text,
  status text,
  default_currency_code character varying,
  remit_city text,
  remit_state_region text,
  remit_country_code character varying,
  contact_count bigint,
  source_identity_count bigint,
  w9_status text,
  coi_status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.finance_assert_view();
  if p_status is not null and p_status not in ('onboarding','active','inactive') then
    raise exception 'Invalid vendor status filter.' using errcode = '22023';
  end if;
  if p_vendor_type is not null and p_vendor_type not in ('supplier','contractor','service_provider','other') then
    raise exception 'Invalid vendor type filter.' using errcode = '22023';
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
    and (p_vendor_type is null or v.vendor_type = p_vendor_type)
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
$$;

revoke all on function private.get_vendors_page(integer,integer,text,text,text) from public, anon, authenticated;

create or replace function public.get_vendors_page(
  p_limit integer,
  p_offset integer,
  p_status text,
  p_search text,
  p_vendor_type text
)
returns table(
  id uuid,
  code text,
  legal_name text,
  display_name text,
  vendor_type text,
  status text,
  default_currency_code character varying,
  remit_city text,
  remit_state_region text,
  remit_country_code character varying,
  contact_count bigint,
  source_identity_count bigint,
  w9_status text,
  coi_status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_vendors_page($1,$2,$3,$4,$5);
$$;

revoke all on function public.get_vendors_page(integer,integer,text,text,text) from public, anon;
grant execute on function public.get_vendors_page(integer,integer,text,text,text) to authenticated;

comment on function public.get_vendors_page(integer,integer,text,text,text) is
  'Paginated canonical Vendor list with optional status, search and Vendor Type filters for Vendor Management.';
