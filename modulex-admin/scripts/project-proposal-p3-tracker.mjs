import fs from "node:fs";

function replaceOrThrow(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`Tracker patch target not found: ${label}`);
  return text.replace(pattern, replacement);
}

function updatePackageSection(text, heading, nextHeading, status, markChecks) {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`Missing section: ${heading}`);
  const end = text.indexOf(nextHeading, start + heading.length);
  if (end < 0) throw new Error(`Missing next section: ${nextHeading}`);
  let section = text.slice(start, end);
  section = replaceOrThrow(section, /^Status: .*$/m, `Status: ${status}`, `${heading} status`);
  if (markChecks) section = section.replace(/^- \[ \]/gm, "- [x]");
  return text.slice(0, start) + section + text.slice(end);
}

const planPath = "docs/PROJECT_PROPOSAL_PLAN.md";
let plan = fs.readFileSync(planPath, "utf8");
plan = replaceOrThrow(
  plan,
  /^- Current planning baseline: .*$/m,
  "- Current execution baseline for P3: `main` at `0e7d5a66d7334d25660f4a420d8a5333ebb86051` (2026-09-08). P1 is production-accepted, P2 is merged via PR #376, and P3 is isolated in PR #381. Open #369/#380 are US-date standardization/integration work and P3 avoids their ProjectDetailWorkspace surface.",
  "Proposal planning baseline",
);
plan = updatePackageSection(plan, "### P1 — Proposal Core DB + RBAC + Read Model", "### P2 — Project Proposal Admin UI", "`[x] PRODUCTION ACCEPTED`", true);
plan = updatePackageSection(plan, "### P2 — Project Proposal Admin UI", "### P3 — Revision / Send / Acceptance UX", "`[x] MERGED / VERIFIED`", true);
plan = updatePackageSection(plan, "### P3 — Revision / Send / Acceptance UX", "### P4 — Proposal PDF Rendering", "`[~] IMPLEMENTATION VERIFIED — PR #381; MERGE + LIVE ACCEPTANCE PENDING`", true);

if (!plan.includes("| 2026-09-08 | P3 — Revision / Send / Acceptance UX |")) {
  plan = replaceOrThrow(
    plan,
    /(\| 2026-09-07 \| P0 — Design Lock & Baseline \|[^\n]*\n)/,
    `$1| 2026-09-08 | P1 — Proposal Core DB + RBAC + Read Model | Production accepted | PR #370 | Exact merged migrations are live; rollback-safe production acceptance, RBAC/RLS/grants and advisor review completed. |\n| 2026-09-08 | P2 — Project Proposal Admin UI | Merged / verified | PR #376 | Proposal tab, draft editor, Areas, Pricing Groups and authoritative total UI merged; Project Base + Admin UI Foundation green. |\n| 2026-09-08 | P3 — Revision / Send / Acceptance UX | Implementation verified | PR #381 | RED run 34170652759; GREEN Project Base 34170930717 + Admin UI Foundation 34170930765. Merge + signed-in production acceptance pending. |\n`,
    "Proposal progress log",
  );
}

plan = replaceOrThrow(
  plan,
  /## 9\. Current Next Action[\s\S]*$/,
  "## 9. Current Next Action\n\n**Current package: P3 — Revision / Send / Acceptance UX.** Implementation and CI are verified in PR #381. Before marking P3 `[x]`, merge the PR after an execution-time main/open-PR recheck, confirm the Admin production deployment contains the merged SHA, and run signed-in Proposal lifecycle smoke. No P3 schema migration is required because the lifecycle RPC boundary was delivered and production-accepted in P1. After that closeout, the next package is **P4 — Proposal PDF Rendering**.\n",
  "Proposal current next action",
);
fs.writeFileSync(planPath, plan);

const roadmapPath = "modulex-admin/ADMIN_ROADMAP.md";
let roadmap = fs.readFileSync(roadmapPath, "utf8");
roadmap = replaceOrThrow(roadmap, /^Main baseline: `[^`]+`$/m, "Main baseline: `0e7d5a66d7334d25660f4a420d8a5333ebb86051`", "Admin main baseline");
roadmap = replaceOrThrow(
  roadmap,
  /^Current parallel Project package: .*$/m,
  "Current parallel Project package: **Project Base PB-5/PB-6/PB-7 are production-verified. Project Proposal P1 is production-accepted, P2 is merged via PR #376, and P3 Revision / Send / Acceptance UX is implementation-verified in PR #381 with merge + signed-in production acceptance pending.**",
  "Admin current Project package",
);
if (!roadmap.includes("## Project Proposal / Estimate")) {
  roadmap = replaceOrThrow(
    roadmap,
    /\n## Product Master UX v2\n/,
    `\n## Project Proposal / Estimate\n\n- [x] **P1 — Proposal Core DB + RBAC + Read Model.** PR #370 merged; exact canonical Proposal migrations are live in production and rollback-safe production acceptance passed lifecycle integrity, pricing, RBAC/RLS/grants and zero-residue checks. Evidence: \`docs/acceptance/project-proposal-p1.md\`.\n- [x] **P2 — Project Proposal Admin UI.** PR #376 merged; Project Detail now owns Proposal before Orders with draft header editing, flexible Areas, Pricing Groups, server-authoritative totals and read-only revision history. Final Project Base and Admin UI Foundation gates were green.\n- [~] **P3 — Revision / Send / Acceptance UX.** PR #381 adds draft Send, sent New Revision / Reject / exact Accept, retry-safe revision idempotency, acceptance evidence fields, lifecycle error mapping and read-only lifecycle evidence. RED run \`34170652759\`; GREEN Project Base \`34170930717\` and Admin UI Foundation \`34170930765\`. No schema migration is added; merge + signed-in production acceptance remain before `[x]`. Evidence: \`docs/acceptance/project-proposal-p3.md\`.\n- [ ] **P4 — Proposal PDF Rendering.** Do not start until P3 production closeout.\n\n## Product Master UX v2\n`,
    "Admin Proposal roadmap insertion",
  );
}
fs.writeFileSync(roadmapPath, roadmap);

console.log("Project Proposal P3 tracker patch complete");
