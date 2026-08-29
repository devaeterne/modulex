import fs from "node:fs";

const path = "ADMIN_ROADMAP.md";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(from, to) {
  if (!text.includes(from)) {
    throw new Error(`Expected roadmap text not found: ${from.slice(0, 100)}`);
  }
  text = text.replace(from, to);
}

replaceOnce(
  "Main baseline: `8ad3eaa928f2955fdcd0b4ae5c646f1f19101796`",
  "Main baseline: `98ca9f264fbae5a039ec117877842e0ca5287c0e`"
);
replaceOnce(
  "Current Admin next action: **A1.1C — customer detail action hierarchy, secure portal-enabled lifecycle consistency, and atomic default-address behavior**",
  "Current Admin next action: **A1.2A — review global and customer-scoped order list consistency**"
);
replaceOnce(
  "- [~] Review customer detail information architecture and action hierarchy.\n  - A1.1C removes the route-level CSS that hid a duplicate legacy portal tab and makes the hierarchy explicit: customer operations → core customer card → secure Store portal lifecycle → documents.",
  "- [x] Review customer detail information architecture and action hierarchy.\n  - A1.1C removed the route-level CSS that hid a duplicate legacy portal tab and made the hierarchy explicit: customer operations → core customer card → secure Store portal lifecycle → documents.\n  - PR #122 merged as `8ad3eaa928f2955fdcd0b4ae5c646f1f19101796`; Admin Vercel production deployment `dpl_3rXooxJDgD7rtbecjymSVuVDi83p` is `READY`. Current `main` has since advanced to `98ca9f264fbae5a039ec117877842e0ca5287c0e` through GC-2C and remains production `READY`."
);
replaceOnce(
  "- [~] Verify portal-enabled changes use the secure lifecycle API consistently across all customer-detail surfaces. (A1.1C)\n  - The duplicate browser-DML Web / Portal surface is removed; portal enable/disable and portal-user lifecycle remain only in the dedicated Admin server API surface.",
  "- [x] Verify portal-enabled changes use the secure lifecycle API consistently across all customer-detail surfaces. (A1.1C)\n  - The duplicate browser-DML Web / Portal surface is removed; portal enable/disable and portal-user lifecycle remain only in the dedicated Admin server API surface.\n  - Production acceptance confirmed the deployed customer-detail surface contains the A1.1C merge while portal lifecycle mutations remain server-mediated."
);
replaceOnce(
  "- [~] Verify address management and default-address behavior. (A1.1C)\n  - Address create/default assignment moves to SECURITY INVOKER RPCs that lock the customer row and write default changes + activity atomically under existing RLS.",
  "- [x] Verify address management and default-address behavior. (A1.1C)\n  - Production migration `20260829165525_customer_address_integrity` installed `create_customer_address(...)` and `set_customer_address_default(...)` as `SECURITY INVOKER` RPCs with an empty `search_path`; execution is granted to `authenticated` and revoked from `anon`/`public`.\n  - Live acceptance used an authenticated Admin context inside an explicit transaction and rollback. Two compatible addresses were created, billing/shipping defaults were moved atomically to the requested address, exactly one active default of each kind remained, and the expected `customer_activity` rows were written in the same transaction.\n  - A profiles-less authenticated caller was rejected with `42501`. Rollback verification confirmed zero acceptance addresses and zero acceptance activity rows persisted.\n  - Post-DDL Supabase advisors reported no A1.1C-specific security or performance finding; remaining Store SECURITY DEFINER warnings, leaked-password protection, unindexed-FK/unused-index backlog, and Store permissive-policy warnings are outside this package."
);

fs.writeFileSync(path, text);
