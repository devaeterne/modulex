create or replace function private.can_delete_unregistered_entity_document_object(
  p_bucket_id text,
  p_object_name text
)
returns boolean
language sql
stable
set search_path to ''
as $function$
  -- Keep the existing helper name for Storage policy compatibility. A private
  -- object may be removed only by an authorized mutator and only when there is
  -- no active entity-document registration for that exact bucket/path. This
  -- covers both failed-upload orphans and documents that were deactivated first.
  select p_bucket_id = 'entity-documents'
    and private.is_entity_document_mutator()
    and not exists (
      select 1
      from public.entity_documents d
      where d.storage_bucket = p_bucket_id
        and d.storage_path = p_object_name
        and d.is_active = true
    );
$function$;

revoke all on function private.can_delete_unregistered_entity_document_object(text, text) from public;
revoke execute on function private.can_delete_unregistered_entity_document_object(text, text) from anon;
grant execute on function private.can_delete_unregistered_entity_document_object(text, text) to authenticated;
