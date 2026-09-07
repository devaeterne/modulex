-- A6-F7: Finance hardening.
-- Cover Finance-owned / Finance-integration foreign keys reported by the
-- production Performance Advisor. This migration is intentionally index-only:
-- it does not rewrite business data or change Finance authorization/RPCs.

create index if not exists customer_project_payment_finance_links_created_by_idx
  on public.customer_project_payment_finance_links(created_by);

create index if not exists finance_accounts_created_by_idx
  on public.finance_accounts(created_by);
create index if not exists finance_accounts_updated_by_idx
  on public.finance_accounts(updated_by);

create index if not exists finance_categories_created_by_idx
  on public.finance_categories(created_by);
create index if not exists finance_categories_updated_by_idx
  on public.finance_categories(updated_by);

create index if not exists finance_fx_rates_created_by_idx
  on public.finance_fx_rates(created_by);

create index if not exists finance_idempotency_requests_created_by_idx
  on public.finance_idempotency_requests(created_by);

create index if not exists finance_payment_instrument_audit_actor_idx
  on public.finance_payment_instrument_audit(actor_id);

create index if not exists finance_payment_instruments_created_by_idx
  on public.finance_payment_instruments(created_by);
create index if not exists finance_payment_instruments_updated_by_idx
  on public.finance_payment_instruments(updated_by);

create index if not exists finance_transaction_links_created_by_idx
  on public.finance_transaction_links(created_by);

create index if not exists finance_transactions_fx_rate_idx
  on public.finance_transactions(fx_rate_id);
create index if not exists finance_transactions_updated_by_idx
  on public.finance_transactions(updated_by);

create index if not exists hr_payroll_finance_settlement_effects_actor_idx
  on public.hr_payroll_finance_settlement_effects(actor_id);
create index if not exists hr_payroll_finance_settlement_state_updated_by_idx
  on public.hr_payroll_finance_settlement_state(updated_by);

create index if not exists vendor_invoice_audit_actor_idx
  on public.vendor_invoice_audit(actor_id);
create index if not exists vendor_invoice_idempotency_requests_created_by_idx
  on public.vendor_invoice_idempotency_requests(created_by);
create index if not exists vendor_invoice_lines_created_by_idx
  on public.vendor_invoice_lines(created_by);
create index if not exists vendor_invoice_lines_updated_by_idx
  on public.vendor_invoice_lines(updated_by);
create index if not exists vendor_invoice_payment_allocations_actor_idx
  on public.vendor_invoice_payment_allocations(actor_id);

create index if not exists vendor_payment_schedule_audit_actor_idx
  on public.vendor_payment_schedule_audit(actor_id);
create index if not exists vendor_payment_schedules_cancelled_by_idx
  on public.vendor_payment_schedules(cancelled_by);
create index if not exists vendor_payment_schedules_created_by_idx
  on public.vendor_payment_schedules(created_by);
create index if not exists vendor_payment_schedules_updated_by_idx
  on public.vendor_payment_schedules(updated_by);
