import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-vendor-master.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260905223000_a6_finance_vendor_master.sql";

expect(exists(adminSqlPath), "A6-F3A Vendor Master SQL must exist");
expect(exists(migrationPath), "A6-F3A shared Supabase migration mirror must exist");

const sql = read(adminSqlPath);
const migration = read(migrationPath);
expect(sql === migration, "A6-F3A Admin SQL and shared migration must stay byte-identical");

for (const table of [
  "vendors",
  "vendor_contacts",
  "vendor_source_identities",
  "vendor_compliance_documents",
  "vendor_audit_log",
]) {
  expect(new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${table}`, "i").test(sql), `A6-F3A must create ${table}`);
  expect(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql), `${table} must enable RLS`);
}

expect(/create\s+unique\s+index[\s\S]{0,500}vendors[\s\S]{0,300}lower\s*\(\s*code\s*\)/i.test(sql), "Canonical vendor code must be case-insensitively unique");
expect(/status[\s\S]{0,500}'onboarding'[\s\S]{0,500}'active'[\s\S]{0,500}'inactive'/i.test(sql), "Vendor lifecycle must preserve onboarding/active/inactive history");
expect(/vendor_type[\s\S]{0,500}'supplier'[\s\S]{0,500}'contractor'[\s\S]{0,500}'service_provider'/i.test(sql), "Vendor master must distinguish supplier/contractor/service-provider counterparties");
expect(/normalized_name/i.test(sql), "Vendor master must retain a normalized name for duplicate detection");
expect(/remit/i.test(sql), "Vendor master must include remittance/business details needed by AP");

expect(/source_system/i.test(sql) && /source_code/i.test(sql), "Vendor source identities must explicitly map external source codes");
expect(/vendor_catalog/i.test(sql), "Vendor Catalog identity must be bridgeable without becoming AP identity by accident");
expect(/unique[\s\S]{0,1200}source_system[\s\S]{0,600}source_code|create\s+unique\s+index[\s\S]{0,1200}source_system[\s\S]{0,600}source_code/i.test(sql), "Vendor source mappings must prevent duplicate source-code ownership");
expect(/get_vendor_source_candidates/i.test(sql), "F3A must expose unmapped source candidates instead of auto-activating catalog vendors");

for (const legacyTable of ["vendor_invoices", "customer_project_procurement_commitments", "finance_transaction_links"]) {
  expect(new RegExp(`alter\\s+table\\s+public\\.${legacyTable}[\\s\\S]{0,800}vendor_id`, "i").test(sql), `${legacyTable} must gain a nullable canonical vendor bridge`);
}
expect(/vendor_code/i.test(sql) && /vendor_name_snapshot/i.test(sql), "F3A must preserve legacy vendor code/name snapshots");
expect(!/drop\s+column[\s\S]{0,300}vendor_(?:code|name_snapshot)/i.test(sql), "F3A must not drop historical vendor_code/vendor_name_snapshot fields");
expect(/references\s+public\.vendors\s*\(\s*id\s*\)[\s\S]{0,100}on\s+delete\s+restrict/i.test(sql), "Historical vendor references must survive vendor deactivation and forbid destructive deletes");

for (const kind of ["w9", "coi", "license", "other"]) {
  expect(sql.toLowerCase().includes(`'${kind}'`), `Vendor compliance must support ${kind.toUpperCase()}`);
}
for (const marker of ["issued_on", "expires_on", "verified_at", "verified_by", "storage_bucket", "storage_path"]) {
  expect(sql.includes(marker), `Vendor compliance metadata is missing ${marker}`);
}
expect(/missing|expired/i.test(sql), "Vendor compliance projection must expose missing/expired warning states");
expect(!/block[_ ]payment|payment[_ ]blocked|hard[_ ]block/i.test(sql), "F3A must not invent a hard payment block for compliance");
expect(!/create\s+trigger[\s\S]{0,3000}vendor_compliance[\s\S]{0,1200}finance_transactions/i.test(sql), "Compliance warnings must not mutate/block Finance transactions");

for (const rpc of [
  "get_vendors_page",
  "get_vendor_detail",
  "get_vendor_source_candidates",
  "create_vendor",
  "update_vendor",
  "set_vendor_status",
  "upsert_vendor_contact",
  "map_vendor_source_identity",
  "upsert_vendor_compliance_document",
]) {
  expect(sql.includes(`private.${rpc}`), `A6-F3A private core ${rpc} is required`);
  expect(sql.includes(`public.${rpc}`), `A6-F3A public RPC ${rpc} is required`);
}
expect(/finance_assert_view/i.test(sql) && /finance_assert_manage/i.test(sql), "F3A must reuse existing Finance authorization cores");
expect(/security\s+definer/i.test(sql) && /set\s+search_path\s*=\s*''/i.test(sql), "F3A RPC boundaries must pin SECURITY DEFINER search_path");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "Private Vendor cores must not be application-callable");
expect(/revoke\s+(?:insert\s*,\s*update\s*,\s*delete\s*,\s*truncate|truncate\s*,\s*insert\s*,\s*update\s*,\s*delete)[\s\S]{0,500}vendors/i.test(sql), "Vendor master must close direct authenticated writes");
expect(/vendor_audit_log/i.test(sql) && /actor_id/i.test(sql), "Vendor master mutations must be auditable");

expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(?:vendor_bills|accounts_payable|vendor_payments)/i.test(sql), "F3A must not rebuild F3B/F3C AP/payment models");

const route = "src/app/(admin)/finance/vendors/page.tsx";
const manager = "src/components/finance/FinanceVendorsManager.tsx";
const adapter = "src/lib/finance/vendors.ts";
for (const file of [route, manager, adapter]) expect(exists(file), `Missing A6-F3A Vendor surface: ${file}`);
expect(read(route).includes("PageBreadCrumb"), "Finance Vendors route must use shared PageBreadCrumb");

const ui = read(manager);
for (const primitive of ["ComponentCard", "Alert", "Button", "Label", "Input", "Select", "TableViewport"]) {
  expect(ui.includes(primitive), `Finance Vendors must reuse shared ${primitive}`);
}
for (const label of ["Contacts", "Compliance", "W-9", "COI", "Source"] ) {
  expect(ui.toLowerCase().includes(label.toLowerCase()), `Vendor UI must expose ${label}`);
}
expect(/missing|expired/i.test(ui), "Vendor UI must render missing/expired compliance warning states");

const sidebar = read("src/layout/AppSidebar.tsx");
expect(sidebar.includes('path: "/finance/vendors"') && sidebar.includes('permission: "finance.view"'), "Finance sidebar must expose Vendors using existing finance.view permission");
const permissions = read("src/lib/auth/permissions.ts");
expect(!permissions.includes('"vendor.manage"') && !permissions.includes('"vendors.manage"'), "F3A must not invent a second vendor permission vocabulary");

console.log("A6-F3A Canonical Vendor/Supplier Master + Compliance contract: PASS");
