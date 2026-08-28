revoke update on public.store_leads from authenticated;
grant update (status, assigned_to, internal_notes) on public.store_leads to authenticated;
