create index if not exists vendor_catalog_items_last_seen_run_id_idx
  on public.vendor_catalog_items (last_seen_run_id);

alter policy "project_participants_bounded_read"
on public.project_participants
to authenticated
using (
  exists (
    select 1
    from public.customer_projects cp
    where cp.id = project_participants.project_id
      and (
        cp.customer_id = (select auth.uid())
        or cp.created_by = (select auth.uid())
        or current_user_has_any_role(array['super_admin','admin','project_manager']::text[])
      )
  )
  or created_by = (select auth.uid())
);

drop policy if exists "store_pages_admin_all" on public.store_pages;
drop policy if exists "store_pages_admin_insert" on public.store_pages;
drop policy if exists "store_pages_admin_update" on public.store_pages;
drop policy if exists "store_pages_admin_delete" on public.store_pages;

create policy "store_pages_admin_insert"
on public.store_pages
for insert
to authenticated
with check (current_user_has_any_role(array['super_admin','admin']::text[]));

create policy "store_pages_admin_update"
on public.store_pages
for update
to authenticated
using (current_user_has_any_role(array['super_admin','admin']::text[]))
with check (current_user_has_any_role(array['super_admin','admin']::text[]));

create policy "store_pages_admin_delete"
on public.store_pages
for delete
to authenticated
using (current_user_has_any_role(array['super_admin','admin']::text[]));
