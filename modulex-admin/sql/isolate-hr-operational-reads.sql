drop policy if exists inventory_select_authenticated on public.inventory;
create policy inventory_select_authenticated on public.inventory for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists products_select_authenticated on public.products;
create policy products_select_authenticated on public.products for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists warehouses_select_authenticated on public.warehouses;
create policy warehouses_select_authenticated on public.warehouses for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists zones_select_authenticated on public.zones;
create policy zones_select_authenticated on public.zones for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists locations_select_authenticated on public.locations;
create policy locations_select_authenticated on public.locations for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists "Allow authenticated read product brands" on public.product_brands;
create policy "Allow authenticated read product brands" on public.product_brands for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists "Allow authenticated read product categories" on public.product_categories;
create policy "Allow authenticated read product categories" on public.product_categories for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists customer_types_read on public.customer_types;
create policy customer_types_read on public.customer_types for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists payment_terms_read on public.payment_terms;
create policy payment_terms_read on public.payment_terms for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));

drop policy if exists notification_delivery_rules_read on public.notification_delivery_rules;
create policy notification_delivery_rules_read on public.notification_delivery_rules for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']));
