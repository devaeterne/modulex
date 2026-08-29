-- GC-5 production advisor hardening.
-- Keep one permissive SELECT policy per authenticated role/action while
-- preserving admin-only mutation access for project and project media tables.

drop policy if exists store_projects_admin_all on public.store_projects;
drop policy if exists store_projects_admin_insert on public.store_projects;
drop policy if exists store_projects_admin_update on public.store_projects;
drop policy if exists store_projects_admin_delete on public.store_projects;

create policy store_projects_admin_insert
on public.store_projects for insert to authenticated
with check ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])));

create policy store_projects_admin_update
on public.store_projects for update to authenticated
using ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])));

create policy store_projects_admin_delete
on public.store_projects for delete to authenticated
using ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])));

drop policy if exists store_project_media_admin_all on public.store_project_media;
drop policy if exists store_project_media_admin_insert on public.store_project_media;
drop policy if exists store_project_media_admin_update on public.store_project_media;
drop policy if exists store_project_media_admin_delete on public.store_project_media;

create policy store_project_media_admin_insert
on public.store_project_media for insert to authenticated
with check ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])));

create policy store_project_media_admin_update
on public.store_project_media for update to authenticated
using ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])));

create policy store_project_media_admin_delete
on public.store_project_media for delete to authenticated
using ((select private.store_current_user_has_any_role(array['super_admin', 'admin']::text[])));
