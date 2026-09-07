# VAL-5 — Store CMS / Users / Settings Validation

## Goal
Close remaining Admin validation debt in Store CMS, Users, Settings, and other uncovered forms without changing established business architecture or canonical authorization boundaries.

## Scope
- Preserve the database-contract-first method from `modulex-admin/docs/ADMIN_VALIDATION_GUIDE.md`.
- Add field-level validation, invalid-state feedback, and first-invalid focus to uncovered User, General Settings, and Store CMS mutation forms.
- Preserve exact `numeric(7,3)` mutation truth for Payment Method commission and fulfillment Tax Rule rates without JavaScript `Number()` serialization.
- Keep existing Admin Users server API and its role/auth guards authoritative.
- Keep current RLS-protected Store CMS and Settings table boundaries where no canonical mutation RPC exists.
- Preserve existing Store publishability, attribution, slug, CTA, media-alt, and analytics consent constraints.
- Do not modify Finance F7 runtime/schema work in parallel PR #349.

## Acceptance
- RED `val5-store-users-settings-contract.mjs` proves the targeted debt exists before implementation.
- VAL-5 is part of the normal Admin smoke chain and existing Admin UI Foundation workflow; no new wrapper workflow.
- Existing Users/Store, General Settings, RBAC, Store CMS, Admin UI strict, typecheck, lint, and production build regressions remain GREEN.
- No production mutation, migration, or deploy before owner merge/deploy.
- Roadmap remains `[~]` until post-merge production acceptance; code completion alone does not mark VAL-5 `[x]`.
