-- Product Master UX v2 advisor hardening.
-- Keep the existing read semantics while preventing FOR ALL management policies
-- from also participating in authenticated SELECT evaluation.

create index if not exists product_types_default_uom_idx
on public.product_types(default_uom_id);

-- Units of measure: authenticated users retain the dedicated read policy;
-- only admins may insert/update reference data.
drop policy if exists product_master_uom_manage on public.units_of_measure;

drop policy if exists product_master_uom_insert on public.units_of_measure;
create policy product_master_uom_insert
on public.units_of_measure
for insert
to authenticated
with check (public.current_user_has_any_role(array['super_admin','admin']));

drop policy if exists product_master_uom_update on public.units_of_measure;
create policy product_master_uom_update
on public.units_of_measure
for update
to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']))
with check (public.current_user_has_any_role(array['super_admin','admin']));

-- Product types: authenticated users retain the dedicated read policy;
-- only admins may insert/update type capabilities.
drop policy if exists product_master_type_manage on public.product_types;

drop policy if exists product_master_type_insert on public.product_types;
create policy product_master_type_insert
on public.product_types
for insert
to authenticated
with check (public.current_user_has_any_role(array['super_admin','admin']));

drop policy if exists product_master_type_update on public.product_types;
create policy product_master_type_update
on public.product_types
for update
to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']))
with check (public.current_user_has_any_role(array['super_admin','admin']));

-- Allowed UOM relations are replaced transactionally by save_product_type_v2,
-- so INSERT/UPDATE/DELETE remain available to admins under RLS.
drop policy if exists product_master_allowed_uom_manage on public.product_type_allowed_uoms;

drop policy if exists product_master_allowed_uom_insert on public.product_type_allowed_uoms;
create policy product_master_allowed_uom_insert
on public.product_type_allowed_uoms
for insert
to authenticated
with check (public.current_user_has_any_role(array['super_admin','admin']));

drop policy if exists product_master_allowed_uom_update on public.product_type_allowed_uoms;
create policy product_master_allowed_uom_update
on public.product_type_allowed_uoms
for update
to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']))
with check (public.current_user_has_any_role(array['super_admin','admin']));

drop policy if exists product_master_allowed_uom_delete on public.product_type_allowed_uoms;
create policy product_master_allowed_uom_delete
on public.product_type_allowed_uoms
for delete
to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']));
