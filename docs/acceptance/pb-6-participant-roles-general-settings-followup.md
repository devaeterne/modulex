# PB-6 Follow-up — Participant Roles in General Settings

Date: 2026-09-05
Branch: `fix/pb6-participant-roles-general-settings`
PR: #313

## Requested behavior

- Keep `Participants & Commission` as a Project Detail tab for per-Project participant assignments and commission ledger operations.
- Move the global participant-role taxonomy out of Project Detail.
- Manage reusable Project participant roles from General Settings.
- Keep participant-role mutation restricted to Admin / Super Admin.
- Keep the internal commission surface restricted to Finance / Admin / Super Admin.

## Implementation

- General Settings exposes `Project Participant Roles` at `/settings/general/project-participant-roles`.
- The route renders the existing guarded `ProjectParticipantRoleManager`, preserving the canonical taxonomy and DB RPCs instead of creating a second settings model.
- The role manager renders and loads data only on the General Settings route, so Project Detail no longer displays the global role-configuration card or performs its role-admin reads.
- The Project `Participants & Commission` tab remains responsible for participant assignment, commission obligations, lifecycle events, and Finance payout attribution only.
- General Settings overview appearance uses shared Admin theme tokens so the strict UI contract remains authoritative.

## Commission basis production fix

The `Commission basis — Unavailable` regression was caused by deployment/schema drift: the merged PB-6 percentage-basis client called `get_customer_project_commission_basis_preview`, but production had not received migration `20260905004500_customer_project_commission_access_basis.sql`.

The merged migration was applied to production before this UI follow-up. Verification for Project `P-2026-000003` returned a canonical whole-Project USD basis of `6635.00`, so a 2% commission preview is USD `132.70`. The preview RPC is executable by `authenticated`, denied to `anon`, and enforces the Finance/Admin/Super Admin role boundary internally.

Historical zero-basis obligations remain immutable and are not silently rewritten.

## TDD

The PB-6 follow-up contract was changed before implementation. Admin Project Base run `33929101218` demonstrated RED on the new settings-placement requirement while the preceding Project contracts remained green.

Final-head Project Base and Admin UI/type/lint/build verification is required before PR #313 is marked ready.
