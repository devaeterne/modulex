# GC-5 Implementation Verification Record

This record captures implementation-stage evidence only. Production migration, media review/publication, project publication, Vercel deployment, and roadmap closeout are separate GC-5 acceptance steps and are not claimed here.

## Baseline

- Implementation branch: `feat/gc5-gallery-projects-media-library`
- Main baseline checked during implementation: `cc6be581ca68c0e59f6a076e23d0cd8341c5fe05` (PR #144)
- PR #143 multi-role RBAC is preserved; GC-5 does not rely on single `profile.role` checks for Store management.

## TDD evidence

### Initial GC-5 contracts

The first Store/Admin GC-5 contracts failed against the pre-GC-5 URL/single-role project implementation. After Media Library asset linking, effective-role authorization, hardened public projections, and Gallery attribution were implemented, both contracts reached GREEN in Actions run `33278165206`.

### Clean-replay RBAC reconciliation

A later RED contract proved that the GC-5 Store migration incorrectly depended on the production-only PR #143 helper `private.current_user_has_any_role`. GC-5 now defines `private.store_current_user_has_any_role(text[])`, uses `public.user_roles` when present, and safely falls back to the active legacy `profiles.role` path on a clean Store migration replay.

### Linked-asset attribution propagation

Actions run `33278682720` captured RED for the requirement that a project using any `parent_attributed` cover/gallery image cannot publish as `oakwell_owned`. The migration now derives this with `private.store_project_requires_parent_attribution(uuid)` across both the cover asset and linked project image assets. A parent-attributed project still requires explicit non-empty attribution text and an HTTPS source page URL; those values are not guessed or auto-seeded.

## CI build environment note

Admin build verification requires the public Supabase runtime variables to exist during Next.js prerendering. The branch-only verification workflow supplies non-secret placeholder public configuration for the build step only. It does not use a service-role/elevated credential and does not mutate production.

## Production boundary

No GC-5 production database migration, controlled media intake, media approval/publication, project association/publication, Gallery publication, deployment, or roadmap closeout is represented by this implementation verification record.
