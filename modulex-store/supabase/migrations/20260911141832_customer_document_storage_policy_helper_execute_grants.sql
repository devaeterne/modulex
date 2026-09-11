revoke execute on function private.can_store_dealer_read_document_object(text, text) from public, anon;
revoke execute on function private.can_staff_mutate_customer_document_object(text, text) from public, anon;

grant execute on function private.can_store_dealer_read_document_object(text, text) to authenticated;
grant execute on function private.can_staff_mutate_customer_document_object(text, text) to authenticated;
