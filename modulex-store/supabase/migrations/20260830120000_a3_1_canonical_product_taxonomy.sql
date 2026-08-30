-- A3.1: Store product projections must use canonical taxonomy foreign keys.
-- This migration only replaces read-only RPC definitions; it does not mutate data.

create or replace function public.get_store_catalog_products(
  p_query text default null,
  p_color_code text default null,
  p_limit integer default 48,
  p_offset integer default 0
)
returns table (
  id uuid, base_product_code text, slug text, display_name text,
  short_description text, category text, brand text, is_featured boolean,
  sort_order integer, primary_image_url text, variants jsonb, updated_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select c.id, c.base_product_code, c.slug, c.display_name, c.short_description,
    min(pc.name) as category, min(pb.name) as brand, c.is_featured, c.sort_order,
    (select m.url from public.store_product_media m
     where m.product_content_id = c.id and m.media_type = 'image'
     order by m.is_primary desc, m.sort_order asc, m.created_at asc limit 1),
    jsonb_agg(jsonb_build_object('id', p.id, 'sku', p.sku,
      'colorCode', p.color_code,
      'colorName', coalesce(co.display_name, p.color_name, p.color_code))
      order by co.sort_order nulls last, p.color_code, p.sku),
    greatest(c.updated_at, max(p.updated_at))
  from public.store_product_content c
  join public.products p on p.base_product_code = c.base_product_code and p.status = 'active'
  left join public.product_brands pb on pb.id = p.brand_id
  left join public.product_categories pc on pc.id = p.category_id
  left join public.store_color_options co on co.code = p.color_code and co.is_active
  where c.is_published
    and (p_color_code is null or exists (select 1 from public.products px
      where px.base_product_code = c.base_product_code and px.status = 'active' and px.color_code = p_color_code))
    and (p_query is null or btrim(p_query) = '' or c.display_name ilike '%' || btrim(p_query) || '%'
      or c.base_product_code ilike '%' || btrim(p_query) || '%'
      or exists (select 1 from public.products pq where pq.base_product_code = c.base_product_code
        and pq.status = 'active' and pq.sku ilike '%' || btrim(p_query) || '%'))
  group by c.id
  order by c.is_featured desc, c.sort_order asc, c.display_name asc
  limit greatest(1, least(coalesce(p_limit, 48), 100)) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_store_product_by_slug(p_slug text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', c.id, 'baseProductCode', c.base_product_code, 'slug', c.slug,
    'displayName', c.display_name, 'shortDescription', c.short_description,
    'description', c.description, 'category', min(pc.name), 'brand', min(pb.name),
    'seoTitle', c.seo_title, 'seoDescription', c.seo_description, 'ogImageUrl', c.og_image_url,
    'media', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.media_type, 'url', m.url, 'altText', m.alt_text,
      'title', m.title, 'colorCode', m.color_code, 'isPrimary', m.is_primary)
      order by m.sort_order, m.created_at) from public.store_product_media m where m.product_content_id = c.id), '[]'::jsonb),
    'variants', jsonb_agg(jsonb_build_object('id', p.id, 'sku', p.sku,
      'colorCode', p.color_code, 'colorName', coalesce(co.display_name, p.color_name, p.color_code))
      order by co.sort_order nulls last, p.color_code, p.sku),
    'updatedAt', greatest(c.updated_at, max(p.updated_at)))
  from public.store_product_content c
  join public.products p on p.base_product_code = c.base_product_code and p.status = 'active'
  left join public.product_brands pb on pb.id = p.brand_id
  left join public.product_categories pc on pc.id = p.category_id
  left join public.store_color_options co on co.code = p.color_code and co.is_active
  where c.is_published and c.slug = p_slug
  group by c.id;
$$;

revoke all on function public.get_store_catalog_products(text, text, integer, integer) from public;
revoke all on function public.get_store_product_by_slug(text) from public;
grant execute on function public.get_store_catalog_products(text, text, integer, integer) to anon, authenticated;
grant execute on function public.get_store_product_by_slug(text) to anon, authenticated;

notify pgrst, 'reload schema';
