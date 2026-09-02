import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationPath = resolve(root, "../modulex-store/supabase/migrations/20260828123000_controlled_dealer_onboarding.sql");
const detailPath = resolve(root, "src/components/store/StoreLeadDetail.tsx");
const listPath = resolve(root, "src/components/store/StoreLeadsTable.tsx");
const documentsPath = resolve(root, "src/components/store/StoreLeadDocuments.tsx");

const migration = readFileSync(migrationPath, "utf8");
const detail = readFileSync(detailPath, "utf8");
const list = readFileSync(listPath, "utf8");
const documents = readFileSync(documentsPath, "utf8");

const migrationContracts = [
  "private.convert_store_dealer_lead_to_customer",
  "public.convert_store_dealer_lead_to_customer",
  "lead_not_approved",
  "not_dealer_application",
  "already_converted",
  "duplicate_customer",
  "pg_advisory_xact_lock",
  "converted_to_customer",
  "created_from_dealer_application",
  "portal_enabled,\n    created_by",
  "v_lead.assigned_to,\n    false,\n    v_actor",
  "grant usage on schema private to authenticated, service_role",
  "grant execute on function public.convert_store_dealer_lead_to_customer(uuid) to authenticated, service_role",
];

for (const contract of migrationContracts) {
  assert.ok(migration.includes(contract), `Migration contract missing: ${contract}`);
}

// A4 lead operations must remain fully operable from Admin without SQL.
for (const contract of [
  'supabase.from("store_leads").select("*")',
  "statusFilter",
  "typeFilter",
  "assigned_to",
]) {
  assert.ok(list.includes(contract), `Lead list contract missing: ${contract}`);
}

for (const contract of [
  "internal_notes",
  'supabase.from("store_lead_activity")',
  "Assigned To",
  "Activity",
]) {
  assert.ok(detail.includes(contract), `Lead workflow contract missing: ${contract}`);
}

for (const contract of [
  'supabase.from("store_lead_documents")',
  'supabase.storage.from("dealer-supporting-documents").createSignedUrl',
  "Supporting Documents",
]) {
  assert.ok(documents.includes(contract), `Dealer document contract missing: ${contract}`);
}

// Dealer approval must complete the Admin-controlled onboarding handoff:
// approve -> convert customer -> enable portal -> create primary user -> send invitation.
for (const contract of [
  'supabase.rpc("convert_store_dealer_lead_to_customer"',
  '"/api/admin/dealer-portal"',
  '"enable_portal"',
  '"invite"',
  "Approve & Start Dealer Onboarding",
  "Reject Dealer Application",
  "dealerOnboarding",
  "portal_user_id",
]) {
  assert.ok(detail.includes(contract), `A4 dealer onboarding UI contract missing: ${contract}`);
}

assert.doesNotMatch(
  detail,
  /Portal access remains a separate controlled activation step\./,
  "A4 must not strand an approved dealer at a manual customer-only conversion step",
);

console.log("A4 controlled lead + dealer onboarding contract: PASS");
