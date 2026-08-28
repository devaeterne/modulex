alter table public.store_product_media
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;

create unique index if not exists idx_store_product_media_storage_object
  on public.store_product_media (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

create unique index if not exists idx_store_product_media_one_primary_image
  on public.store_product_media (product_content_id)
  where is_primary = true and media_type = 'image';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'store-media',
  'store-media',
  true,
  20971520,
  array['image/jpeg','image/png','image/webp','image/avif','application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists store_media_admin_insert on storage.objects;
create policy store_media_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-media'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_media_admin_update on storage.objects;
create policy store_media_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'store-media'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
)
with check (
  bucket_id = 'store-media'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);

drop policy if exists store_media_admin_delete on storage.objects;
create policy store_media_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-media'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('super_admin','admin')
  )
);
