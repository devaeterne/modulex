-- Follow-up to the additive Orders v2 boundary: NULL product ids means quote the active order directory.
create or replace function public.get_customer_order_product_quotes(
  p_product_ids uuid[],
  p_price_group_id uuid,
  p_currency_code text default 'USD'
) returns table(
  product_id uuid,
  unit_price numeric,
  product_type_name text,
  pricing_model text,
  uom_code text,
  pricing_route_reason text,
  can_add_ordinary_line boolean
)
language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select p.id,
    case when pt.pricing_model = 'price_group' then (
      select pp.amount from public.product_prices pp
      where pp.product_id = p.id and pp.price_group_id = p_price_group_id
        and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
        and pp.is_active = true and pp.valid_to is null
      order by pp.valid_from desc limit 1
    ) else null end,
    pt.name,
    pt.pricing_model,
    u.code,
    case
      when pt.pricing_model = 'countertop_material_band' then 'Use the Countertop configurator for material-band pricing.'
      when pt.pricing_model = 'none' then 'This Product Type has no commercial pricing route.'
      when not exists (
        select 1 from public.product_prices pp
        where pp.product_id = p.id and pp.price_group_id = p_price_group_id
          and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
          and pp.is_active = true and pp.valid_to is null
      ) then 'No current Price Group price is available.'
      else null
    end,
    pt.pricing_model = 'price_group' and exists (
      select 1 from public.product_prices pp
      where pp.product_id = p.id and pp.price_group_id = p_price_group_id
        and pp.currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), 'USD'))
        and pp.is_active = true and pp.valid_to is null
    )
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  join public.units_of_measure u on u.id = p.uom_id
  where (p_product_ids is null or p.id = any(p_product_ids)) and p.status = 'active';
$$;
revoke all on function public.get_customer_order_product_quotes(uuid[],uuid,text) from public, anon;
grant execute on function public.get_customer_order_product_quotes(uuid[],uuid,text) to authenticated;
