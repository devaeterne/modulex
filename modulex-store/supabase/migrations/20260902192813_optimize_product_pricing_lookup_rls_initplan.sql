alter policy "Allow authenticated read product brands"
on public.product_brands
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']::text[]))
);

alter policy "Allow authenticated read product categories"
on public.product_categories
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']::text[]))
);

alter policy product_master_type_read
on public.product_types
to authenticated
using (
  is_active
  or (select public.current_user_has_any_role(array['super_admin','admin']::text[]))
);

alter policy product_master_uom_read
on public.units_of_measure
to authenticated
using (
  is_active
  or (select public.current_user_has_any_role(array['super_admin','admin']::text[]))
);

alter policy price_groups_select_internal
on public.price_groups
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin','admin','finance']::text[]))
  or (
    (select public.current_user_has_any_role(array['sales']::text[]))
    and internal_only = false
  )
);
