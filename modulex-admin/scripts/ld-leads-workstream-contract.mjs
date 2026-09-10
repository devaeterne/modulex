import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migrationPath = "modulex-store/supabase/migrations/20260910130000_ld_leads_final_workstream.sql";
assert(exists(migrationPath), "LD final workstream migration must exist");
const migration = exists(migrationPath) ? read(migrationPath).toLowerCase() : "";

for (const token of [
  "get_store_leads_page",
  "get_store_lead_detail",
  "get_store_lead_summary",
  "update_store_lead_workflow",
  "add_store_lead_note",
  "set_store_lead_archived",
  "convert_store_lead",
  "store_lead_conversions",
  "get_admin_store_lead_form_options",
  "upsert_store_lead_form_option",
]) {
  assert(migration.includes(token), `Migration must define ${token}`);
}

assert(
  migration.includes("revoke select, insert, update, delete on public.store_leads from authenticated"),
  "Authenticated callers must not retain direct Store lead CRUD",
);
assert(
  migration.includes("revoke select on public.store_lead_activity from authenticated"),
  "Lead activity must be read through the guarded detail contract",
);
assert(
  migration.includes("revoke select, insert, update, delete on public.store_lead_form_options from authenticated"),
  "Consultation option management must be RPC-authoritative",
);
assert(migration.includes("pg_advisory_xact_lock"), "Conversion must serialize duplicate identity decisions");
assert(migration.includes("idempotency_key"), "Conversion must persist idempotency keys");
assert(migration.includes("archived_at"), "Lead archive state must be persisted");

const table = read("modulex-admin/src/components/store/StoreLeadsTable.tsx");
assert(table.includes('rpc("get_store_leads_page"'), "Lead list must use server-side page RPC");
assert(table.includes('rpc("get_store_lead_summary"'), "Lead summary must be server-authoritative");
assert(!table.includes('.from("store_leads").select("*")'), "Lead list must not load the whole lead table");
assert(table.includes("pageSize"), "Lead list must expose pagination");
assert(table.includes("ownerFilter"), "Lead list must expose owner filtering");

const detail = read("modulex-admin/src/components/store/StoreLeadDetail.tsx");
assert(detail.includes('rpc("get_store_lead_detail"'), "Lead detail must use the guarded detail RPC");
assert(detail.includes('rpc("update_store_lead_workflow"'), "Lead workflow mutations must use RPC");
assert(detail.includes('rpc("add_store_lead_note"'), "Lead notes must be append-only activity mutations");
assert(detail.includes('rpc("set_store_lead_archived"'), "Lead archive must be a DB-authoritative mutation");
assert(detail.includes('rpc("convert_store_lead"'), "Lead conversion must use the idempotent conversion RPC");
assert(!detail.includes('.from("store_leads").update('), "Lead detail must not directly update store_leads");
assert(detail.includes("Convert to Customer"), "Customer conversion action must be exposed");
assert(detail.includes("Create Project"), "Project conversion action must be exposed");
assert(detail.includes("Create Dealer Customer"), "Dealer conversion action must remain separate from portal onboarding");

const docs = read("modulex-admin/src/components/store/StoreLeadDocuments.tsx");
assert(!docs.includes('.from("store_leads")'), "Supporting-documents UI must not bypass guarded lead detail access");
assert(docs.includes('rpc("get_store_lead_detail"'), "Supporting-documents UI must identify lead type through guarded detail RPC");

const options = read("modulex-admin/src/components/store/StoreLeadFormOptionsManager.tsx");
assert(options.includes('rpc("get_admin_store_lead_form_options"'), "Admin consultation options must load through RPC");
assert(options.includes('rpc("upsert_store_lead_form_option"'), "Admin consultation option saves must use RPC");
assert(!options.includes('.from("store_lead_form_options").insert('), "Admin consultation option create must not be direct table CRUD");
assert(!options.includes('.from("store_lead_form_options").update('), "Admin consultation option update must not be direct table CRUD");

const storeMigration = read("modulex-store/supabase/migrations/20260829213000_gc4_contact_project_consultation.sql");
assert(storeMigration.includes("get_store_public_lead_form_options"), "Store public form option contract must remain available");
assert(storeMigration.includes("Invalid or inactive project type"), "Store submission must continue validating active project options");
assert(storeMigration.includes("Invalid or inactive consultation intent"), "Store submission must continue validating active consultation intent");

const roadmap = read("modulex-admin/ADMIN_ROADMAP.md");
for (const item of ["LD-A1", "LD-A2", "LD-A3", "LD-A4"]) {
  assert(new RegExp(`- \\[x\\] \\*\\*${item}\\b`).test(roadmap), `${item} must be closed in ADMIN_ROADMAP.md`);
}

console.log("LD Leads final workstream contract: OK");
