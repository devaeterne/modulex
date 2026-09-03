-- PB-3A advisor cleanup: explicit deny-by-default RLS and FK covering indexes.

create index if not exists customer_project_payment_requirements_cancelled_by_idx
  on public.customer_project_payment_requirements(cancelled_by)
  where cancelled_by is not null;

create index if not exists customer_project_payment_requirements_created_by_idx
  on public.customer_project_payment_requirements(created_by)
  where created_by is not null;

create index if not exists customer_project_payment_requirements_updated_by_idx
  on public.customer_project_payment_requirements(updated_by)
  where updated_by is not null;

create index if not exists customer_project_payment_transactions_payment_method_idx
  on public.customer_project_payment_transactions(payment_method_id)
  where payment_method_id is not null;

create index if not exists customer_project_payment_transactions_created_by_idx
  on public.customer_project_payment_transactions(created_by)
  where created_by is not null;

create index if not exists customer_project_payment_transactions_voided_by_idx
  on public.customer_project_payment_transactions(voided_by)
  where voided_by is not null;

create index if not exists customer_project_payment_allocations_created_by_idx
  on public.customer_project_payment_allocations(created_by)
  where created_by is not null;

drop policy if exists customer_project_payment_requirements_no_direct_access
  on public.customer_project_payment_requirements;
create policy customer_project_payment_requirements_no_direct_access
  on public.customer_project_payment_requirements
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists customer_project_payment_transactions_no_direct_access
  on public.customer_project_payment_transactions;
create policy customer_project_payment_transactions_no_direct_access
  on public.customer_project_payment_transactions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists customer_project_payment_allocations_no_direct_access
  on public.customer_project_payment_allocations;
create policy customer_project_payment_allocations_no_direct_access
  on public.customer_project_payment_allocations
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
