# Attendance UI/UX Cleanup Implementation Plan

**Goal:** Improve the Personnel Attendance & Absence admin screen without changing Supabase schema, attendance business rules, or data contracts.

**Architecture:** Keep `AttendanceManager` as the client-side orchestration component. Reuse Modulex Admin shared `Button`, `Badge`, table primitives, and admin theme tokens. Preserve the existing `hr_employees` and `hr_attendance_records` queries, the employee/date upsert conflict key, and record deletion behavior.

## Task 1 — Add a focused UI contract

**Files:**
- Create: `scripts/attendance-ui-contract.mjs`
- Modify: `package.json`

Add a lightweight source contract following the existing Admin smoke convention. Assert shared primitives, responsive/table behavior, date formatting, status badges, explicit Actions heading, loading/empty/error states, two-step delete confirmation, update-mode affordance, filter clearing, result count, and standardized field labels.

## Task 2 — Refactor AttendanceManager UI

**File:** `src/components/hr/AttendanceManager.tsx`

- Reuse shared admin field/surface/text tokens.
- Reuse `Button`, `Badge`, and admin table primitives.
- Add deterministic `DD.MM.YYYY` display formatting without timezone conversion.
- Add readable status labels and semantic badge tones.
- Add loading/error/success feedback and retry behavior.
- Show when the selected employee/date will update an existing record.
- Improve responsive form layout and clock field readability.
- Add filter toolbar with result count and Clear filters.
- Replace native confirm with an accessible two-step delete confirmation.
- Improve table contrast, minimum widths, numeric alignment, and action labeling.

## Task 3 — Verify

Run the focused attendance UI contract, Admin UI smoke checks, typecheck, lint for touched files if supported, and production build/CI. Confirm the final diff contains no schema, RPC, API route, or attendance data-contract changes.
