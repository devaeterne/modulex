-- P1.5C: explicit Dealer document visibility, private Storage and read-only Dealer account.

alter table public.customer_documents
  add column if not exists portal_visible boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-documents',
  'customer-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.get_store_dealer_documents()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_documents jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true
     or v_context ->> 'portal_kind' <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'document_type', d.document_type,
      'file_name', d.file_name,
      'mime_type', d.mime_type,
      'file_size_bytes', d.file_size_bytes,
      'description', d.description,
      'created_at', d.created_at
    ) order by d.created_at desc
  ), '[]'::jsonb)
  into v_documents
  from public.customer_documents d
  where d.customer_id = v_customer_id
    and d.is_active = true
    and d.portal_visible = true
    and d.storage_bucket = 'customer-documents';

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'documents', v_documents);
end;
$$;

revoke all on function private.get_store_dealer_documents() from public;
revoke execute on function private.get_store_dealer_documents() from anon;
grant execute on function private.get_store_dealer_documents() to authenticated;

create or replace function public.get_store_dealer_documents()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_store_dealer_documents(); $$;

revoke all on function public.get_store_dealer_documents() from public;
revoke execute on function public.get_store_dealer_documents() from anon;
grant execute on function public.get_store_dealer_documents() to authenticated;

create or replace function private.get_store_dealer_document(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_document jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true
     or v_context ->> 'portal_kind' <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select jsonb_build_object(
    'id', d.id,
    'document_type', d.document_type,
    'file_name', d.file_name,
    'storage_bucket', d.storage_bucket,
    'storage_path', d.storage_path,
    'mime_type', d.mime_type,
    'file_size_bytes', d.file_size_bytes,
    'description', d.description,
    'created_at', d.created_at
  )
  into v_document
  from public.customer_documents d
  where d.id = p_document_id
    and d.customer_id = v_customer_id
    and d.is_active = true
    and d.portal_visible = true
    and d.storage_bucket = 'customer-documents'
  limit 1;

  if v_document is null then
    return jsonb_build_object('ok', false, 'reason', 'document_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'document', v_document);
end;
$$;

revoke all on function private.get_store_dealer_document(uuid) from public;
revoke execute on function private.get_store_dealer_document(uuid) from anon;
grant execute on function private.get_store_dealer_document(uuid) to authenticated;

create or replace function public.get_store_dealer_document(p_document_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_store_dealer_document(p_document_id); $$;

revoke all on function public.get_store_dealer_document(uuid) from public;
revoke execute on function public.get_store_dealer_document(uuid) from anon;
grant execute on function public.get_store_dealer_document(uuid) to authenticated;

create or replace function private.get_store_dealer_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_pricing jsonb := private.get_store_dealer_pricing_context();
  v_customer_id uuid;
  v_account jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true
     or v_context ->> 'portal_kind' <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  select jsonb_build_object(
    'name', c.name,
    'email', c.email,
    'phone', c.phone,
    'website', c.website,
    'country_code', c.country_code,
    'currency_code', c.currency_code,
    'customer_since', c.customer_since,
    'price_group_name', case
      when coalesce((v_pricing ->> 'pricing_enabled')::boolean, false)
        then v_pricing ->> 'price_group_name'
      else null
    end,
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'address_name', a.address_name,
        'company_name', a.company_name,
        'contact_name', a.contact_name,
        'address_line_1', a.address_line_1,
        'address_line_2', a.address_line_2,
        'postal_code', a.postal_code,
        'city', a.city,
        'state_region', a.state_region,
        'country_code', a.country_code,
        'phone', a.phone,
        'address_type', a.address_type,
        'is_default_billing', a.is_default_billing,
        'is_default_shipping', a.is_default_shipping
      ) order by a.is_default_shipping desc, a.is_default_billing desc, a.address_name)
      from public.customer_addresses a
      where a.customer_id = c.id and a.is_active = true
    ), '[]'::jsonb)
  )
  into v_account
  from public.customers c
  where c.id = v_customer_id
  limit 1;

  if v_account is null then
    return jsonb_build_object('ok', false, 'reason', 'account_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'authorized', 'account', v_account);
end;
$$;

revoke all on function private.get_store_dealer_account() from public;
revoke execute on function private.get_store_dealer_account() from anon;
grant execute on function private.get_store_dealer_account() to authenticated;

create or replace function public.get_store_dealer_account()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_store_dealer_account(); $$;

revoke all on function public.get_store_dealer_account() from public;
revoke execute on function public.get_store_dealer_account() from anon;
grant execute on function public.get_store_dealer_account() to authenticated;

-- Storage staff access for the private customer document bucket.
drop policy if exists customer_documents_staff_select on storage.objects;
create policy customer_documents_staff_select on storage.objects
for select to authenticated
using (
  bucket_id = 'customer-documents'
  and public.current_user_has_any_role(array['super_admin','admin','sales','finance'])
);

drop policy if exists customer_documents_staff_insert on storage.objects;
create policy customer_documents_staff_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'customer-documents'
  and public.current_user_has_any_role(array['super_admin','admin','sales'])
);

drop policy if exists customer_documents_staff_update on storage.objects;
create policy customer_documents_staff_update on storage.objects
for update to authenticated
using (
  bucket_id = 'customer-documents'
  and public.current_user_has_any_role(array['super_admin','admin','sales'])
)
with check (
  bucket_id = 'customer-documents'
  and public.current_user_has_any_role(array['super_admin','admin','sales'])
);

drop policy if exists customer_documents_staff_delete on storage.objects;
create policy customer_documents_staff_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'customer-documents'
  and public.current_user_has_any_role(array['super_admin','admin','sales'])
);

-- Dealers may read Storage objects only when matching active, explicitly visible
-- metadata belongs to the Dealer customer derived from auth.uid().
drop policy if exists customer_documents_dealer_select on storage.objects;
create policy customer_documents_dealer_select on storage.objects
for select to authenticated
using (
  bucket_id = 'customer-documents'
  and exists (
    select 1
    from public.customer_documents d
    where d.storage_bucket = storage.objects.bucket_id
      and d.storage_path = storage.objects.name
      and d.is_active = true
      and d.portal_visible = true
      and d.customer_id = (private.get_store_portal_context() ->> 'customer_id')::uuid
      and private.get_store_portal_context() ->> 'portal_kind' = 'dealer'
  )
);
