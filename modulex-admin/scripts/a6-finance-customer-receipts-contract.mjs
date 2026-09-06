import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const sqlPath = "sql/a6-finance-customer-receipts.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260906193000_a6_finance_customer_receipts.sql";
const hardeningSqlPath = "sql/a6-f5a-customer-receipts-rpc-hardening.sql";
const hardeningMigrationPath = "../modulex-store/supabase/migrations/20260906203000_a6_f5a_customer_receipts_rpc_hardening.sql";
const sql = read(sqlPath);
const migration = read(migrationPath);
const hardeningSql = read(hardeningSqlPath);
const hardeningMigration = read(hardeningMigrationPath);
const domain = read("src/lib/finance/customer-receipts.ts");
const manager = read("src/components/finance/FinanceCustomerReceiptsManager.tsx");
const genericTransactions = read("src/components/finance/FinanceTransactionsManager.tsx");
const route = read("src/app/(admin)/finance/customer-receipts/page.tsx");
const sidebar = read("src/layout/AppSidebar.tsx");

expect(sql.length > 0, "A6-F5A customer receipt SQL must exist");
expect(sql === migration, "A6-F5A Admin SQL and shared migration must stay byte-identical");
expect(hardeningSql.length > 0, "A6-F5A authenticated RPC hardening SQL must exist");
expect(hardeningSql === hardeningMigration, "A6-F5A RPC hardening Admin SQL and shared migration must stay byte-identical");
const hardenedPublicRpcs = [
  "record_customer_receipt",
  "void_customer_receipt",
  "reverse_customer_receipt",
  "link_customer_project_payment_to_finance",
  "get_customer_receipt_reference_data",
  "get_customer_receipt_invoices",
  "get_customer_receipts_page",
];
for (const rpc of hardenedPublicRpcs) {
  const rpcPattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}\\s*\\([\\s\\S]*?security\\s+definer[\\s\\S]*?set\\s+search_path\\s*=\\s*''`, "i");
  expect(rpcPattern.test(hardeningSql), `F5A public RPC ${rpc} must bridge to revoked private core through SECURITY DEFINER with empty search_path`);
}
expect(/revoke\s+all\s+on\s+function\s+public\.record_customer_receipt[\s\S]*?from\s+public\s*,\s*anon/i.test(hardeningSql), "F5A hardened receipt RPC must keep PUBLIC/anon execute revoked");
expect(/grant\s+execute\s+on\s+function\s+public\.record_customer_receipt[\s\S]*?to\s+authenticated/i.test(hardeningSql), "F5A hardened receipt RPC must keep authenticated execute explicit");
// Production compile regression: a %rowtype record and scalar cannot share one SELECT INTO target list.
expect(!/select\s+i\s*,\s*o\.project_id\s+into\s+v_invoice\s*,\s*v_project_id/i.test(sql), "F5A invoice validator must not mix a %rowtype record with a scalar in one SELECT INTO list");
expect(/select\s+i\.\*\s+into\s+v_invoice[\s\S]{0,260}where\s+i\.id\s*=\s*p_invoice_id[\s\S]{0,120}for\s+update[\s\S]{0,360}select\s+o\.project_id\s+into\s+v_project_id[\s\S]{0,180}where\s+o\.id\s*=\s*v_invoice\.order_id/i.test(sql), "F5A invoice validator must lock the Invoice row and resolve Project context in a separate scalar read");
expect(/create or replace function private\.record_customer_receipt\s*\(/i.test(sql), "F5A must define a private atomic customer receipt mutation");
expect(/'customer_receipt'/i.test(sql), "F5A must reuse Finance Core customer_receipt transactions");
expect(/private\.create_finance_transaction_draft/i.test(sql), "F5A receipt creation must reuse Finance Core draft/idempotency primitives");
expect(/private\.set_finance_transaction_links/i.test(sql), "F5A receipt creation must use canonical Finance attribution links");
expect(/private\.post_finance_transaction/i.test(sql), "F5A receipt creation must post through canonical Finance Core");
expect(/source_document_type[^;]{0,220}customer_invoice/i.test(sql), "Invoice allocations must use finance_transaction_links source-document attribution");
expect(/customer_id/i.test(sql) && /order_id/i.test(sql) && /project_id/i.test(sql), "Customer receipt allocations must preserve Customer/Order/Project context where applicable");
expect(/sync_customer_invoice_payment_from_finance/i.test(sql), "F5A must derive Invoice paid/status from posted Finance receipt allocations");
expect(/transaction_kind\s*=\s*'reversal'|reversal_of_transaction_id/i.test(sql), "Invoice reconciliation must account for posted Finance reversals");
expect(/source_document_type\s*=\s*'customer_invoice'[\s\S]{0,700}tx\.status\s*=\s*'posted'/i.test(sql), "Invoice reconciliation must count posted Finance receipt/reversal allocations only");
expect(/ledger_managed\s*=\s*true/i.test(sql), "Finance-managed invoices must be explicitly ledger-managed");
expect(/customer_project_payment_transactions/i.test(sql), "F5A must preserve and bridge existing Project payment history rather than replacing it");
expect(!/delete\s+from\s+public\.customer_project_payment_transactions/i.test(sql), "F5A must not delete live Project payment history");
expect(/customer_project_payment_finance_links/i.test(sql), "F5A must provide an explicit reconciliation bridge instead of fabricating historical Finance rows");
expect(/guard_customer_receipt_flow/i.test(sql), "Generic Finance writes must not bypass the canonical Customer Receipt flow");
expect(/void_customer_receipt/i.test(sql) && /reverse_customer_receipt/i.test(sql), "Customer Receipt corrections must use dedicated audited Finance flows");
expect(/revoke all on function public\.record_customer_receipt/i.test(sql), "F5A public receipt RPC must revoke PUBLIC execute");
expect(/grant execute on function public\.record_customer_receipt[\s\S]{0,700}to authenticated/i.test(sql), "F5A public receipt RPC must grant authenticated execute explicitly");

expect(domain.includes('supabase.rpc("record_customer_receipt"'), "Finance customer receipt domain must use the canonical receipt RPC");
expect(domain.includes("parseDbDecimal"), "Customer receipt domain must preserve numeric(18,4) precision");
expect(domain.includes('supabase.rpc("void_customer_receipt"') && domain.includes('supabase.rpc("reverse_customer_receipt"'), "Customer receipt domain must use dedicated correction RPCs");
expect(manager.includes("FinanceCustomerReceiptsManager"), "F5A must expose a dedicated Customer Receipts manager");
expect(manager.includes("Invoice allocations"), "Customer Receipts UI must make Invoice allocations explicit");
expect(route.includes("FinanceCustomerReceiptsManager"), "F5A must expose a Finance customer-receipts route");
expect(sidebar.includes('path: "/finance/customer-receipts"'), "Finance sidebar must expose Customer Receipts");
const createKindBlock = genericTransactions.match(/const kindOptions = \[([\s\S]*?)\];/)?.[1] ?? "";
expect(!createKindBlock.includes('value: "customer_receipt"'), "Generic Finance Transactions must not create source-less Customer Receipts");
expect(genericTransactions.includes('value: "customer_receipt"'), "Generic Finance history filters must still recognize Customer Receipts");

console.log("A6-F5A Customer Receipts contract: PASS");
