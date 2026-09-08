-- Restrict Cost / FOB and cost-bearing price data to Admin roles only.
-- Order/Project commercial selection paths must use only non-internal price groups.

update public.price_groups
set internal_only = true
where lower(btrim(name)) in ('cost', 'fob')
  and internal_only is distinct from true;

drop policy if exists price_groups_select_internal on public.price_groups;
create policy price_groups_select_internal
on public.price_groups
for select
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin', 'admin']::text[]))
  or (
    internal_only = false
    and (select public.current_user_has_any_role(array['sales', 'finance']::text[]))
  )
);

drop policy if exists product_prices_select_internal on public.product_prices;
create policy product_prices_select_internal
on public.product_prices
for select
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin', 'admin']::text[]))
  or (
    (select public.current_user_has_any_role(array['sales', 'finance']::text[]))
    and exists (
      select 1
      from public.price_groups pg
      where pg.id = product_prices.price_group_id
        and pg.internal_only = false
    )
  )
);

drop policy if exists product_costs_select_admin on public.product_costs;
create policy product_costs_select_admin
on public.product_costs
for select
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin', 'admin']::text[]))
);

comment on policy price_groups_select_internal on public.price_groups is
  'Admin/Super Admin can read all groups; Sales/Finance can read non-internal groups only.';
comment on policy product_prices_select_internal on public.product_prices is
  'Admin/Super Admin can read all product prices; Sales/Finance can read prices only for non-internal groups.';
comment on policy product_costs_select_admin on public.product_costs is
  'Product costs are restricted to Admin/Super Admin.';
