-- Allow Product Master / Countertop catalog mutations to maintain Stone profiles
-- through the existing SECURITY INVOKER RPCs without bypassing RLS.
-- Write access remains limited to authenticated super_admin/admin users.

alter table public.countertop_stone_product_profiles enable row level security;

drop policy if exists countertop_profile_admin_insert on public.countertop_stone_product_profiles;
create policy countertop_profile_admin_insert
on public.countertop_stone_product_profiles
for insert
to authenticated
with check (public.current_user_has_any_role(array['super_admin','admin']));

drop policy if exists countertop_profile_admin_update on public.countertop_stone_product_profiles;
create policy countertop_profile_admin_update
on public.countertop_stone_product_profiles
for update
to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']))
with check (public.current_user_has_any_role(array['super_admin','admin']));

drop policy if exists countertop_profile_admin_delete on public.countertop_stone_product_profiles;
create policy countertop_profile_admin_delete
on public.countertop_stone_product_profiles
for delete
to authenticated
using (public.current_user_has_any_role(array['super_admin','admin']));
