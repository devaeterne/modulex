-- Finance role: read branding required by financial documents and manage
-- tax rules / payment methods. Applied to production as migration:
-- finance_financial_settings_access

drop policy if exists general_settings_read on public.general_settings;
create policy general_settings_read on public.general_settings
for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance'])));

drop policy if exists order_tax_rules_write_admin on public.order_tax_rules;
create policy order_tax_rules_write_admin on public.order_tax_rules
for all to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','finance']))
with check (public.current_user_has_any_role(array['super_admin','admin','finance']));

drop policy if exists payment_methods_insert on public.payment_methods;
create policy payment_methods_insert on public.payment_methods
for insert to authenticated
with check ((select public.current_user_has_any_role(array['super_admin','admin','finance'])));

drop policy if exists payment_methods_update on public.payment_methods;
create policy payment_methods_update on public.payment_methods
for update to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance'])))
with check ((select public.current_user_has_any_role(array['super_admin','admin','finance'])));

drop policy if exists payment_methods_delete on public.payment_methods;
create policy payment_methods_delete on public.payment_methods
for delete to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance'])));
