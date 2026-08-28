drop policy if exists store_product_media_admin_all on public.store_product_media;
create policy store_product_media_admin_insert
on public.store_product_media for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_product_media_admin_update
on public.store_product_media for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_product_media_admin_delete
on public.store_product_media for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_color_options_admin_all on public.store_color_options;
create policy store_color_options_admin_insert
on public.store_color_options for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_color_options_admin_update
on public.store_color_options for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
create policy store_color_options_admin_delete
on public.store_color_options for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

create index if not exists idx_store_product_content_created_by
  on public.store_product_content(created_by) where created_by is not null;
create index if not exists idx_store_product_content_updated_by
  on public.store_product_content(updated_by) where updated_by is not null;
create index if not exists idx_store_product_media_created_by
  on public.store_product_media(created_by) where created_by is not null;
create index if not exists idx_store_product_media_updated_by
  on public.store_product_media(updated_by) where updated_by is not null;
create index if not exists idx_store_color_options_updated_by
  on public.store_color_options(updated_by) where updated_by is not null;
