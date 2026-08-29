import { readFile, writeFile } from "node:fs/promises";

const adminPath = "modulex-admin/ADMIN_ROADMAP.md";
const storePath = "modulex-store/STORE_ROADMAP.md";

function replaceExact(text, from, to, label) {
  if (!text.includes(from)) {
    throw new Error(`Missing roadmap fragment: ${label}`);
  }
  return text.replace(from, to);
}

let admin = await readFile(adminPath, "utf8");
let store = await readFile(storePath, "utf8");

admin = replaceExact(
  admin,
  "Main baseline: `01d3fe68b35e346aced37f13fb3baadbd741c955`",
  "Main baseline: `fbfa1613970c83117f023d89fec60ac80a6fed97`",
  "admin baseline",
);

admin = replaceExact(
  admin,
  `- [ ] Audit TailAdmin/demo routes under \`src/app/(admin)\`.\n  - Known candidates include chart demos, form elements, basic tables, alerts, avatars, badges, buttons, images, modals, videos, blank page, calendar/profile demos, and \`api-test\`.\n  - **Done when:** every non-business route is either intentionally retained, removed, or inaccessible from production navigation.\n\n- [ ] Remove or disable unused demo pages and their navigation entries.\n  - **Done when:** no generic TailAdmin sample page is reachable through normal Admin navigation unless explicitly required.`,
  `- [x] Audit TailAdmin/demo routes under \`src/app/(admin)\`.\n  - Route classification is recorded in \`docs/ADMIN_PRODUCTION_SURFACE.md\`.\n  - TailAdmin component/chart/form/table/blank/calendar and \`api-test\` demo routes were classified for removal; \`/profile\` is intentionally retained as the Modulex authenticated profile surface.\n  - Personnel, Finance, Approvals, and Training remain explicit A6 scope decisions rather than being silently treated as template residue.\n  - **Done when:** every non-business route is either intentionally retained, removed, or inaccessible from production navigation.\n\n- [x] Remove or disable unused demo pages and their navigation entries.\n  - Removed \`/alerts\`, \`/avatars\`, \`/badge\`, \`/buttons\`, \`/images\`, \`/modals\`, \`/videos\`, \`/bar-chart\`, \`/line-chart\`, \`/form-elements\`, \`/basic-tables\`, \`/blank\`, \`/calendar\`, and \`/api-test\`.\n  - Removed the \`API Test\` System navigation entry.\n  - **Done when:** no generic TailAdmin sample page is reachable through normal Admin navigation unless explicitly required.`,
  "admin demo audit/remove",
);

admin = replaceExact(
  admin,
  `- [ ] Add an Admin production-surface contract test.\n  - Fail on known demo route/nav patterns and intentionally blocked placeholders.\n  - Add to \`npm run smoke\`.`,
  `- [x] Add an Admin production-surface contract test.\n  - \`scripts/admin-production-surface-contract.mjs\` blocks the known demo route files and \`/api-test\` navigation while explicitly protecting the intentional \`/profile\` surface.\n  - Wired as \`npm run smoke:production-surface\` and into the main \`npm run smoke\` chain.\n  - TDD evidence: Actions run \`33248189596\` failed on the first existing demo route before cleanup; run \`33248248681\` passed after route removal.\n  - Full A0 verification run \`33248339553\` passed the production-surface contract, lint, deterministic Admin contracts, and production build.`,
  "admin production contract",
);

admin = replaceExact(
  admin,
  `- [x] \`npm run lint\` passes.\n  - Fresh Package B CI evidence: 0 errors / 35 existing warnings.\n- [x] \`npm run build\` passes.\n  - Fresh Package B Next.js/TypeScript build passed in GitHub Actions.`,
  `- [x] \`npm run lint\` passes.\n  - Fresh A0 CI evidence: Actions run \`33248339553\` passed with 0 errors / 35 existing warnings.\n- [x] \`npm run build\` passes.\n  - Fresh A0 Next.js/TypeScript production build passed in Actions run \`33248339553\`; the generated route manifest no longer contains the removed demo routes.`,
  "admin fresh lint/build evidence",
);

admin = replaceExact(
  admin,
  `- [ ] Production navigation contains only intentional Modulex business surfaces.\n- [ ] Unauthorized direct route access is denied consistently.\n- [ ] No known TailAdmin demo/sample route remains exposed unintentionally.`,
  `- [x] Production navigation contains only intentional Modulex business or explicitly decision-pending surfaces.\n  - Route/navigation classification is documented in \`docs/ADMIN_PRODUCTION_SURFACE.md\`; \`API Test\` was removed from navigation.\n- [ ] Unauthorized direct route access is denied consistently.\n- [x] No known TailAdmin demo/sample route remains exposed unintentionally.\n  - Production-surface contract plus the fresh production build guard the removed route set.`,
  "admin A0 exit surface state",
);

admin = replaceExact(
  admin,
  `- [x] Auth recovery contract exists.\n- [x] Polling regression contract exists.\n- [ ] Add production-surface/demo-route contract.`,
  `- [x] Auth recovery contract exists.\n- [x] Polling regression contract exists.\n- [x] Production-surface/demo-route contract exists and is part of the Admin smoke chain.`,
  "admin A7 contract",
);

admin = replaceExact(
  admin,
  `Recommended first A0 implementation package remains:\n\n1. Build a route/navigation inventory and classify every current Admin route as production, planned, or demo/template.\n2. Add a production-surface contract that detects TailAdmin demo routes/navigation.\n3. Remove/hide the clearly unused demo pages and navigation entries.\n4. Verify direct-route RBAC behavior for the remaining business surfaces.\n5. Run full Admin lint/build/smoke verification and update this roadmap with the result.\n\n**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete. **Phase 2.1C code is verified but pending merge/deploy and live acceptance with real published About/Gallery/project content.** After that acceptance, Package D returns to Admin A4.1 for configurable ordinary navigation/footer links while Account and Contact remain code-owned.`,
  `The first A0 production-surface cleanup package is implemented and verified. Next:\n\n1. Complete the navigation-to-role/permission inventory for current production roles.\n2. Verify unauthorized direct URL behavior for every retained business surface; hidden navigation alone is not authorization.\n3. Audit dashboard widgets, fake/sample values, placeholder links/text, dead buttons, and development-only controls.\n4. Continue A0 runtime/config cleanup: package identity, environment contract, Vercel Admin-domain assumptions, and client/server secret boundaries.\n5. Re-run the relevant Admin verification chain after each package and keep this roadmap current.\n\n**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, and Phase 2.1C About is production-accepted. Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published and live-accepted. Package D returns to Admin A4.1 after that Gallery acceptance for configurable ordinary navigation/footer links while Account and Contact remain code-owned.`,
  "admin next action",
);

store = replaceExact(
  store,
  "Main baseline: `01d3fe68b35e346aced37f13fb3baadbd741c955`",
  "Main baseline: `fbfa1613970c83117f023d89fec60ac80a6fed97`",
  "store baseline",
);

store = replaceExact(
  store,
  `1. Publish an approved \`gallery\` page plus at least one approved project with cover image/alt text.\n2. Verify production \`/gallery\`, Navbar readiness, sitemap exposure, metadata, and project media/lightbox behavior.\n3. Confirm \`/gallery/detail\` remains not-found, then mark Gallery/Projects complete.\n4. Proceed to Package D — configurable Navbar/Footer and Phase 2.1 closeout.\n5. After live acceptance, mark About/Gallery \`[x]\` and proceed to **Phase 2.1D — configurable Navbar/Footer and phase closeout**.`,
  `1. Publish an approved \`gallery\` page plus at least one approved project with cover image/alt text.\n2. Verify production \`/gallery\`, Navbar readiness, sitemap exposure, metadata, and project media/lightbox behavior.\n3. Confirm \`/gallery/detail\` remains not-found, then mark Gallery/Projects complete.\n4. Proceed to Package D — configurable Navbar/Footer and Phase 2.1 closeout.`,
  "store duplicate next action",
);

store = replaceExact(
  store,
  "**Completed dependency chain:** Phase 2.0 closed → Phase 2.1A production data/RPC foundation complete → Phase 2.1B Admin Pages/Projects CMS complete → Phase 2.1C implementation verified/pending live acceptance.",
  "**Completed dependency chain:** Phase 2.0 closed → Phase 2.1A production data/RPC foundation complete → Phase 2.1B Admin Pages/Projects CMS complete → Phase 2.1C About production-accepted; Gallery/Projects content acceptance pending.",
  "store dependency status",
);

await writeFile(adminPath, admin);
await writeFile(storePath, store);
console.log("A0 roadmap reconciliation complete");
