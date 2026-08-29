import { readFile, writeFile } from "node:fs/promises";

const BASELINE = "be710a72b1b69c0cdc41f39f08e6223ce646328b";
const VERIFY_RUN = "33244098018";

function replaceOnce(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Roadmap replacement did not match: ${label}`);
  return next;
}

async function updateStore() {
  const file = "modulex-store/STORE_ROADMAP.md";
  let text = await readFile(file, "utf8");

  text = replaceOnce(text, /Main baseline: `[^`]+`/, `Main baseline: \`${BASELINE}\``, "Store baseline");
  text = replaceOnce(
    text,
    "- [ ] Convert About page to CMS-backed production content.",
    `- [~] Convert About page to CMS-backed production content.\n  - Package C implementation reads the published \`about\` projection through the approved RPC query layer, keeps company-profile identity/contact canonical, generates CMS metadata, and retains the factual fallback when CMS data is missing or unavailable.\n  - Branch verification passed in GitHub Actions run \`${VERIFY_RUN}\`; completion remains pending merge/deploy plus production acceptance with approved published About content.`,
    "Store About Package C status"
  );
  text = replaceOnce(
    text,
    "- [ ] Convert Gallery/Projects page to CMS-backed data.\n  - Design for both public routes: `docs/superpowers/specs/2026-08-29-phase-2-1-c-store-public-pages-design.md`.",
    `- [~] Convert Gallery/Projects page to CMS-backed data.\n  - Design for both public routes: \`docs/superpowers/specs/2026-08-29-phase-2-1-c-store-public-pages-design.md\`.\n  - Package C implementation adds published-only project/media rendering, fail-closed \`notFound()\`, CMS metadata, accessible image/video interaction, and shared readiness gating for route navigation and sitemap exposure.\n  - No public project-detail route or \`/gallery/detail\` was reintroduced. Completion remains pending merge/deploy plus production acceptance with a published Gallery page and at least one approved published project.`,
    "Store Gallery Package C status"
  );
  text = replaceOnce(
    text,
    "- [ ] Public page content is read through controlled RPCs.",
    `- [x] Public page content is read through controlled RPCs.\n  - Package C uses only \`get_store_public_page\`, \`get_store_public_projects\`, \`get_store_public_project\`, and \`get_store_public_project_media\` through the server-only query boundary; no direct public table reads were added.`,
    "Store controlled RPC exit criterion"
  );

  text = replaceOnce(
    text,
    /# Next Action[\s\S]*$/,
    `# Next Action\n\nPhase 2.1C implementation is **code-complete and verified on the feature branch**, but About/Gallery remain \`[~]\` until production acceptance.\n\n1. Review and merge the Phase 2.1C PR to \`main\`, then deploy Store production.\n2. In Admin, publish approved real \`about\` content. The existing factual About fallback remains safe until that content is published.\n3. Publish an approved \`gallery\` page plus at least one approved project with cover image/alt text; only then should Gallery appear in Navbar and sitemap.\n4. Verify production \`/about\`, \`/gallery\`, Navbar readiness behavior, sitemap exposure, metadata, project media/lightbox, and confirm \`/gallery/detail\` remains not-found.\n5. After live acceptance, mark About/Gallery \`[x]\` and proceed to **Phase 2.1D — configurable Navbar/Footer and phase closeout**.\n\n**Package C branch verification:** GitHub Actions run \`${VERIFY_RUN}\` passed the Phase 2.1C public-content contract, public-production contract, full Store smoke, lint, and Next.js/TypeScript build.\n\n**Completed dependency chain:** Phase 2.0 closed → Phase 2.1A production data/RPC foundation complete → Phase 2.1B Admin Pages/Projects CMS complete → Phase 2.1C implementation verified/pending live acceptance.\n`,
    "Store Next Action"
  );

  await writeFile(file, text);
}

async function updateAdmin() {
  const file = "modulex-admin/ADMIN_ROADMAP.md";
  let text = await readFile(file, "utf8");

  text = replaceOnce(text, /Main baseline: `[^`]+`/, `Main baseline: \`${BASELINE}\``, "Admin baseline");
  text = replaceOnce(
    text,
    /Current cross-roadmap package: \*\*[^\n]+\*\*/,
    "Current cross-roadmap package: **Store Phase 2.1C — public About/Gallery implementation verified; merge/deploy and live content acceptance pending**",
    "Admin cross-roadmap package"
  );
  text = replaceOnce(
    text,
    "  - Verification: targeted secondary CMS Admin contract, lint, deterministic Admin contracts, and build passed in GitHub Actions run `33243001683`.",
    `  - Verification: targeted secondary CMS Admin contract, lint, deterministic Admin contracts, and build passed in GitHub Actions run \`33243001683\`.\n  - Package C Store consumer implementation is verified in Store run \`${VERIFY_RUN}\`: published-only About/Gallery queries, fail-closed Gallery readiness, conditional Navbar/sitemap exposure, and project media rendering now consume the Package A/B CMS foundation. No new Admin schema or production database change is required for Package C.`,
    "Admin Package C coordination evidence"
  );

  text = replaceOnce(
    text,
    /# Next Action[\s\S]*$/,
    `# Next Action\n\nPrimary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.\n\nRecommended first A0 implementation package remains:\n\n1. Build a route/navigation inventory and classify every current Admin route as production, planned, or demo/template.\n2. Add a production-surface contract that detects TailAdmin demo routes/navigation.\n3. Remove/hide the clearly unused demo pages and navigation entries.\n4. Verify direct-route RBAC behavior for the remaining business surfaces.\n5. Run full Admin lint/build/smoke verification and update this roadmap with the result.\n\n**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete. **Phase 2.1C code is verified but pending merge/deploy and live acceptance with real published About/Gallery/project content.** After that acceptance, Package D returns to Admin A4.1 for configurable ordinary navigation/footer links while Account and Contact remain code-owned.\n`,
    "Admin Next Action"
  );

  await writeFile(file, text);
}

await updateStore();
await updateAdmin();
console.log("Phase 2.1C roadmaps reconciled.");
