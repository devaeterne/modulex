/* Vendor Catalog Sync hardening.
 * Explicit Data API grants are required for modern Supabase projects.
 * Store publication must only accept an active, currently-effective Modulex price.
 */

grant select, insert, update, delete on public.vendor_catalog_runs to service_role;
grant select, insert, update, delete on public.vendor_catalog_items to service_role;
grant select, insert, update, delete on public.vendor_catalog_snapshots to service_role;
grant select, insert, update, delete on public.vendor_catalog_assets to service_role;

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
      select 1
      from public.products p
      join public.product_prices pp on pp.product_id = p.id
      where p.base_product_code = new.base_product_code
        and p.status = 'active'
        and pp.is_active = true
        and pp.amount > 0
        and pp.valid_from <= now()
        and (pp.valid_to is null or pp.valid_to > now())
    ) then
      raise exception 'Store product requires an active Modulex selling price greater than zero before publishing';
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

revoke all on function private.validate_store_product_publish() from public, anon, authenticated;
