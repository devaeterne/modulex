-- PER-A2 / PER-A3 / PER-A4 Personnel production-domain hardening.
-- HR owns payroll source/calculation state. Finance owns posted cash settlement.
-- RLS remains the row-level authorization boundary for authenticated HR data.
-- The two hr_payroll_finance_settlement_* tables are internal implementation state:
-- they intentionally remain RLS-enabled with no client policies and no anon/authenticated grants.

revoke all on table
  public.hr_advances,
  public.hr_attendance_records,
  public.hr_benefit_plans,
  public.hr_compensation_records,
  public.hr_deductions,
  public.hr_departments,
  public.hr_documents,
  public.hr_emergency_contacts,
  public.hr_employee_benefits,
  public.hr_employee_history,
  public.hr_employee_relations,
  public.hr_employee_schedules,
  public.hr_employee_tasks,
  public.hr_employee_training,
  public.hr_employees,
  public.hr_holidays,
  public.hr_leave_accrual_ledger,
  public.hr_leave_balances,
  public.hr_leave_requests,
  public.hr_leave_types,
  public.hr_payroll_finance_settlement_effects,
  public.hr_payroll_finance_settlement_state,
  public.hr_payroll_items,
  public.hr_payroll_periods,
  public.hr_payroll_runs,
  public.hr_performance_reviews,
  public.hr_positions,
  public.hr_tax_profiles,
  public.hr_training_courses,
  public.hr_variable_pay,
  public.hr_work_schedules
from anon;

drop policy if exists hr_payroll_periods_write_insert on public.hr_payroll_periods;
create policy hr_payroll_periods_write_insert
on public.hr_payroll_periods
for insert
to authenticated
with check ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_periods_write_update on public.hr_payroll_periods;
create policy hr_payroll_periods_write_update
on public.hr_payroll_periods
for update
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_periods_write_delete on public.hr_payroll_periods;
create policy hr_payroll_periods_write_delete
on public.hr_payroll_periods
for delete
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_runs_write_insert on public.hr_payroll_runs;
create policy hr_payroll_runs_write_insert
on public.hr_payroll_runs
for insert
to authenticated
with check ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_runs_write_update on public.hr_payroll_runs;
create policy hr_payroll_runs_write_update
on public.hr_payroll_runs
for update
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_runs_write_delete on public.hr_payroll_runs;
create policy hr_payroll_runs_write_delete
on public.hr_payroll_runs
for delete
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_items_write_insert on public.hr_payroll_items;
create policy hr_payroll_items_write_insert
on public.hr_payroll_items
for insert
to authenticated
with check ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_items_write_update on public.hr_payroll_items;
create policy hr_payroll_items_write_update
on public.hr_payroll_items
for update
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

drop policy if exists hr_payroll_items_write_delete on public.hr_payroll_items;
create policy hr_payroll_items_write_delete
on public.hr_payroll_items
for delete
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','hr']::text[])));

create or replace function public.prepare_hr_payroll_run(p_run_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog', 'private'
as $function$
begin
  if not public.current_user_has_any_role(array['super_admin','admin','hr']::text[]) then
    raise exception 'HR payroll management permission is required.' using errcode = '42501';
  end if;
  return private.prepare_hr_payroll_run(p_run_id);
end;
$function$;

create or replace function public.set_hr_payroll_run_status(p_run_id uuid, p_status text)
returns text
language plpgsql
set search_path to 'pg_catalog', 'private'
as $function$
begin
  if not public.current_user_has_any_role(array['super_admin','admin','hr']::text[]) then
    raise exception 'HR payroll management permission is required.' using errcode = '42501';
  end if;
  return private.set_hr_payroll_run_status(p_run_id, p_status);
end;
$function$;

revoke execute on function public.prepare_hr_payroll_run(uuid) from public, anon;
revoke execute on function public.set_hr_payroll_run_status(uuid, text) from public, anon;
grant execute on function public.prepare_hr_payroll_run(uuid) to authenticated, service_role;
grant execute on function public.set_hr_payroll_run_status(uuid, text) to authenticated, service_role;

revoke execute on function public.get_hr_employee_finance_payments(uuid) from public, anon;
revoke execute on function public.get_hr_payroll_finance_settlement(uuid) from public, anon;
revoke execute on function public.get_hr_payroll_employee_directory() from public, anon;
grant execute on function public.get_hr_employee_finance_payments(uuid) to authenticated;
grant execute on function public.get_hr_payroll_finance_settlement(uuid) to authenticated;
grant execute on function public.get_hr_payroll_employee_directory() to authenticated, service_role;

revoke all on table public.hr_payroll_finance_settlement_state from anon, authenticated;
revoke all on table public.hr_payroll_finance_settlement_effects from anon, authenticated;

-- Cover actor/audit foreign keys surfaced by the production Performance Advisor.
create index if not exists hr_advances_created_by_idx on public.hr_advances (created_by);
create index if not exists hr_advances_updated_by_idx on public.hr_advances (updated_by);
create index if not exists hr_attendance_records_approved_by_idx on public.hr_attendance_records (approved_by);
create index if not exists hr_attendance_records_created_by_idx on public.hr_attendance_records (created_by);
create index if not exists hr_attendance_records_updated_by_idx on public.hr_attendance_records (updated_by);
create index if not exists hr_benefit_plans_created_by_idx on public.hr_benefit_plans (created_by);
create index if not exists hr_benefit_plans_updated_by_idx on public.hr_benefit_plans (updated_by);
create index if not exists hr_compensation_records_created_by_idx on public.hr_compensation_records (created_by);
create index if not exists hr_compensation_records_updated_by_idx on public.hr_compensation_records (updated_by);
create index if not exists hr_deductions_created_by_idx on public.hr_deductions (created_by);
create index if not exists hr_deductions_updated_by_idx on public.hr_deductions (updated_by);
create index if not exists hr_departments_created_by_idx on public.hr_departments (created_by);
create index if not exists hr_departments_updated_by_idx on public.hr_departments (updated_by);
create index if not exists hr_documents_created_by_idx on public.hr_documents (created_by);
create index if not exists hr_documents_updated_by_idx on public.hr_documents (updated_by);
create index if not exists hr_emergency_contacts_created_by_idx on public.hr_emergency_contacts (created_by);
create index if not exists hr_emergency_contacts_updated_by_idx on public.hr_emergency_contacts (updated_by);
create index if not exists hr_employee_benefits_created_by_idx on public.hr_employee_benefits (created_by);
create index if not exists hr_employee_benefits_updated_by_idx on public.hr_employee_benefits (updated_by);
create index if not exists hr_employee_history_changed_by_idx on public.hr_employee_history (changed_by);
create index if not exists hr_employee_relations_created_by_idx on public.hr_employee_relations (created_by);
create index if not exists hr_employee_relations_updated_by_idx on public.hr_employee_relations (updated_by);
create index if not exists hr_employee_schedules_created_by_idx on public.hr_employee_schedules (created_by);
create index if not exists hr_employee_schedules_updated_by_idx on public.hr_employee_schedules (updated_by);
create index if not exists hr_employee_tasks_created_by_idx on public.hr_employee_tasks (created_by);
create index if not exists hr_employee_tasks_updated_by_idx on public.hr_employee_tasks (updated_by);
create index if not exists hr_employee_training_created_by_idx on public.hr_employee_training (created_by);
create index if not exists hr_employee_training_updated_by_idx on public.hr_employee_training (updated_by);
create index if not exists hr_employees_created_by_idx on public.hr_employees (created_by);
create index if not exists hr_employees_updated_by_idx on public.hr_employees (updated_by);
create index if not exists hr_holidays_created_by_idx on public.hr_holidays (created_by);
create index if not exists hr_holidays_updated_by_idx on public.hr_holidays (updated_by);
create index if not exists hr_leave_accrual_ledger_created_by_idx on public.hr_leave_accrual_ledger (created_by);
create index if not exists hr_leave_balances_created_by_idx on public.hr_leave_balances (created_by);
create index if not exists hr_leave_balances_updated_by_idx on public.hr_leave_balances (updated_by);
create index if not exists hr_leave_requests_approved_by_idx on public.hr_leave_requests (approved_by);
create index if not exists hr_leave_requests_created_by_idx on public.hr_leave_requests (created_by);
create index if not exists hr_leave_requests_updated_by_idx on public.hr_leave_requests (updated_by);
create index if not exists hr_leave_types_created_by_idx on public.hr_leave_types (created_by);
create index if not exists hr_leave_types_updated_by_idx on public.hr_leave_types (updated_by);
create index if not exists hr_payroll_items_created_by_idx on public.hr_payroll_items (created_by);
create index if not exists hr_payroll_items_updated_by_idx on public.hr_payroll_items (updated_by);
create index if not exists hr_payroll_periods_created_by_idx on public.hr_payroll_periods (created_by);
create index if not exists hr_payroll_periods_updated_by_idx on public.hr_payroll_periods (updated_by);
create index if not exists hr_payroll_runs_approved_by_idx on public.hr_payroll_runs (approved_by);
create index if not exists hr_payroll_runs_created_by_idx on public.hr_payroll_runs (created_by);
create index if not exists hr_payroll_runs_updated_by_idx on public.hr_payroll_runs (updated_by);
create index if not exists hr_performance_reviews_created_by_idx on public.hr_performance_reviews (created_by);
create index if not exists hr_performance_reviews_updated_by_idx on public.hr_performance_reviews (updated_by);
create index if not exists hr_positions_created_by_idx on public.hr_positions (created_by);
create index if not exists hr_positions_updated_by_idx on public.hr_positions (updated_by);
create index if not exists hr_tax_profiles_created_by_idx on public.hr_tax_profiles (created_by);
create index if not exists hr_tax_profiles_updated_by_idx on public.hr_tax_profiles (updated_by);
create index if not exists hr_training_courses_created_by_idx on public.hr_training_courses (created_by);
create index if not exists hr_training_courses_updated_by_idx on public.hr_training_courses (updated_by);
create index if not exists hr_variable_pay_created_by_idx on public.hr_variable_pay (created_by);
create index if not exists hr_variable_pay_updated_by_idx on public.hr_variable_pay (updated_by);
create index if not exists hr_work_schedules_created_by_idx on public.hr_work_schedules (created_by);
create index if not exists hr_work_schedules_updated_by_idx on public.hr_work_schedules (updated_by);
