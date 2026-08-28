revoke execute on function public.get_store_dealer_portal_context() from anon;
revoke execute on function public.get_store_dealer_portal_context() from public;
grant execute on function public.get_store_dealer_portal_context() to authenticated;

revoke execute on function private.current_store_dealer_customer_id() from anon;
revoke execute on function private.get_store_dealer_portal_context() from anon;
