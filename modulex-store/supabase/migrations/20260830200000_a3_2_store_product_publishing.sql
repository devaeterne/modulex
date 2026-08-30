-- A3.2: fail-closed Store publication and stable public URLs.
-- This migration changes guards only; it does not mutate product or content data.

create or replace function private.validate_store_product_publish()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.is_published then
    if nullif(btrim(coalesce(new.short_description, '')), '') is null
       and nullif(btrim(coalesce(new.description, '')), '') is null then
      raise exception 'Store product requires marketing copy before publishing';
    end if;

    if not exists (
      select 1 from public.products p
      where p.base_product_code = new.base_product_code
        and p.status = 'active'
    ) then
      raise exception 'Store product requires at least one active product variant before publishing';
    end if;

    if not exists (
      select 1 from public.store_product_media m
      where m.product_content_id = new.id
        and m.media_type = 'image'
        and m.is_primary = true
        and nullif(btrim(coalesce(m.alt_text, '')), '') is not null
    ) then
      raise exception 'Store product requires a primary image with alt text before publishing';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_store_product_publish_guard on public.store_product_content;
create trigger trg_store_product_publish_guard
before insert or update of is_published, short_description, description, base_product_code
on public.store_product_content
for each row
execute function private.validate_store_product_publish();

create or replace function private.validate_store_product_slug_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_published and new.slug is distinct from old.slug then
    raise exception 'Published Store product slug cannot change; unpublish it before changing the public slug';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_store_product_slug_change_guard on public.store_product_content;
create trigger trg_store_product_slug_change_guard
before update of slug on public.store_product_content
for each row
execute function private.validate_store_product_slug_change();

create or replace function private.validate_published_store_media_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  content_id uuid;
begin
  if tg_op = 'DELETE' then
    content_id := old.product_content_id;
  else
    content_id := new.product_content_id;
  end if;
  if exists (select 1 from public.store_product_content c where c.id = content_id and c.is_published)
     and not exists (
       select 1 from public.store_product_media m
       where m.product_content_id = content_id
         and m.media_type = 'image'
         and m.is_primary = true
         and nullif(btrim(coalesce(m.alt_text, '')), '') is not null
     ) then
    raise exception 'Published Store product requires a primary image with alt text';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_store_product_media_published_guard on public.store_product_media;
create trigger trg_store_product_media_published_guard
after update of product_content_id, media_type, is_primary, alt_text or delete
on public.store_product_media
for each row
execute function private.validate_published_store_media_state();
