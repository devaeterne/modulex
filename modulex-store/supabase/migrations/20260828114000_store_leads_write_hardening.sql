revoke insert, delete on public.store_leads from authenticated;
revoke execute on function public.submit_store_lead(jsonb) from authenticated;

drop policy if exists store_leads_staff_insert on public.store_leads;
drop policy if exists store_leads_admin_delete on public.store_leads;
