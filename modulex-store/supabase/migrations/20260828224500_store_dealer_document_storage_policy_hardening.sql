-- P1.5C hotfix: authorize private Storage objects without depending on
-- staff-only customer_documents RLS inside the storage.objects policy.

create or replace function private.can_store_dealer_read_document_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
begin
  if p_bucket_id <> 'customer-documents'
     or coalesce((v_context ->> 'ok')::boolean, false) is not true
     or v_context ->> 'portal_kind' <> 'dealer' then
    return false;
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;

  return exists (
    select 1
    from public.customer_documents d
    where d.customer_id = v_customer_id
      and d.storage_bucket = p_bucket_id
      and d.storage_path = p_storage_path
      and d.is_active = true
      and d.portal_visible = true
  );
end;
$$;

revoke all on function private.can_store_dealer_read_document_object(text, text) from public;
revoke execute on function private.can_store_dealer_read_document_object(text, text) from anon;
grant execute on function private.can_store_dealer_read_document_object(text, text) to authenticated;

drop policy if exists customer_documents_dealer_select on storage.objects;
create policy customer_documents_dealer_select on storage.objects
for select to authenticated
using (
  private.can_store_dealer_read_document_object(bucket_id, name)
);
