-- P1.5C: Dealer-only catalog pricing and priced order visibility.

create or replace function private.get_store_dealer_pricing_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_customer_id uuid;
  v_portal_kind text;
  v_result jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  v_customer_id := (v_context ->> 'customer_id')::uuid;
  v_portal_kind := v_context ->> 'portal_kind';
  if v_portal_kind <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  select jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'pricing_enabled', true,
    'price_group_id', pg.id,
    'price_group_name', pg.name,
    'currency_code', c.currency_code
  )
  into v_result
  from public.customers c
  join public.price_groups pg on pg.id = c.price_group_id
  where c.id = v_customer_id
    and pg.is_active = true
    and pg.available_for_orders = true
    and pg.internal_only = false
  limit 1;

  if v_result is null then
    return jsonb_build_object(
      'ok', true,
      'reason', 'authorized',
      'pricing_enabled', false
    );
  end if;

  return v_result;
end;
$$;

revoke all on function private.get_store_dealer_pricing_context() from public;
revoke execute on function private.get_store_dealer_pricing_context() from anon;
grant execute on function private.get_store_dealer_pricing_context() to authenticated;

create or replace function public.get_store_dealer_pricing_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_store_dealer_pricing_context();
$$;

revoke all on function public.get_store_dealer_pricing_context() from public;
revoke execute on function public.get_store_dealer_pricing_context() from anon;
grant execute on function public.get_store_dealer_pricing_context() to authenticated;

create or replace function private.get_store_dealer_catalog_products(
  p_query text default null,
  p_color_code text default null,
  p_limit integer default 48,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pricing jsonb := private.get_store_dealer_pricing_context();
  v_pricing_enabled boolean;
  v_price_group_id uuid;
  v_currency_code text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 48), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_products jsonb;
begin
  if coalesce((v_pricing ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;

  v_pricing_enabled := coalesce((v_pricing ->> 'pricing_enabled')::boolean, false);
  if v_pricing_enabled then
    v_price_group_id := (v_pricing ->> 'price_group_id')::uuid;
    v_currency_code := v_pricing ->> 'currency_code';
  end if;

  select coalesce(jsonb_agg(product_json order by is_featured desc, sort_order, display_name), '[]'::jsonb)
  into v_products
  from (
    select
      c.is_featured,
      c.sort_order,
      c.display_name,
      case when v_pricing_enabled then
        jsonb_build_object(
          'id', c.id,
          'baseProductCode', c.base_product_code,
          'slug', c.slug,
          'displayName', c.display_name,
          'shortDescription', c.short_description,
          'category', min(p.category),
          'brand', min(p.brand),
          'isFeatured', c.is_featured,
          'primaryImageUrl', (
            select m.url from public.store_product_media m
            where m.product_content_id = c.id and m.media_type = 'image'
            order by m.is_primary desc, m.sort_order asc, m.created_at asc limit 1
          ),
          'variants', jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'sku', p.sku,
              'colorCode', p.color_code,
              'colorName', coalesce(co.display_name, p.color_name, p.color_code),
              'priceAvailable', pp.amount is not null,
              'price', pp.amount,
              'currencyCode', case when pp.amount is not null then v_currency_code else null end
            ) order by co.sort_order nulls last, p.color_code, p.sku
          )
        )
      else
        jsonb_build_object(
          'id', c.id,
          'baseProductCode', c.base_product_code,
          'slug', c.slug,
          'displayName', c.display_name,
          'shortDescription', c.short_description,
          'category', min(p.category),
          'brand', min(p.brand),
          'isFeatured', c.is_featured,
          'primaryImageUrl', (
            select m.url from public.store_product_media m
            where m.product_content_id = c.id and m.media_type = 'image'
            order by m.is_primary desc, m.sort_order asc, m.created_at asc limit 1
          ),
          'variants', jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'sku', p.sku,
              'colorCode', p.color_code,
              'colorName', coalesce(co.display_name, p.color_name, p.color_code),
              'priceAvailable', false
            ) order by co.sort_order nulls last, p.color_code, p.sku
          )
        )
      end as product_json
    from public.store_product_content c
    join public.products p
      on p.base_product_code = c.base_product_code
     and p.status = 'active'
    left join public.store_color_options co
      on co.code = p.color_code and co.is_active
    left join lateral (
      select pp1.amount
      from public.product_prices pp1
      where v_pricing_enabled
        and pp1.product_id = p.id
        and pp1.price_group_id = v_price_group_id
        and pp1.currency_code = v_currency_code
        and pp1.is_active = true
        and pp1.valid_from <= now()
        and (pp1.valid_to is null or pp1.valid_to > now())
      order by pp1.valid_from desc, pp1.created_at desc
      limit 1
    ) pp on true
    where c.is_published = true
      and (p_color_code is null or exists (
        select 1 from public.products px
        where px.base_product_code = c.base_product_code
          and px.status = 'active'
          and px.color_code = p_color_code
      ))
      and (p_query is null or btrim(p_query) = '' or
        c.display_name ilike '%' || btrim(p_query) || '%' or
        c.base_product_code ilike '%' || btrim(p_query) || '%' or
        exists (
          select 1 from public.products pq
          where pq.base_product_code = c.base_product_code
            and pq.status = 'active'
            and pq.sku ilike '%' || btrim(p_query) || '%'
        )
      )
    group by c.id
    order by c.is_featured desc, c.sort_order asc, c.display_name asc
    limit v_limit offset v_offset
  ) scoped;

  return jsonb_build_object(
    'ok', true,
    'reason', 'authorized',
    'pricing_enabled', v_pricing_enabled,
    'products', v_products,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function private.get_store_dealer_catalog_products(text,text,integer,integer) from public;
revoke execute on function private.get_store_dealer_catalog_products(text,text,integer,integer) from anon;
grant execute on function private.get_store_dealer_catalog_products(text,text,integer,integer) to authenticated;

create or replace function public.get_store_dealer_catalog_products(
  p_query text default null,
  p_color_code text default null,
  p_limit integer default 48,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_store_dealer_catalog_products(p_query,p_color_code,p_limit,p_offset); $$;

revoke all on function public.get_store_dealer_catalog_products(text,text,integer,integer) from public;
revoke execute on function public.get_store_dealer_catalog_products(text,text,integer,integer) from anon;
grant execute on function public.get_store_dealer_catalog_products(text,text,integer,integer) to authenticated;

create or replace function private.get_store_dealer_product_by_slug(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_catalog jsonb;
  v_product jsonb;
begin
  v_catalog := private.get_store_dealer_catalog_products(p_slug, null, 100, 0);
  if coalesce((v_catalog ->> 'ok')::boolean, false) is not true then return v_catalog; end if;
  select value into v_product from jsonb_array_elements(v_catalog -> 'products') where value ->> 'slug' = p_slug limit 1;
  if v_product is null then return jsonb_build_object('ok', false, 'reason', 'product_unavailable'); end if;
  return jsonb_build_object('ok', true, 'reason', 'authorized', 'pricing_enabled', v_catalog -> 'pricing_enabled', 'product', v_product);
end;
$$;

revoke all on function private.get_store_dealer_product_by_slug(text) from public;
revoke execute on function private.get_store_dealer_product_by_slug(text) from anon;
grant execute on function private.get_store_dealer_product_by_slug(text) to authenticated;

create or replace function public.get_store_dealer_product_by_slug(p_slug text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_store_dealer_product_by_slug(p_slug); $$;
revoke all on function public.get_store_dealer_product_by_slug(text) from public;
revoke execute on function public.get_store_dealer_product_by_slug(text) from anon;
grant execute on function public.get_store_dealer_product_by_slug(text) to authenticated;

create or replace function private.get_store_dealer_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := private.get_store_portal_context();
  v_pricing jsonb := private.get_store_dealer_pricing_context();
  v_customer_id uuid;
  v_pricing_enabled boolean;
  v_order jsonb;
begin
  if coalesce((v_context ->> 'ok')::boolean, false) is not true or v_context ->> 'portal_kind' <> 'dealer' then
    return jsonb_build_object('ok', false, 'reason', 'dealer_access_denied');
  end if;
  v_customer_id := (v_context ->> 'customer_id')::uuid;
  v_pricing_enabled := coalesce((v_pricing ->> 'pricing_enabled')::boolean, false);

  if v_pricing_enabled then
    select jsonb_build_object(
      'id', o.id,'order_number',o.order_number,'status',o.status,'order_date',o.order_date,
      'expected_delivery_date',o.expected_delivery_date,'customer_reference',o.customer_reference,
      'item_count',o.item_count,'fulfillment_type',o.fulfillment_type,'currency_code',o.currency_code,
      'subtotal',o.subtotal,'discount_amount',o.discount_amount,'tax_rate',o.tax_rate,'tax_amount',o.tax_amount,'total_amount',o.total_amount,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',oi.id,'line_no',oi.line_no,'sku_snapshot',oi.sku_snapshot,'product_name_snapshot',oi.product_name_snapshot,
        'quantity',oi.quantity,'unit_price',oi.unit_price,'discount_percent',oi.discount_percent,'discount_amount',oi.discount_amount,
        'line_subtotal',oi.line_subtotal,'line_total',oi.line_total
      ) order by oi.line_no) from public.customer_order_items oi where oi.order_id=o.id),'[]'::jsonb)
    ) into v_order
    from public.customer_orders o where o.id=p_order_id and o.customer_id=v_customer_id limit 1;
  else
    select jsonb_build_object(
      'id', o.id,'order_number',o.order_number,'status',o.status,'order_date',o.order_date,
      'expected_delivery_date',o.expected_delivery_date,'customer_reference',o.customer_reference,
      'item_count',o.item_count,'fulfillment_type',o.fulfillment_type,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',oi.id,'line_no',oi.line_no,'sku_snapshot',oi.sku_snapshot,'product_name_snapshot',oi.product_name_snapshot,'quantity',oi.quantity
      ) order by oi.line_no) from public.customer_order_items oi where oi.order_id=o.id),'[]'::jsonb)
    ) into v_order
    from public.customer_orders o where o.id=p_order_id and o.customer_id=v_customer_id limit 1;
  end if;

  if v_order is null then return jsonb_build_object('ok', false, 'reason', 'order_unavailable'); end if;
  return jsonb_build_object('ok', true, 'reason', 'authorized', 'pricing_enabled', v_pricing_enabled, 'order', v_order);
end;
$$;

revoke all on function private.get_store_dealer_order(uuid) from public;
revoke execute on function private.get_store_dealer_order(uuid) from anon;
grant execute on function private.get_store_dealer_order(uuid) to authenticated;

create or replace function public.get_store_dealer_order(p_order_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_store_dealer_order(p_order_id); $$;
revoke all on function public.get_store_dealer_order(uuid) from public;
revoke execute on function public.get_store_dealer_order(uuid) from anon;
grant execute on function public.get_store_dealer_order(uuid) to authenticated;
