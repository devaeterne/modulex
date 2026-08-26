-- Cover single-column foreign keys that Supabase Performance Advisor reports as unindexed.
-- These indexes protect parent UPDATE/DELETE checks and future join/filter paths as the
-- customer and audit tables grow. Existing indexes are left untouched.

create index if not exists customer_activity_actor_user_id_fkey_idx on public.customer_activity (actor_user_id);
create index if not exists customer_addresses_created_by_fkey_idx on public.customer_addresses (created_by);
create index if not exists customer_addresses_updated_by_fkey_idx on public.customer_addresses (updated_by);
create index if not exists customer_commercial_settings_created_by_fkey_idx on public.customer_commercial_settings (created_by);
create index if not exists customer_commercial_settings_updated_by_fkey_idx on public.customer_commercial_settings (updated_by);
create index if not exists customer_contacts_created_by_fkey_idx on public.customer_contacts (created_by);
create index if not exists customer_contacts_updated_by_fkey_idx on public.customer_contacts (updated_by);
create index if not exists customer_documents_uploaded_by_fkey_idx on public.customer_documents (uploaded_by);
create index if not exists customer_installations_created_by_fkey_idx on public.customer_installations (created_by);
create index if not exists customer_installations_updated_by_fkey_idx on public.customer_installations (updated_by);
create index if not exists customer_invoices_created_by_fkey_idx on public.customer_invoices (created_by);
create index if not exists customer_invoices_updated_by_fkey_idx on public.customer_invoices (updated_by);
create index if not exists customer_notes_created_by_fkey_idx on public.customer_notes (created_by);
create index if not exists customer_notes_updated_by_fkey_idx on public.customer_notes (updated_by);
create index if not exists customer_order_items_created_by_fkey_idx on public.customer_order_items (created_by);
create index if not exists customer_order_revisions_revised_by_fkey_idx on public.customer_order_revisions (revised_by);
create index if not exists customer_order_status_history_changed_by_fkey_idx on public.customer_order_status_history (changed_by);
create index if not exists customer_orders_created_by_fkey_idx on public.customer_orders (created_by);
create index if not exists customer_orders_updated_by_fkey_idx on public.customer_orders (updated_by);
create index if not exists customer_portal_users_created_by_fkey_idx on public.customer_portal_users (created_by);
create index if not exists customer_portal_users_updated_by_fkey_idx on public.customer_portal_users (updated_by);
create index if not exists customer_shipments_created_by_fkey_idx on public.customer_shipments (created_by);
create index if not exists customer_shipments_updated_by_fkey_idx on public.customer_shipments (updated_by);
create index if not exists customer_types_created_by_fkey_idx on public.customer_types (created_by);
create index if not exists customer_types_updated_by_fkey_idx on public.customer_types (updated_by);
create index if not exists customers_created_by_fkey_idx on public.customers (created_by);
create index if not exists customers_updated_by_fkey_idx on public.customers (updated_by);
create index if not exists general_settings_created_by_fkey_idx on public.general_settings (created_by);
create index if not exists general_settings_updated_by_fkey_idx on public.general_settings (updated_by);
create index if not exists payment_methods_created_by_fkey_idx on public.payment_methods (created_by);
create index if not exists payment_methods_updated_by_fkey_idx on public.payment_methods (updated_by);
create index if not exists payment_terms_created_by_fkey_idx on public.payment_terms (created_by);
create index if not exists payment_terms_updated_by_fkey_idx on public.payment_terms (updated_by);
