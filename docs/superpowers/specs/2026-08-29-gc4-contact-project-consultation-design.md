# GC-4 Contact / Project Consultation Design

Date: 2026-08-29
Status: Approved
Base: `main` at `183afb6b8c006c2e0f10f4b491aad62b1224305f`

## Goal

Migrate Granite Center's useful project-estimate / consultation concepts into Oakwell's native lead flow without importing Wufoo, customer uploads, unapproved business promises, or hard-coded mutable option values.

GC-4 keeps `/contact` as the single public entry point and keeps `lead_type = 'contact'`. A new `request_kind` distinguishes `general_inquiry` from `project_consultation` while preserving existing lead operations, attribution, consent handling, spam controls, and dealer-application behavior.

## Non-goals

- No customer project file upload.
- No changes to dealer supporting-document semantics or privacy.
- No new appointment/SLA promise.
- No seeded project types, service areas, installation claims, promotions, or other business-controlled option values without approval.
- No new public table access.
- No weakening of existing lead RPC/table grants.

## Public Store UX

`/contact` begins the form with a purpose selector:

- General Inquiry
- Project Consultation

General Inquiry preserves the existing contact flow.

Project Consultation conditionally exposes:

- project type, when active Admin-configured values exist;
- consultation intent, when active Admin-configured values exist;
- project address;
- project city;
- project postal code;
- preferred consultation date, explicitly presented as a preference rather than an appointment promise;
- existing `message` as project notes.

Name, email, privacy acknowledgement, marketing-consent separation, attribution capture, and current submission feedback stay intact. Customer upload remains absent.

If no approved options exist for a configurable selector, that selector is not rendered. The migration therefore seeds no business option values.

## Lead Data Model

Extend `public.store_leads` with:

- `request_kind text not null default 'general_inquiry'`
- `project_type text null`
- `consultation_intent text null`
- `project_address text null`
- `project_city text null`
- `project_postal_code text null`
- `preferred_consultation_date date null`

Constraints:

- `request_kind` is limited to `general_inquiry | project_consultation`.
- Dealer applications must remain `general_inquiry` and must not persist GC-4 project fields.
- Project fields may only be persisted for `lead_type = 'contact'` and `request_kind = 'project_consultation'`.
- `project_type` and `consultation_intent`, when present, must resolve to currently active Admin-managed option keys in their corresponding groups.
- Existing `message` remains the notes field; no duplicate project-notes column is introduced.

Backward compatibility: contact payloads that omit `request_kind` are interpreted as `general_inquiry`.

## Admin-managed Form Options

Add `public.store_lead_form_options` as the mutable business configuration domain.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `option_group text not null` limited to `project_type | consultation_intent`
- `option_key text not null`
- `label text not null`
- `is_active boolean not null default true`
- `sort_order integer not null default 100`
- standard `created_at`, `updated_at`, `updated_by`

Rules:

- unique `(option_group, option_key)`;
- keys are stable machine identifiers with a conservative slug constraint;
- labels are human-readable and length-bounded;
- no seed rows in GC-4;
- authenticated Store managers can administer rows through RLS; Sales cannot mutate configuration;
- anonymous users receive no direct table grants.

## Public Options Projection

Public Store reads only active option metadata through the established narrow-projection architecture:

1. `store_api_private.get_store_public_lead_form_options()` is `SECURITY DEFINER` and returns only `option_group`, `option_key`, `label`, `sort_order` for active rows.
2. `public.get_store_public_lead_form_options()` is a `SECURITY INVOKER` SQL wrapper with a constrained search path.
3. Public execute is granted only to the roles needed by the Store; no table SELECT is granted to anon.

The Store treats projection failure as an empty option list, preserving fail-closed rendering.

## Lead Submission Security Boundary

Production currently uses a hardened split that is newer than the oldest repository migration:

- `public.submit_store_lead(jsonb)` — `SECURITY INVOKER`, narrow wrapper, execute for `anon` and `service_role`, not `authenticated`;
- `store_api_private.submit_store_lead(jsonb)` — `SECURITY DEFINER`, actual validation/insert implementation.

GC-4 must reconcile the repository to that production architecture rather than recreate the older public `SECURITY DEFINER` implementation.

The private implementation keeps all existing checks and adds:

- request-kind normalization/backward compatibility;
- conservative length/date validation for project scalar fields;
- rejection of GC-4 project fields on dealer applications;
- active-option validation for project type / consultation intent;
- persistence of GC-4 fields only for project consultations;
- existing dealer document-token hashing behavior unchanged.

The public wrapper remains invoker-only. Function EXECUTE grants are explicitly revoked/granted; no reliance on PostgreSQL default function privileges.

## Store API Contract

`modulex-store/src/app/api/leads/route.ts` remains the only browser-facing submission endpoint.

Preserve:

- POST-only behavior;
- 32 KB body limit;
- same-origin check;
- JSON parsing guard;
- honeypot;
- required name/email/privacy checks;
- attribution (`source`, UTM fields, landing page, referrer);
- separate optional marketing consent;
- dealer document token generation and upload flow;
- generic failure responses.

Add code-owned allowlisting/validation for GC-4 values before sending the RPC payload. Project fields are accepted only for contact/project-consultation requests.

## Store Data Access

Add a small server-only lead-form-options reader using the public RPC and the existing public Supabase URL/publishable key pattern. It returns a typed empty array on configuration/projection failure.

`/contact` supplies those options to `LeadForm`, which groups them by option group and renders conditional selects only when entries exist.

## Admin UX and RBAC

Existing `/store/leads` remains usable by the current lead-view roles.

Add `/store/leads/form-options`:

- visible/editable only to roles that already have Store management authority;
- list, create, edit label/key/group, activate/deactivate, and sort options;
- no Sales mutation access;
- no browser use of elevated keys.

Admin lead detail adds a `Project Consultation` panel when applicable, showing request kind, configured keys/labels where resolvable, project location, preferred date, and notes context. General inquiries and dealer applications retain their current layout and workflow.

## Testing Strategy

Follow TDD:

1. Add RED contract tests for the migration/security architecture and GC-4 schema.
2. Add RED Store API tests for request-kind normalization, dealer isolation, field validation, and preserved attribution/privacy behavior.
3. Add RED Store UI/data tests for conditional project fields and fail-closed options.
4. Add RED Admin tests for form-options RBAC and project-consultation detail rendering.
5. Implement until focused tests are GREEN, then run full relevant Store/Admin lint/type/build/test suites.

Database verification must assert:

- public submission wrapper is not `SECURITY DEFINER`;
- private submission implementation is `SECURITY DEFINER`;
- authenticated cannot execute public submit RPC;
- anon has no direct `store_leads` or `store_lead_form_options` table access;
- Store-manager RLS/config mutation is constrained;
- spoofed or inactive option keys are rejected;
- dealer document behavior remains unchanged.

## Production Acceptance

After merge/deploy approval:

- apply migration through the normal Supabase migration path;
- verify security/performance advisors and grants/RLS;
- verify public options projection returns empty safely before business options are configured;
- submit one General Inquiry and one Project Consultation with test attribution/privacy data;
- confirm Admin lead list/detail rendering and existing workflow actions;
- confirm dealer application/document flow regression remains clean;
- update GC-4 roadmap/acceptance documentation only after production evidence passes.
