# Personnel Production Domain Contract

Status: PER-A1 → PER-A4 closeout contract

## PER-A1 — Route / product-scope classification

The classification below is based on the current Admin implementation and the production Supabase schema, not on stale roadmap indecision. A route is `production` when it owns or operates real HR data/workflow. No current Personnel route is a visual-only placeholder.

| Route | Classification | Production evidence |
| --- | --- | --- |
| overview | production | Cross-domain HR operational counts and navigation |
| employees | production | `hr_employees`, organization assignment, employee history and Finance payment read projection |
| departments | production | `hr_departments` organization master data |
| positions | production | `hr_positions` organization master data |
| attendance | production | `hr_attendance_records`, date-bounded time entry and approval metadata |
| leave | production | `hr_leave_types`, `hr_leave_requests`, `hr_leave_balances`, accrual ledger and lifecycle RPCs |
| lifecycle | production | `hr_employee_tasks` onboarding/offboarding/general workflow |
| documents | production | `hr_documents` plus private `hr-documents` Storage bucket |
| performance | production | `hr_performance_reviews` review records and ratings |
| compliance | production | `hr_tax_profiles` and `hr_emergency_contacts` |
| compensation | production | `hr_compensation_records`, variable pay, advances and deductions |
| benefits | production | `hr_benefit_plans` and `hr_employee_benefits` enrollment lifecycle |
| payroll | production | payroll periods/runs/items, calculation and approval workflow |
| reports | production | workforce, attendance, leave, compliance and HR payroll source indicators |

`planned`: none.

`remove`: none. Placeholder cleanup therefore removes misleading product-boundary copy/surfaces rather than deleting working HR routes.

## PER-A2 — Production-domain contracts

### Shared authorization contract

- `personnel.view` gates Personnel read routes; `personnel.manage` gates organization-master management routes and HR mutation surfaces are additionally protected by production RLS/RPC role checks.
- HR source records are readable/writable only by the roles required by their production policies. Sensitive employee documents are also protected by authenticated Storage policies on the private `hr-documents` bucket.
- Finance is not granted `personnel.view`. Cross-domain Finance visibility is exposed only through explicit Finance/HR projection RPCs or Finance routes.
- `anon` has no direct table privileges on the HR domain after PER closeout.

### Validation and lifecycle contract

- Employees use the employee master schema constraints and employee-history trigger. Organization references use FK-backed departments/positions/managers.
- Attendance is keyed by employee/date and is queried in an explicit date window.
- Leave status changes use `set_hr_leave_request_status`; balance initialization uses `initialize_hr_leave_balances`; leave balances are refreshed from lifecycle events instead of being edited as an independent ledger.
- Lifecycle tasks use explicit pending/in-progress/completed/cancelled state and completion timestamps.
- Documents combine DB metadata with private Storage objects; only HR/Admin roles may read or mutate private objects.
- Performance ratings and review periods remain HR records, not Finance data.
- Compliance stores only the tax identifier last four digits in this module; full SSN is not a supported field.
- Compensation, variable pay, deductions, advances and benefit elections are payroll **source records** owned by HR.
- Payroll follows period → run → calculated → approved/void lifecycle. Legacy HR `paid` values remain compatibility-only; new paid truth is Finance-derived.

### Audit contract

- HR business tables carry actor/audit columns (`created_by`, `updated_by`, and approval actor where applicable) and `updated_at` triggers.
- Employee-master changes are additionally appended to `hr_employee_history` by `private.log_hr_employee_change()`.
- Leave accrual has its own append-oriented `hr_leave_accrual_ledger`.
- Finance cash/payment settlement keeps its existing Finance transaction/link audit trail; Personnel does not add a second settlement ledger.
- PER closeout adds covering indexes for the production Advisor-reported HR actor/audit foreign keys so audit joins do not become table scans at scale.

### Pagination / performance contract

- Organization reference masters (Departments and Positions) are intentionally low-cardinality reference lists.
- Attendance is server-filtered by date range; Compliance and Compensation are server-filtered by selected employee; Payroll items are server-filtered by selected run.
- Data-heavy employee, leave, lifecycle, document, performance and benefit history surfaces must use bounded/server-filtered result sets rather than unbounded historical reads.
- HR Reports must use bounded periods/count/aggregate-oriented reads; it must not pull indefinite historical detail solely to compute dashboard totals.
- Finance payroll settlement displays only approved HR obligations and paginates the rendered result set; cash entry always routes to the Finance transaction workflow.

### UI standard and regression contract

- Production Personnel UI uses Modulex shared Admin primitives for cards, fields, actions, feedback/status and tables on changed/modernized surfaces.
- Personnel pages retain dark-mode, responsive and accessible-label/error/loading behavior required by `personnel-ui-contract.mjs`, `leave-ui-contract.mjs` and the Admin UI strict changed-file gate.
- No route may ship TailAdmin demo copy, dead links, `coming soon`, `placeholder`, or local fake data.
- Personnel final regression additionally locks the full production route set, Leave RPC lifecycle, Finance settlement boundary, canonical migration and roadmap closeout.

## PER-A3 — HR / Finance boundary

### HR-owned

HR owns employee master data, attendance, leave, compliance elections, compensation rates, bonus/commission/incentive source records, payroll deductions, employee advances, benefit elections, payroll periods, payroll runs/items, tax inputs, calculation and payroll approval.

The public mutation RPCs `prepare_hr_payroll_run` and `set_hr_payroll_run_status`, plus direct write RLS on payroll periods/runs/items, must authorize only `super_admin`, `admin`, or `hr`.

### Finance-owned

Finance owns actual cash/payment settlement. Approved HR payroll items are projected to Finance as obligations. Finance records employee payments through the canonical Finance transaction workflow (`employee_payment`) and existing transaction links. Paid/partial/remaining status is derived from posted Finance transactions.

There is exactly one cash/payment ledger: the Finance ledger. Personnel does not create a parallel payment table or a manual HR paid flag for new settlement operations.

The Finance Payroll route is therefore a settlement/read surface. It must not expose HR period creation, payroll preparation/recalculation, tax editing, or HR approval actions.

## PER-A4 — Production acceptance requirements

Closeout is complete only when all of the following are true:

- Personnel final deterministic contract passes after first demonstrating a red pre-fix run.
- Existing Personnel UI and Leave regression contracts pass.
- RBAC regression proves Finance has Finance access but no Personnel access.
- Production migration is present in canonical `modulex-store/supabase/migrations` with the exact applied version.
- Production Security/Performance Advisors are reviewed after migration; HR unindexed FK findings are closed, while intentionally internal RLS-without-policy tables remain client-inaccessible by grants.
- Typecheck, lint and production build pass.
- Signed-in production smoke verifies Personnel and Finance payroll settlement pages without persistent mutation.
- `ADMIN_ROADMAP.md` PER-A1 through PER-A4 are marked `[x]` only after the above gates are green.
