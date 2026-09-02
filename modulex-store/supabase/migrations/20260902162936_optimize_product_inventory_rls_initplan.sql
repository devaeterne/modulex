alter policy products_select_authenticated
on public.products
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']::text[]))
);

alter policy inventory_select_authenticated
on public.inventory
to authenticated
using (
  (select public.current_user_has_any_role(array['super_admin','admin','sales','finance','warehouse','shipping']::text[]))
);
