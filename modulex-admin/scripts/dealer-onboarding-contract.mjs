import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const conversionMigrationPath = resolve(root, "../modulex-store/supabase/migrations/20260828123000_controlled_dealer_onboarding.sql");
const dlrMigrationPath = resolve(root, "../modulex-store/supabase/migrations/20260910131500_dealer_onboarding_privacy_closeout.sql");
const atomicGuardPath = resolve(root, "../modulex-store/supabase/migrations/20260910144500_dealer_review_atomic_failure_guard.sql");
const advisorGuardPath = resolve(root, "../modulex-store/supabase/migrations/20260910150000_dlr_rpc_advisor_hardening.sql");
const detailPath = resolve(root, "src/components/store/StoreLeadDetail.tsx");
const onboardingPath = resolve(root, "src/components/store/StoreDealerOnboardingActions.tsx");
const pagePath = resolve(root, "src/app/(admin)/store/leads/[id]/page.tsx");
const listPath = resolve(root, "src/components/store/StoreLeadsTable.tsx");
const documentsPath = resolve(root, "src/components/store/StoreLeadDocuments.tsx");
const privacySmokePath = resolve(root, "tests/smoke/dealer-lifecycle-privacy.smoke.sql");

const conversionMigration = readFileSync(conversionMigrationPath, "utf8");
const dlrMigration = readFileSync(dlrMigrationPath, "utf8");
const atomicGuard = readFileSync(atomicGuardPath, "utf8");
const advisorGuard = readFileSync(advisorGuardPath, "utf8");
const detail = readFileSync(detailPath, "utf8");
const onboarding = readFileSync(onboardingPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const list = readFileSync(listPath, "utf8");
const documents = readFileSync(documentsPath, "utf8");
const privacySmoke = readFileSync(privacySmokePath, "utf8");

for (const contract of [
  "private.convert_store_dealer_lead_to_customer",
  "duplicate_customer",
  "pg_advisory_xact_lock",
  "converted_to_customer",
  "created_from_dealer_application",
]) {
  assert.ok(conversionMigration.includes(contract), `Dealer conversion contract missing: ${contract}`);
}

for (const contract of [
  "public.review_store_dealer_application",
  "public.transition_store_dealer_account",
  "reason_required",
  "dealer_approved",
  "dealer_rejected",
  "dealer_deactivated",
  "dealer_reactivated",
  "private.get_store_dealer_portal_context",
  "private.activate_store_dealer_portal_user",
  "c.status = 'active'",
  "ct.system_key = 'dealer'",
  "portal_enabled = true",
]) {
  assert.ok(dlrMigration.includes(contract), `DLR lifecycle migration contract missing: ${contract}`);
}

for (const contract of [
  "set schema private",
  "private.review_store_dealer_application",
  "dlr_review_atomic_failure_guard",
  "PZ101",
  "grant execute on function public.review_store_dealer_application",
]) {
  assert.ok(atomicGuard.includes(contract), `DLR atomic failure guard missing: ${contract}`);
}

for (const contract of [
  "security invoker",
  "private.review_store_dealer_application",
  "private.transition_store_dealer_account",
  "grant execute on function private.review_store_dealer_application",
  "grant execute on function private.transition_store_dealer_account",
  "revoke all on function public.transition_store_dealer_account",
  "grant execute on function public.transition_store_dealer_account",
]) {
  assert.ok(advisorGuard.toLowerCase().includes(contract.toLowerCase()), `DLR Advisor hardening contract missing: ${contract}`);
}

// DLR must compose with the guarded LD workspace that owns lead reads and general conversion.
for (const contract of [
  'rpc("get_store_leads_page"',
  "statusFilter",
  "ownerFilter",
  "pageSize",
]) {
  assert.ok(list.includes(contract), `Guarded Lead list contract missing: ${contract}`);
}
for (const contract of [
  'rpc("get_store_lead_detail"',
  'rpc("update_store_lead_workflow"',
  'rpc("add_store_lead_note"',
  'rpc("set_store_lead_archived"',
  'rpc("convert_store_lead"',
  "Activity",
]) {
  assert.ok(detail.includes(contract), `Guarded Lead detail contract missing: ${contract}`);
}
for (const contract of [
  '.from("store_lead_documents")',
  'supabase.storage.from("dealer-supporting-documents").createSignedUrl',
  "Supporting Documents",
]) {
  assert.ok(documents.includes(contract), `Dealer supporting-document contract missing: ${contract}`);
}

assert.ok(page.includes("StoreDealerOnboardingActions"), "Dealer lifecycle panel is not mounted on lead detail route");
assert.ok(onboarding.includes('rpc("get_store_lead_detail"'), "Dealer lifecycle panel must read Lead state through the guarded LD detail RPC");
assert.doesNotMatch(onboarding, /\.from\("store_leads"\)/, "Dealer lifecycle panel must not bypass the guarded Lead read contract");

for (const contract of [
  'supabase.rpc("review_store_dealer_application"',
  'supabase.rpc("transition_store_dealer_account"',
  '"/api/admin/dealer-portal"',
  'action: "invite"',
  "Approve & Activate Dealer",
  "Reject Dealer Application",
  "Deactivate Dealer",
  "Reactivate Dealer",
  "Decision / lifecycle reason",
]) {
  assert.ok(onboarding.includes(contract), `DLR Admin workflow contract missing: ${contract}`);
}

for (const contract of [
  "duplicate failure was not atomic",
  "cross-customer document leaked",
  "non-staff authenticated identity can read supporting documents",
  "deactivated Dealer retained Portal session access",
  "already_deactivated",
  "already_reactivated",
  "rollback;",
]) {
  assert.ok(privacySmoke.includes(contract), `DLR rollback/negative smoke contract missing: ${contract}`);
}

console.log("DLR dealer onboarding + document privacy contract: PASS");
