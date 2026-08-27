-- Modulex RBAC: Finance role
-- Production-safe/idempotent source for the Finance role and its data permissions.

alter type public.user_role add value if not exists 'finance' after 'sales';

alter policy customers_read on public.customers
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_addresses_read on public.customer_addresses
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_contacts_read on public.customer_contacts
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_activity_read on public.customer_activity
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_notes_read on public.customer_notes
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_documents_read on public.customer_documents
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_commercial_read on public.customer_commercial_settings
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));

alter policy customer_orders_read on public.customer_orders
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_order_items_read on public.customer_order_items
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_order_revisions_read on public.customer_order_revisions
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_order_status_history_read on public.customer_order_status_history
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));

alter policy customer_invoices_read on public.customer_invoices
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy customer_invoice_items_read on public.customer_invoice_items
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));

alter policy approval_requests_read on public.approval_requests
  using (public.current_user_has_any_role(array['super_admin','admin','finance']::text[]) or requested_by = auth.uid());

alter policy product_prices_select_internal on public.product_prices
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy product_costs_select_admin on public.product_costs
  using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
alter policy pricing_settings_select_admin on public.pricing_settings
  using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
alter policy price_groups_select_internal on public.price_groups
  using (
    public.current_user_has_any_role(array['super_admin','admin','finance']::text[])
    or (public.current_user_has_any_role(array['sales']::text[]) and internal_only = false)
  );
alter policy payment_methods_read on public.payment_methods
  using ((select public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[])));
alter policy order_tax_rules_read_staff on public.order_tax_rules
  using (public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[]));

alter policy company_expenses_select_admin on public.company_expenses
  using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
alter policy company_expenses_insert_admin on public.company_expenses
  with check ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
alter policy company_expenses_update_admin on public.company_expenses
  using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])))
  with check ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));

-- Keep direct invoice writes restricted. Sales and Finance use checked RPCs.
alter policy customer_invoices_insert on public.customer_invoices
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));
alter policy customer_invoice_items_insert on public.customer_invoice_items
  with check ((select public.current_user_has_any_role(array['super_admin','admin']::text[])));

-- Existing deployments may already have these functions. Patch only their role checks,
-- then enforce SECURITY DEFINER so Sales/Finance do not need direct invoice INSERT rights.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.create_customer_invoice_from_order(uuid,date,text,text,boolean)'::regprocedure) into v_def;
  if v_def not like '%finance%' then
    v_def := replace(v_def, 'array[''super_admin'', ''admin'', ''sales'']', 'array[''super_admin'', ''admin'', ''sales'', ''finance'']');
    execute v_def;
  end if;

  select pg_get_functiondef('public.update_customer_invoice_state(uuid,text,numeric)'::regprocedure) into v_def;
  if v_def not like '%finance%' then
    v_def := replace(v_def, 'v_role not in (''super_admin'',''admin'',''sales'')', 'v_role not in (''super_admin'',''admin'',''sales'',''finance'')');
    execute v_def;
  end if;
end $$;

alter function public.create_customer_invoice_from_order(uuid,date,text,text,boolean) security definer;
alter function public.create_customer_invoice_from_order(uuid,date,text,text,boolean) set search_path = public, private, pg_temp;

revoke all on function public.create_customer_invoice_from_order(uuid,date,text,text,boolean) from public;
grant execute on function public.create_customer_invoice_from_order(uuid,date,text,text,boolean) to authenticated;
revoke all on function public.update_customer_invoice_state(uuid,text,numeric) from public;
grant execute on function public.update_customer_invoice_state(uuid,text,numeric) to authenticated;
