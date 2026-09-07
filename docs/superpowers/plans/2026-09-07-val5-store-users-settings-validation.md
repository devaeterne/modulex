# VAL-5 Implementation Plan

1. Capture a failing VAL-5 contract against the current Admin surfaces.
2. Fix exact-decimal mutation boundaries for Payment Methods and Tax Rules.
3. Add field-level validation and first-invalid focus to Users and General Settings.
4. Add field-level validation and first-invalid focus to remaining Store CMS forms while preserving existing publish/RLS boundaries.
5. Wire VAL-5 into the normal Admin smoke chain, keep the roadmap in progress, and run full exact-head regression gates.
6. Leave production acceptance for the post-merge deployment gate.
