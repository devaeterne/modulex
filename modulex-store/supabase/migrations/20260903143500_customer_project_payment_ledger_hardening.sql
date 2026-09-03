-- PB-3A hardening: no direct Data API access to financial ledger tables.

revoke all on table public.customer_project_payment_requirements from anon, authenticated;
revoke all on table public.customer_project_payment_transactions from anon, authenticated;
revoke all on table public.customer_project_payment_allocations from anon, authenticated;

grant select, insert, update, delete on table public.customer_project_payment_requirements to service_role;
grant select, insert, update, delete on table public.customer_project_payment_transactions to service_role;
grant select, insert, update, delete on table public.customer_project_payment_allocations to service_role;

revoke execute on function public.get_customer_project_payment_ledger(uuid) from public, anon;
revoke execute on function public.get_customer_project_payment_status(uuid) from public, anon;
revoke execute on function public.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid) from public, anon;
revoke execute on function public.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text) from public, anon;
revoke execute on function public.allocate_customer_project_payment(uuid, uuid, numeric) from public, anon;
revoke execute on function public.reverse_customer_project_payment(uuid, numeric, text) from public, anon;
revoke execute on function public.void_customer_project_payment(uuid, text) from public, anon;

grant execute on function public.get_customer_project_payment_ledger(uuid) to authenticated, service_role;
grant execute on function public.get_customer_project_payment_status(uuid) to authenticated, service_role;
grant execute on function public.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid) to authenticated, service_role;
grant execute on function public.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text) to authenticated, service_role;
grant execute on function public.allocate_customer_project_payment(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.reverse_customer_project_payment(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.void_customer_project_payment(uuid, text) to authenticated, service_role;

revoke execute on function private.project_payment_sign(text) from public, anon, authenticated;
revoke execute on function private.guard_posted_project_payment_transaction() from public, anon, authenticated;
revoke execute on function private.set_project_payment_requirement_metadata() from public, anon, authenticated;
revoke execute on function private.set_project_payment_transaction_currency() from public, anon, authenticated;
revoke execute on function private.sync_customer_invoice_payment_from_ledger(uuid) from public, anon, authenticated;
revoke execute on function private.validate_project_payment_requirement_invoice() from public, anon, authenticated;
revoke execute on function private.sync_invoice_after_payment_requirement_change() from public, anon, authenticated;
revoke execute on function private.validate_project_payment_allocation() from public, anon, authenticated;
revoke execute on function private.sync_invoice_after_payment_allocation_change() from public, anon, authenticated;
revoke execute on function private.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid) from public, anon, authenticated;
revoke execute on function private.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text) from public, anon, authenticated;
revoke execute on function private.allocate_customer_project_payment(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function private.reverse_customer_project_payment(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function private.void_customer_project_payment(uuid, text) from public, anon, authenticated;
revoke execute on function private.get_customer_project_payment_ledger(uuid) from public, anon, authenticated;
revoke execute on function private.get_customer_project_payment_status(uuid) from public, anon, authenticated;

comment on table public.customer_project_payment_requirements is
  'Project receivable milestones/requirements. Payment status is derived from signed allocations.';
comment on table public.customer_project_payment_transactions is
  'Append-safe customer cash transactions for a Project. Posted amounts are corrected by reversal/refund, not destructive edits.';
comment on table public.customer_project_payment_allocations is
  'Allocation bridge between actual Project customer payments and expected payment requirements.';
