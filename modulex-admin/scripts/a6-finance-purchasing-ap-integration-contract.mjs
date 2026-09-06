import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-purchasing-ap-integration.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260906114500_a6_finance_purchasing_ap_integration.sql";

for (const file of [adminSqlPath, migrationPath]) {
  expect(exists(file), `Missing A6-F3E SQL artifact: ${file}`);
}

const sql = read(adminSqlPath);
const migration = read(migrationPath);
expect(sql === migration, "A6-F3E Admin SQL and shared migration must stay byte-identical");

expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(?:purchase_orders|purchase_order_items|purchase_receipts|vendor_bills)/i.test(sql), "F3E must not create a duplicate Purchasing/AP universe");
expect(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.customer_project_procurement_invoice_allocations/i.test(sql), "F3E must reuse the existing procurement invoice allocation ledger");
expect(/create\s+or\s+replace\s+function\s+private\.record_customer_project_procurement_invoice/i.test(sql), "F3E must harden the existing Project Procurement invoice recorder");
expect(/private\.finance_assert_manage\s*\(\s*\)/i.test(sql), "Crossing into AP must reuse Finance manage authorization");
expect(/v_commitment\.vendor_id\s+is\s+null/i.test(sql), "Procurement-to-AP must fail closed until the commitment has canonical Vendor identity");
expect(/private\.vendor_invoice_normalize_number\s*\(/i.test(sql), "F3E must reuse the canonical Vendor Bill number normalizer");
expect(/vendor_invoice_identity:[^\n]*v_commitment\.vendor_id/i.test(sql), "Vendor Bill identity lock must use canonical Vendor id rather than a source vendor code");
expect(/where\s+i\.vendor_id\s*=\s*v_commitment\.vendor_id[\s\S]{0,250}i\.invoice_number_key\s*=\s*v_key/i.test(sql), "Retries must find Vendor Bills by canonical Vendor id plus normalized invoice number");
expect(!/where\s+vendor_code\s*=\s*v_commitment\.vendor_code[\s\S]{0,250}invoice_number_key/i.test(sql), "F3E must not retry-match bills by historical source vendor_code");
expect(/private\.create_vendor_invoice_draft\s*\(/i.test(sql), "New procurement invoices must enter through the canonical F3B Vendor Bill draft core");
expect(/private\.open_vendor_invoice\s*\(/i.test(sql), "New procurement invoices must enter the canonical F3B open/FX/audit lifecycle");
expect(!/insert\s+into\s+public\.vendor_invoices/i.test(sql), "F3E must not bypass the canonical Vendor Bill core with direct header inserts");
expect(/insert\s+into\s+public\.customer_project_procurement_invoice_allocations/i.test(sql), "Project cost attribution must remain in the existing procurement allocation ledger");
expect(/invoiced\s+quantity\s+cannot\s+exceed\s+ordered\s+quantity/i.test(sql), "Existing commitment quantity ceiling must be preserved");
expect(/project\s+invoice\s+allocations\s+cannot\s+exceed\s+the\s+vendor\s+invoice\s+total/i.test(sql), "Existing bill allocation ceiling must be preserved");
expect(/existing\s+vendor\s+bill[\s\S]{0,350}(?:status|open)/i.test(sql), "Existing Vendor Bill reuse must fail closed on incompatible lifecycle state");
expect(/private\.vendor_invoice_write_audit\s*\([\s\S]{0,300}'procurement_allocate'/i.test(sql), "Procurement allocation attachment must be visible in the Vendor Bill audit trail");

expect(/create\s+or\s+replace\s+function\s+private\.reverse_customer_project_procurement_invoice_allocation/i.test(sql), "F3E must harden the existing procurement allocation reversal path");
expect((sql.match(/private\.finance_assert_manage\s*\(\s*\)/gi) ?? []).length >= 2, "Both procurement allocation mutation paths must reuse Finance manage authorization");
expect(/private\.vendor_invoice_write_audit\s*\([\s\S]{0,300}'procurement_allocation_reverse'/i.test(sql), "Procurement allocation reversal must be visible in the Vendor Bill audit trail");
expect(/reversal_of_allocation_id/i.test(sql), "F3E must preserve append-only procurement allocation reversal history");
expect(/append_customer_project_procurement_event/i.test(sql), "F3E must preserve Project Procurement event history");
expect(/revoke\s+all\s+on\s+function\s+private\.record_customer_project_procurement_invoice/i.test(sql), "Private F3E mutation core must remain non-app-callable");

console.log("A6-F3E Purchasing / AP Integration contract: PASS");
