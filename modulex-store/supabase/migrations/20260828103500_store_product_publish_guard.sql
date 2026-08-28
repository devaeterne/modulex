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
      select 1
      from public.store_product_media m
      where m.product_content_id = new.id
        and m.media_type = 'image'
        and m.is_primary = true
    ) then
      raise exception 'Store product requires a primary image before publishing';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_store_product_publish_guard on public.store_product_content;
create trigger trg_store_product_publish_guard
before insert or update of is_published, short_description, description
on public.store_product_content
for each row
execute function private.validate_store_product_publish();
