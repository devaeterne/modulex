-- PB-7 Change Orders performance hardening.
-- Additive covering indexes for foreign keys reported by Supabase Performance Advisor.
-- No business data, lifecycle, RBAC, Finance, Order, Proposal, or Portal semantics change.

create index if not exists customer_project_change_order_applications_linked_by_idx
  on public.customer_project_change_order_applications(linked_by);

create index if not exists customer_project_change_order_applications_order_id_idx
  on public.customer_project_change_order_applications(order_id);

create index if not exists customer_project_change_order_events_created_by_idx
  on public.customer_project_change_order_events(created_by);

create index if not exists customer_project_change_order_lines_created_by_idx
  on public.customer_project_change_order_lines(created_by);

create index if not exists customer_project_change_order_lines_product_id_idx
  on public.customer_project_change_order_lines(product_id);

create index if not exists customer_project_change_order_lines_target_order_item_id_idx
  on public.customer_project_change_order_lines(target_order_item_id);

create index if not exists customer_project_change_order_lines_updated_by_idx
  on public.customer_project_change_order_lines(updated_by);

create index if not exists customer_project_change_orders_correction_of_change_order_id_idx
  on public.customer_project_change_orders(correction_of_change_order_id);

create index if not exists customer_project_change_orders_cancelled_by_idx
  on public.customer_project_change_orders(cancelled_by);

create index if not exists customer_project_change_orders_created_by_idx
  on public.customer_project_change_orders(created_by);

create index if not exists customer_project_change_orders_reviewed_by_idx
  on public.customer_project_change_orders(reviewed_by);

create index if not exists customer_project_change_orders_submitted_by_idx
  on public.customer_project_change_orders(submitted_by);

create index if not exists customer_project_change_orders_updated_by_idx
  on public.customer_project_change_orders(updated_by);
