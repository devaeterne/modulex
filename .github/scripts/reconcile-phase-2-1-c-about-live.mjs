import { readFile, writeFile } from "node:fs/promises";

const BASELINE = "01d3fe68b35e346aced37f13fb3baadbd741c955";

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
    "- [~] Convert About page to CMS-backed production content.",
    "- [x] Convert About page to CMS-backed production content.",
    "About completion"
  );
  text = replaceOnce(
    text,
    "  - Branch verification passed in GitHub Actions run `33244098018`; completion remains pending merge/deploy plus production acceptance with approved published About content.",
    "  - Branch verification passed in GitHub Actions run `33244098018`. Production acceptance completed after PR #99 merge/deploy: an approved factual `about` row is published in production, the anonymous public RPC returns it, and live `/about` renders the CMS title/intro/CTA with 200/indexable metadata after Vercel revalidation.",
    "About live evidence"
  );
  text = replaceOnce(
    text,
    "Phase 2.1C implementation is **code-complete and verified on the feature branch**, but About/Gallery remain `[~]` until production acceptance.",
    "Phase 2.1C About is **production-accepted and complete**. Gallery/Projects remains `[~]` until approved real Gallery/Project content is published and live readiness is accepted.",
    "Store next-action summary"
  );
  text = replaceOnce(text, "1. Review and merge the Phase 2.1C PR to `main`, then deploy Store production.", "1. Publish an approved `gallery` page plus at least one approved project with cover image/alt text.", "Store next action 1");
  text = replaceOnce(text, "2. In Admin, publish approved real `about` content. The existing factual About fallback remains safe until that content is published.", "2. Verify production `/gallery`, Navbar readiness, sitemap exposure, metadata, and project media/lightbox behavior.", "Store next action 2");
  text = replaceOnce(text, "3. Publish an approved `gallery` page plus at least one approved project with cover image/alt text; only then should Gallery appear in Navbar and sitemap.", "3. Confirm `/gallery/detail` remains not-found, then mark Gallery/Projects complete.", "Store next action 3");
  text = replaceOnce(text, "4. Verify production `/about`, `/gallery`, Navbar readiness behavior, sitemap exposure, metadata, project media/lightbox, and confirm `/gallery/detail` remains not-found.", "4. Proceed to Package D — configurable Navbar/Footer and Phase 2.1 closeout.", "Store next action 4");

  await writeFile(file, text);
}

async function updateAdmin() {
  const file = "modulex-admin/ADMIN_ROADMAP.md";
  let text = await readFile(file, "utf8");

  text = replaceOnce(text, /Main baseline: `[^`]+`/, `Main baseline: \`${BASELINE}\``, "Admin baseline");
  text = replaceOnce(
    text,
    /Current cross-roadmap package: \*\*Store Phase 2\.1C[^\n]*\*\*/,
    "Current cross-roadmap package: **Store Phase 2.1C — About live accepted; Gallery/Projects content acceptance pending**",
    "Admin cross-roadmap status"
  );
  text = replaceOnce(
    text,
    "No new Admin schema or production database change is required for Package C.",
    "No new Admin schema or production database change is required for Package C. About production content is now published and live-accepted; Gallery remains intentionally closed until approved real project content exists.",
    "Admin About live evidence"
  );

  await writeFile(file, text);
}

await updateStore();
await updateAdmin();
console.log("Phase 2.1C About live acceptance roadmaps reconciled.");
