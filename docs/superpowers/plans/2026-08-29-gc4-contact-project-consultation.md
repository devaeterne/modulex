# GC-4 Contact / Project Consultation Implementation Plan

> Execute with TDD. Do not merge/deploy automatically; production acceptance is a separate explicit step.

**Goal:** Add project-consultation intake to the native Oakwell contact lead flow with Admin-managed business options, while preserving the hardened public-wrapper/private-definer lead submission boundary and dealer document isolation.

**Architecture:** `/contact` continues to submit through `/api/leads` as `lead_type=contact`; `request_kind` differentiates general inquiries from project consultations. Mutable project-type/consultation-intent choices live in a protected Supabase table exposed publicly only through a narrow invoker RPC. Admin manages those choices through Store-management RBAC.

**Stack:** Next.js 16, React, TypeScript, Supabase/Postgres, existing repository test scripts.

## Task 1 — Reconcile and lock the database contract

**Files:**
- Create: `modulex-store/supabase/migrations/20260829213000_gc4_contact_project_consultation.sql`
- Test: existing SQL contract test location discovered in `modulex-store/tests` / package scripts

1. Write RED tests asserting the GC-4 columns/table/functions/grants and the public-invoker/private-definer split.
2. Confirm RED against current branch.
3. Add `store_leads` GC-4 columns and constraints.
4. Add `store_lead_form_options`, timestamps, RLS and least-privilege grants.
5. Recreate `store_api_private.submit_store_lead(jsonb)` by preserving the production implementation and adding GC-4 validation/persistence.
6. Recreate `public.submit_store_lead(jsonb)` as `SECURITY INVOKER`; explicitly revoke/grant execute to match production.
7. Add private/public active-options projection RPCs with explicit grants.
8. Run focused SQL contract tests until GREEN.

## Task 2 — Extend the Store lead types and server-side options reader

**Files:**
- Modify: `modulex-store/src/lib/store/leads/types.ts`
- Create: `modulex-store/src/lib/store/leads/options.ts`
- Test: matching Store unit/contract tests

1. Add RED tests for request-kind/project-field typing and fail-closed option loading.
2. Add `StoreLeadRequestKind`, GC-4 payload fields, and option types.
3. Implement server-only active-options RPC reader using public URL/publishable key only.
4. Normalize malformed/RPC-failure responses to `[]`.
5. Run focused tests GREEN.

## Task 3 — Extend `/api/leads` without weakening existing guards

**Files:**
- Modify: `modulex-store/src/app/api/leads/route.ts`
- Test: existing lead API tests

1. RED: old contact payload defaults to general inquiry.
2. RED: valid project consultation fields are forwarded.
3. RED: invalid `request_kind`, invalid date/oversized scalar fields, or project fields on dealer application fail.
4. RED: same-origin, body size, honeypot, privacy, attribution, dealer document-token behavior remain unchanged.
5. Implement code-owned normalization/allowlist/length/date validation.
6. Run focused API tests GREEN.

## Task 4 — Add conditional consultation UX on `/contact`

**Files:**
- Modify: `modulex-store/src/app/contact/page.tsx`
- Modify: `modulex-store/src/components/leads/LeadForm.tsx`
- Test: matching Store UI/contract tests

1. RED: contact form exposes General Inquiry / Project Consultation choice.
2. RED: project fields are conditional on request kind.
3. RED: project type / consultation intent selects render only when active options are supplied.
4. RED: no customer upload is rendered for contact/project consultation.
5. Load active options server-side on `/contact` and pass them into `LeadForm`.
6. Add conditional project inputs and payload serialization while preserving analytics, attribution, consent and success/error behavior.
7. Run focused Store tests GREEN.

## Task 5 — Extend Admin lead domain and consultation detail

**Files:**
- Modify: `modulex-admin/src/lib/store/leads.ts`
- Modify: existing `StoreLeadDetail` component path
- Modify if needed: existing `StoreLeadsTable` component path
- Test: matching Admin tests

1. RED: Admin types include GC-4 fields.
2. RED: project consultation detail gets a dedicated section.
3. RED: general inquiry and dealer rendering remain compatible.
4. Implement typed fields and consultation panel.
5. Add request-kind visibility/filter affordance only where it does not disrupt existing table behavior.
6. Run focused Admin tests GREEN.

## Task 6 — Add Admin form-options management

**Files:**
- Create: `modulex-admin/src/app/(admin)/store/leads/form-options/page.tsx` or repository-equivalent route
- Create: form-options component/library files following existing Store CMS patterns
- Modify: Store navigation only if current conventions require an explicit link
- Test: Admin RBAC/contract tests

1. RED: Store managers can access/manage options; Sales cannot mutate configuration.
2. RED: create/update/activate/sort operations use authenticated Supabase/RLS only, never an elevated browser key.
3. Implement list/editor with group, key, label, active state and sort order.
4. Ensure no default business option rows are introduced.
5. Run focused tests GREEN.

## Task 7 — Full regression verification

1. Run Store focused tests and full relevant test command.
2. Run Store lint/type/build.
3. Run Admin focused tests and full relevant test command.
4. Run Admin lint/type/build.
5. Inspect migration SQL for explicit grants/revokes, RLS, function security/search paths, dealer document regression.
6. Compare branch to current base and review for unrelated changes.
7. Fix any failures using the same RED→GREEN loop.

## Task 8 — PR and review

1. Self-review the complete diff against the approved design.
2. Invoke the repository's code-review workflow/checklist.
3. Open a PR titled `feat: deliver GC-4 contact project consultation`.
4. Include scope, security boundary, TDD evidence, and explicit production acceptance steps in the PR body.
5. Stop before merge/deploy unless explicitly instructed.

## Task 9 — Production acceptance after explicit merge/deploy approval

1. Rebase/check merged `main`.
2. Apply migration through normal Supabase deployment flow.
3. Verify schema, function definitions, grants, RLS and Supabase security/performance advisors.
4. Verify empty public option projection is safe before business configuration exists.
5. Create one General Inquiry and one Project Consultation test submission with attribution/privacy assertions.
6. Verify Admin rendering/workflow and dealer regression.
7. Update Store/Admin roadmaps and write GC-4 production acceptance evidence.
