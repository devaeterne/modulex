import { readFile, writeFile } from "node:fs/promises";

const BASELINE = "41aa1f0b1c27460e5ef298242162518c2bf93606";
const VERIFY_RUN = "33243001683";

function replaceOnce(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Roadmap replacement did not match: ${label}`);
  return next;
}

async function updateStore() {
  const file = "modulex-store/STORE_ROADMAP.md";
  let text = await readFile(file, "utf8");

  text = replaceOnce(
    text,
    /Main baseline: `[^`]+`\nCurrent phase: \*\*[^\n]+\*\*/,
    `Main baseline: \`${BASELINE}\`\nCurrent phase: **Phase 2.1 — Public Content & CMS Expansion**`,
    "Store header"
  );

  text = replaceOnce(text, "- [~] Remove all production placeholders across Store.", "- [x] Remove all production placeholders across Store.", "Store placeholders status");
  text = replaceOnce(
    text,
    "  - **Done when:** automated contract test passes with zero blocked placeholder patterns.\n",
    "  - **Done when:** automated contract test passes with zero blocked placeholder patterns.\n  - Verified by the public-production contract in the passing Store smoke chain; no blocked production placeholder pattern remains in the guarded surface.\n",
    "Store placeholders evidence"
  );
  text = replaceOnce(text, "- [~] Add a public-production content contract.", "- [x] Add a public-production content contract.", "Store contract status");
  text = replaceOnce(
    text,
    "  - Contract is implemented and wired to smoke; execution evidence for the full smoke chain is still required.",
    "  - Contract is implemented, wired to `npm run smoke`, and passed in the fresh local full Store smoke run on 2026-08-29.",
    "Store contract evidence"
  );
  text = replaceOnce(text, "- [ ] `npm run lint` passes.", "- [x] `npm run lint` passes.\n  - Fresh local evidence: 0 errors / 11 existing `@next/next/no-img-element` warnings.", "Store lint gate");
  text = replaceOnce(text, "- [ ] `npm run smoke` passes.", "- [x] `npm run smoke` passes.\n  - Fresh local full smoke passed public production, secondary CMS, client, API, dealer auth/activation, portal experience/auth guard, and public-navbar contracts.", "Store smoke gate");
  text = replaceOnce(
    text,
    /\*\*Phase 2\.0 closeout blocker:\*\*[^\n]+/,
    "**Phase 2.0 closeout:** formally closed on 2026-08-29. Production truth/indexing/crawl checks, build, fresh lint, and the full Store smoke chain are all verified.",
    "Store Phase 2.0 closeout"
  );

  text = replaceOnce(
    text,
    /\*\*Approved architecture \(written-spec review pending\):\*\*/,
    "**Approved architecture and written specs:**",
    "Store architecture approval"
  );
  text = replaceOnce(text, "- [~] Define the CMS model for secondary public pages.", "- [x] Define the CMS model for secondary public pages.", "Store 2.1A model");
  text = replaceOnce(text, "- [ ] Add migrations/RPCs for approved public page content.", "- [x] Add migrations/RPCs for approved public page content.", "Store 2.1A migration status");
  text = replaceOnce(
    text,
    "  - Admin edits remain authenticated and role-controlled.\n",
    "  - Admin edits remain authenticated and role-controlled.\n  - Package A migration is merged and applied to production Supabase; `store_pages`, `store_projects`, `store_project_media`, RLS boundaries, and the four narrow published-only public RPCs were verified in production.\n",
    "Store 2.1A production evidence"
  );
  text = replaceOnce(text, "- [ ] Add corresponding Admin CMS screens.", "- [x] Add corresponding Admin CMS screens.", "Store 2.1B admin status");
  text = replaceOnce(
    text,
    "  - Design: `docs/superpowers/specs/2026-08-29-phase-2-1-b-admin-secondary-cms-design.md`.\n",
    `  - Design: \`docs/superpowers/specs/2026-08-29-phase-2-1-b-admin-secondary-cms-design.md\`.\n  - Package B implementation adds \`/store/pages\` and \`/store/projects\`, explicit draft/publish/unpublish actions, SEO/OG fields, validated Store media uploads, external video media, and \`store.manage\` route/sidebar enforcement.\n  - Verification: secondary CMS Admin contract, lint (0 errors / 35 existing warnings), deterministic Admin contracts, and Next.js/TypeScript build all passed in GitHub Actions run \`${VERIFY_RUN}\`.\n`,
    "Store 2.1B evidence"
  );
  text = replaceOnce(text, "- [~] Decide Blog strategy.", "- [x] Decide Blog strategy.", "Store blog decision");
  text = replaceOnce(
    text,
    "- [ ] Admin roles can manage the supported content without direct database work.",
    "- [x] Admin roles can manage the supported content without direct database work.\n  - Package B provides controlled Pages/Projects CRUD and publish workflows under existing authenticated RLS.",
    "Store 2.1 exit admin management"
  );
  text = replaceOnce(
    text,
    "- [ ] Draft content is not publicly visible.",
    "- [x] Draft content is not publicly visible.\n  - Package A public RPCs filter to `status = 'published'`; Admin writes remain behind authenticated RLS.",
    "Store draft visibility"
  );

  text = replaceOnce(
    text,
    /# Next Action[\s\S]*$/,
    `# Next Action\n\nPrimary Store work is now **Phase 2.1C — Store About + Gallery/Projects**.\n\n1. Wire \`modulex-store/src/lib/store/content/queries.ts\` to the approved published-only Package A RPCs.\n2. Convert About to CMS-backed copy while retaining canonical company-profile identity/contact data and the factual fallback.\n3. Enable Gallery only when the Gallery page is published and at least one project is published; otherwise keep deliberate not-found behavior and omit it from sitemap/navigation.\n4. Bind real project/media data to the existing gallery/lightbox experience without adding a public project-detail route in Phase 2.1.\n5. Add metadata/sitemap/contract coverage, run Store lint/build/smoke/live verification, and update both roadmaps where cross-project behavior changes.\n\n**Completed dependency chain:** Phase 2.0 closed → Phase 2.1A production data/RPC foundation complete → Phase 2.1B Admin Pages/Projects CMS complete. Package D navigation/footer configurability remains after Package C.\n`,
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
    "Current phase: **Phase A0 — Production Surface & Operational Truth Cleanup**",
    "Current phase: **Phase A0 — Production Surface & Operational Truth Cleanup**\nCurrent cross-roadmap package: **Store Phase 2.1B — Admin Pages/Projects CMS complete; next dependency is Store Phase 2.1C**",
    "Admin cross-roadmap phase"
  );

  text = replaceOnce(text, "- [ ] `npm run lint` passes.", "- [x] `npm run lint` passes.\n  - Fresh Package B CI evidence: 0 errors / 35 existing warnings.", "Admin A0 lint gate");
  text = replaceOnce(text, "- [ ] `npm run build` passes.", "- [x] `npm run build` passes.\n  - Fresh Package B Next.js/TypeScript build passed in GitHub Actions.", "Admin A0 build gate");
  text = replaceOnce(text, "- [ ] `npm run smoke` passes.", "- [x] `npm run smoke` passes.\n  - Full local Admin smoke passed on 2026-08-29 through RBAC, API/RLS, Phase 1 API/DB, dealer onboarding/DB, portal Admin contracts, auth recovery, and polling. Package B additionally has a fresh targeted CMS contract plus deterministic contract verification.", "Admin A0 smoke gate");

  text = replaceOnce(text, "- [~] Expand CMS for production secondary pages in coordination with `STORE_ROADMAP.md` Phase 2.1.", "- [x] Expand CMS for production secondary pages in coordination with `STORE_ROADMAP.md` Phase 2.1.", "Admin A4.1 secondary CMS");
  text = replaceOnce(
    text,
    "  - Approved architecture is split into ordered Store Phase 2.1 packages A → B → C → D; written spec review is pending before implementation.\n  - Package B adds dedicated `/store/pages` and `/store/projects` management rather than extending the large existing Site Content editor.",
    `  - Approved architecture is split into ordered Store Phase 2.1 packages A → B → C → D; all four written specs are approved.\n  - Package B adds dedicated \`/store/pages\` and \`/store/projects\` management rather than extending the large existing Site Content editor.\n  - Implemented with \`store.manage\` route/sidebar enforcement, admin/super_admin mutation controls, and existing production RLS as the real write boundary.\n  - Verification: targeted secondary CMS Admin contract, lint, deterministic Admin contracts, and build passed in GitHub Actions run \`${VERIFY_RUN}\`.`,
    "Admin A4.1 evidence"
  );
  text = replaceOnce(text, "- [ ] Add draft/published workflow where required.", "- [x] Add draft/published workflow where required.\n  - Pages and Projects expose separate Save draft / Publish / Unpublish actions; uploads do not auto-publish.", "Admin draft publish workflow");
  text = replaceOnce(text, "- [ ] Add SEO/OG/media fields with validation.", "- [x] Add SEO/OG/media fields with validation.\n  - Page hero/OG and project cover/OG uploads use `store-media` with JPEG/PNG/WebP/AVIF ≤20 MB validation; project media also supports external public video URLs with required alt text.", "Admin SEO media status");

  text = replaceOnce(
    text,
    "- [x] Store portal Admin contract exists.\n",
    "- [x] Store portal Admin contract exists.\n- [x] Secondary CMS Admin contract exists and protects Pages/Projects routes, RBAC, lifecycle actions, media constraints, and service-role exclusion.\n",
    "Admin test foundation secondary CMS"
  );
  text = replaceOnce(
    text,
    "- [x] Customer document dealer-visibility controls exist.\n",
    "- [x] Customer document dealer-visibility controls exist.\n- [x] Phase 2.1B secondary Pages/Projects CMS exists with controlled page slugs, project/media management, explicit publishing, SEO/OG fields, and Store media validation.\n",
    "Admin completed foundation Package B"
  );

  text = replaceOnce(
    text,
    /# Next Action[\s\S]*$/,
    `# Next Action\n\nPrimary Admin roadmap work remains **Phase A0 — Production Surface & Operational Truth Cleanup**.\n\nRecommended first A0 implementation package remains:\n\n1. Build a route/navigation inventory and classify every current Admin route as production, planned, or demo/template.\n2. Add a production-surface contract that detects TailAdmin demo routes/navigation.\n3. Remove/hide the clearly unused demo pages and navigation entries.\n4. Verify direct-route RBAC behavior for the remaining business surfaces.\n5. Run full Admin lint/build/smoke verification and update this roadmap with the result.\n\n**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete. The next Store dependency is **Phase 2.1C — CMS-backed About + Gallery/Projects**. Package D later returns to Admin A4.1 for configurable ordinary navigation/footer links while Account and Contact remain code-owned.\n`,
    "Admin Next Action"
  );

  await writeFile(file, text);
}

await updateStore();
await updateAdmin();
console.log("Phase 2.1B roadmaps reconciled.");
