import fs from "node:fs";

const BASELINE = "c0adbfbb431973a3acb4a94902341ac64b11c1de";
const ACTIONS_RUN = "33271713693";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function replaceOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0) throw new Error(`Missing expected text for ${label}`);
  const second = text.indexOf(search, first + search.length);
  if (second >= 0) throw new Error(`Expected unique text for ${label}`);
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}

function replaceRegexOnce(text, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);
  const matches = [...text.matchAll(global)];
  if (matches.length !== 1) {
    throw new Error(`Expected one regex match for ${label}; found ${matches.length}`);
  }
  return text.replace(regex, replacement);
}

// Store roadmap
const storePath = "modulex-store/STORE_ROADMAP.md";
let store = read(storePath);
store = replaceRegexOnce(
  store,
  /^Main baseline: `[^`]+`/m,
  `Main baseline: \`${BASELINE}\``,
  "Store baseline"
);
store = replaceOnce(
  store,
  "- [~] GC-2 — Media library & optimization pipeline.",
  "- [x] GC-2 — Media library & optimization pipeline.",
  "Store GC-2 high-level status"
);
store = replaceOnce(
  store,
  "- [ ] GC-3 — Company identity, contact, About & Showroom migration.",
  "- [x] GC-3 — Company identity, contact, About & Showroom migration.\n  - Production acceptance: `docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md`.",
  "Store GC-3 high-level status"
);
store = replaceOnce(
  store,
  "- [~] **GC-2 — Media Library & Optimization Pipeline**",
  "- [x] **GC-2 — Media Library & Optimization Pipeline**",
  "Store GC-2 execution status"
);

const gc3StoreSection = `\n## Granite Center Migration — GC-3 Execution Status\n\n- [x] **GC-3 — Company identity, Contact, About & Showroom** is production-accepted.\n  - Production migration \`20260829192009_gc3_company_domain\` adds structured contact channels, locations/showrooms, weekly hours, Admin-only RLS, and the narrow public company projection. It deliberately seeds no showroom, hours, directions, alternate channels, or media.\n  - Admin \`/store/company\` is protected by \`store.manage\`, reuses the existing company-profile editor for scalar identity, and manages structured contact/location/hour rows without browser-exposed elevated credentials.\n  - Public Contact preserves canonical profile contact data and augments it only with active structured projection rows. About remains on the existing published About CMS + verified company-profile contract. \`/showroom\` renders only explicitly published \`location_type = 'showroom'\` rows and otherwise returns the truthful empty state.\n  - Final deterministic Admin + Store smoke/lint verification passed in GitHub Actions run \`${ACTIONS_RUN}\`. Current production Admin and Store deployments from \`${BASELINE}\` are \`READY\`; live \`/about\`, \`/contact\`, and \`/showroom\` return 200/indexable responses, and Showroom navigation/footer links are live.\n  - Production DB/advisor evidence was captured in PR #132: initial new-table counts remained zero and the public projection returned empty arrays, with no new GC-3 security or missing-index warning.\n  - Acceptance: \`docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md\`.\n`;
store = replaceOnce(store, "\n# Next Action\n", `${gc3StoreSection}\n# Next Action\n`, "Store GC-3 execution insertion");
store = replaceRegexOnce(
  store,
  /# Next Action\n[\s\S]*$/,
  `# Next Action\n\nThe user-approved active workstream remains the Granite Center → Oakwell migration, executed sequentially by reviewed PRs. Existing Phase 2.1 Gallery/Projects acceptance remains a standing dependency/context and is not discarded.\n\n1. Start **GC-4 — Contact / Project Consultation Form migration** from the current \`main\`, preserving the native \`/api/leads\` security/attribution path and adding only business-approved fields/options.\n2. Keep Gallery/Projects \`[~]\`; GC-5 still owns curated project/media association and final public Gallery acceptance.\n3. GC-3 is closed. Do not seed unconfirmed showroom locations, hours, directions, or showroom media as a shortcut during GC-4.\n`,
  "Store Next Action"
);
write(storePath, store);

// Dedicated Granite roadmap
const granitePath = "modulex-store/docs/OAKWELL_GRANITE_CENTER_MIGRATION_ROADMAP.md";
let granite = read(granitePath);
granite = replaceOnce(
  granite,
  "GC-2 production acceptance: `modulex-store/docs/granite-center/GC2_PRODUCTION_ACCEPTANCE.md`",
  "GC-2 production acceptance: `modulex-store/docs/granite-center/GC2_PRODUCTION_ACCEPTANCE.md`\nGC-3 implementation plan: `docs/superpowers/plans/2026-08-29-gc3-company-identity-contact-about-showroom.md`\nGC-3 production acceptance: `modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md`",
  "Granite GC-3 links"
);

granite = replaceRegexOnce(
  granite,
  /## GC-3 — Company identity, contact, About & Showroom[\s\S]*?(?=\n## GC-4 — Contact \/ Project Consultation)/,
  `## GC-3 — Company identity, contact, About & Showroom\n\nGoal: make real-world Oakwell identity/location content fully data-driven.\n\nStatus: \`[x]\` production-accepted on 2026-08-29. Acceptance: \`modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md\`.\n\n- \`[x]\` add structured contact/location/hour domains with Admin-only write boundaries and a narrow active public projection;\n- \`[x]\` preserve \`general_settings\` as canonical scalar company identity instead of duplicating it;\n- \`[x]\` expose Admin \`/store/company\` under \`store.manage\`;\n- \`[x]\` make Contact consume canonical profile data plus active structured rows without replacing the native first-party lead form;\n- \`[x]\` preserve About on the existing published \`store_pages.slug = 'about'\` CMS + verified company identity contract;\n- \`[x]\` add \`/showroom\` and render only explicitly active showroom rows, with a truthful empty state when none are published;\n- \`[x]\` gate hours/directions behind explicitly supplied and published data; no Sunday, hours, map URL, or showroom is inferred;\n- \`[x]\` add Showroom navigation/footer entry while keeping media/project association outside GC-3.\n\n**Exit gate:** \`[x]\` ordinary structured contact/location/showroom changes are Admin/Supabase-managed and Store reads the controlled projection; current production does not manufacture unconfirmed showroom facts.\n\n`,
  "Granite GC-3 section"
);

granite = replaceRegexOnce(
  granite,
  /# 10\. Next Action\n[\s\S]*$/,
  `# 10. Next Action\n\nGC-0 truth/data ownership is locked; GC-1, GC-2, and GC-3 are production-accepted.\n\n1. Start **GC-4 — Contact / Project Consultation** from the latest \`main\`.\n2. Preserve the existing native \`/api/leads\` path, same-origin/spam/privacy protections, UTM/referrer attribution, and separate marketing consent.\n3. Add only business-approved consultation fields/options; mutable business choices must be Admin/data-managed, while validation/security behavior remains code-owned.\n4. Keep customer file upload deferred unless separately approved; dealer supporting-document infrastructure remains private and separately scoped.\n5. Keep Gallery/Projects \`[~]\`; GC-5 owns curated project/media association and final Gallery acceptance.\n`,
  "Granite Next Action"
);
write(granitePath, granite);

// Admin roadmap: preserve Admin A1 primary work while updating the cross-roadmap package.
const adminPath = "modulex-admin/ADMIN_ROADMAP.md";
let admin = read(adminPath);
admin = replaceRegexOnce(
  admin,
  /^Main baseline: `[^`]+`/m,
  `Main baseline: \`${BASELINE}\``,
  "Admin baseline"
);
admin = replaceRegexOnce(
  admin,
  /^Current cross-roadmap package: \*\*.*\*\*$/m,
  "Current cross-roadmap package: **Granite Center → Oakwell GC-3 company identity, Contact, About & Showroom is production-accepted and complete. GC-4 — Contact / Project Consultation is the next Granite package; Admin primary work remains Phase A1 and the current Admin next action remains A1.2B**",
  "Admin cross-roadmap header"
);
admin = replaceOnce(
  admin,
  "- [x] GC-2 Media Library Admin contract protects `/store/media`, `store.manage` RBAC, private signed previews, metadata/provenance review, and controlled publish/unpublish/delete behavior; it is part of the permanent Admin smoke chain.",
  "- [x] GC-2 Media Library Admin contract protects `/store/media`, `store.manage` RBAC, private signed previews, metadata/provenance review, and controlled publish/unpublish/delete behavior; it is part of the permanent Admin smoke chain.\n- [x] GC-3 Company Admin contract protects `/store/company`, `store.manage` RBAC, reuse of the canonical company-profile editor, and structured contact/location/hour management; it is part of the permanent Admin smoke chain.",
  "Admin A7 GC-3 contract"
);
admin = replaceOnce(
  admin,
  "- [x] GC-2C Admin Media Library exists at `/store/media` with `store.manage` route/sidebar RBAC, asset/provenance review, 5-minute authenticated signed previews for private staging, metadata editing, and server-side publish/unpublish/delete lifecycle controls.",
  "- [x] GC-2C Admin Media Library exists at `/store/media` with `store.manage` route/sidebar RBAC, asset/provenance review, 5-minute authenticated signed previews for private staging, metadata editing, and server-side publish/unpublish/delete lifecycle controls.\n- [x] GC-3 Company workspace exists at `/store/company` with `store.manage` route/sidebar RBAC, canonical profile reuse, and authenticated structured contact/location/hour management. Public Store consumption remains through the narrow active projection.",
  "Admin completed GC-3 workspace"
);
admin = replaceRegexOnce(
  admin,
  /\*\*Cross-roadmap coordination:\*\*[\s\S]*?(?=\n\n\*\*Parallel-work rule:\*\*)/,
  "**Cross-roadmap coordination:** Store Phase 2.1A and 2.1B are complete, Phase 2.1C About is production-accepted, and Gallery/Projects remains intentionally fail-closed until approved real Gallery/Project content is published/live-accepted. Granite GC-1, GC-2, and GC-3 are complete. GC-3 production acceptance is recorded in `modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md`; Admin `/store/company`, structured company RLS/projection, and live Contact/About/Showroom behavior passed final deterministic smoke/lint and production acceptance. **GC-4 — Contact / Project Consultation is next.** Gallery/Projects remains `[~]` and GC-5 owns project/media association. Package D configurable navigation/footer remains an A4.1 obligation under the same dynamic-content rule. Admin primary work remains Phase A1 with current next action A1.2B.",
  "Admin cross-roadmap coordination"
);
write(adminPath, admin);

const acceptancePath = "modulex-store/docs/granite-center/GC3_PRODUCTION_ACCEPTANCE.md";
const acceptance = `# GC-3 Production Acceptance — Company Identity, Contact, About & Showroom\n\nDate: 2026-08-29\n\n**GC-3: complete / production-accepted.**\n\n## Scope accepted\n\n- Structured \`company_contact_channels\`, \`company_locations\`, and \`company_location_hours\` domains with Admin-only write boundaries.\n- Narrow public projection \`get_store_public_company_locations()\` for active structured rows.\n- Admin \`/store/company\` under \`store.manage\`, reusing the canonical company-profile editor for scalar identity.\n- Public Contact preserves canonical profile contact data and optionally augments it from the active structured projection.\n- About remains on the existing published About CMS plus verified company-profile contract.\n- Public \`/showroom\` renders only explicitly published showroom locations and has a truthful empty state when none are published.\n- Showroom is present in public Navbar/Footer navigation.\n\n## Truth and security acceptance\n\nGC-3 does not infer or auto-seed a showroom from the primary company address. It does not invent hours, directions/map URLs, alternate channels, or showroom media. Anonymous direct table access remains revoked; public reads use the dedicated projection. Admin writes remain authenticated/RLS-controlled and browser code receives no service-role/elevated key.\n\nProduction DB/advisor evidence was captured with implementation PR #132 after migration \`20260829192009_gc3_company_domain\`:\n\n- \`company_contact_channels = 0\`\n- \`company_locations = 0\`\n- \`company_location_hours = 0\`\n- public projection: \`{ "contactChannels": [], "locations": [] }\`\n- no new GC-3 security warning or missing-FK-index warning was introduced\n\nThose empty counts are evidence of the no-seed migration state, not a requirement that operators keep the domains empty after business-approved content is entered.\n\n## Verification evidence\n\nImplementation PR #132 merged as \`2eaabcb9d87278f6b9bf78c586f34cb35f131fd5\`. Acceptance was rechecked on current production baseline \`${BASELINE}\`, which contains that merge.\n\n- GitHub Actions \`${ACTIONS_RUN}\`: **success**\n  - Store deterministic smoke contracts: success\n  - Store lint: success\n  - Admin deterministic smoke contracts, including \`smoke:gc3-company-admin\`: success\n  - Admin lint: success\n  - diff whitespace check: success\n- Vercel Admin production deployment \`dpl_9WnAgdgBfmcZCFvYfLC5cqzPFMn5\`: **READY** from \`${BASELINE}\`.\n- Vercel Store production deployment \`dpl_EUiv9aeznJhwYG4Zz1oPBPytVDSd\`: **READY** from \`${BASELINE}\`.\n- Live \`/about\`: 200, indexable, CMS-backed About content with verified company contact data.\n- Live \`/contact\`: 200, indexable, canonical company contact cards plus the native first-party inquiry form.\n- Live \`/showroom\`: 200, indexable, Navbar/Footer links present, and the truthful \`No showroom locations are currently published.\` state with Contact CTA.\n\nThe closeout CI intentionally reran the deterministic smoke/lint surface. Credential-bound Admin API/DB and Store API live suites were not duplicated inside this documentation closeout run; the production DB/RLS/advisor evidence already belongs to PR #132, and the current production routes/deployments were checked directly. No schema, RLS, RPC, production data, or runtime code is mutated by this closeout.\n\n## Deferred ownership\n\n- GC-4 owns Project Consultation / Contact form migration and only business-approved new fields/options.\n- GC-5 owns curated project/media association and final Gallery acceptance.\n- Showroom hours, directions, location rows, and media remain unpublished until explicitly business-approved and entered through the controlled domains.\n\n## Closeout\n\nGC-3 is closed. The next Granite package is **GC-4 — Contact / Project Consultation**.\n`;
write(acceptancePath, acceptance);

console.log("GC-3 roadmap and production acceptance closeout patch applied.");
