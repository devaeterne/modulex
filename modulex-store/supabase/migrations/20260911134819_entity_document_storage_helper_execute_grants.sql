-- Restore only the authenticated EXECUTE privileges required by the
-- entity-documents Storage RLS policies. The helpers remain private,
-- SECURITY INVOKER, role-guarded, and unavailable to PUBLIC/anon.

grant execute on function private.can_upload_entity_document_object(text, text) to authenticated;
grant execute on function private.can_read_entity_document_object(text, text) to authenticated;
grant execute on function private.can_delete_unregistered_entity_document_object(text, text) to authenticated;
