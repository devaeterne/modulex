import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationPath = resolve(root, "../modulex-store/supabase/migrations/20260828123000_controlled_dealer_onboarding.sql");
const detailPath = resolve(root, "src/components/store/StoreLeadDetail.tsx");

const migration = readFileSync(migrationPath, "utf8");
const detail = readFileSync(detailPath, "utf8");

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

const uiContracts = [
  'supabase.rpc("convert_store_dealer_lead_to_customer"',
  "Create Dealer Customer",
  "Creating Customer...",
  "View Customer",
  'lead.status === "approved"',
  "!lead.converted_customer_id",
  "Portal access remains a separate controlled activation step.",
];

for (const contract of uiContracts) {
  assert.ok(detail.includes(contract), `UI contract missing: ${contract}`);
}

console.log("Controlled dealer onboarding contract: PASS");
