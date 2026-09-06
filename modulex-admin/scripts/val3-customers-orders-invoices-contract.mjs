import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const sqlSource = fs.readdirSync(path.join(root, "sql"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => read(path.join("sql", entry.name)))
  .join("\n");
const migrationDir = path.join(root, "../modulex-store/supabase/migrations");
const migrationSource = fs.readdirSync(migrationDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => fs.readFileSync(path.join(migrationDir, entry.name), "utf8"))
  .join("\n");
const databaseSource = `${sqlSource}\n${migrationSource}`;

const validation = read("src/lib/validation.ts");
const invoiceDetail = read("src/components/customers/CustomerInvoiceDetail.tsx");
const customerDirectory = read("src/components/customers/CustomersTable.tsx");
const customerCard = read("src/components/customers/CustomerCard.tsx");
const a1 = read("sql/a1-core-operations-hardening.sql");
const contactLifecycle = read("sql/customer-contact-address-lifecycle.sql");

expect(validation.includes("parseDbDecimal"), "Shared exact DB decimal validation must remain available");
expect(invoiceDetail.includes('from "@/lib/validation"'), "Invoice mutation surface must consume shared validation");
expect(invoiceDetail.includes("parseDbDecimal"), "Invoice paid-amount validation must use the shared DB decimal contract");
expect(invoiceDetail.includes("precision: 18") && invoiceDetail.includes("scale: 4"), "Invoice paid amount must preserve numeric(18,4)");
expect(!/paidAmount\.trim\(\)\s*\?\s*Number\(paidAmount\)/.test(invoiceDetail), "Invoice payment mutation must not parse money with Number()");
expect(!/updateState\(\s*["']paid["']\s*,\s*Number\(invoice\.total_amount\)\s*\)/.test(invoiceDetail), "Mark Paid must preserve the canonical invoice total value instead of float coercion");

expect(customerDirectory.includes('supabase.rpc("create_customer"'), "Customer create must use the canonical create_customer RPC");
expect(customerCard.includes('supabase.rpc("update_customer_master"'), "Customer master edit must use the canonical update_customer_master RPC");
expect(contactLifecycle.includes("deactivate_customer_contact") && contactLifecycle.includes("deactivate_customer_address"), "Customer contact/address lifecycle must remain soft and audited");

expect(/quantity[^;]{0,260}(?:>|greater than)\s*zero/i.test(a1), "Order quantity must remain DB validated");
expect(/tax_rate/i.test(databaseSource) && /payment_commission_percent/i.test(databaseSource), "Order percentage fields must remain server-authoritative");
expect(/shipping address[^;]{0,260}required/i.test(a1), "Delivery orders must retain DB shipping-address validation");
expect(/update_customer_invoice_state/i.test(databaseSource), "Invoice lifecycle must remain behind the canonical state RPC");
expect(/paid_amount/i.test(databaseSource) && /total_amount/i.test(databaseSource), "Invoice payment bounds must remain DB-authoritative");
expect(/ledger_managed/i.test(databaseSource), "Ledger-managed invoices must reject manual payment truth");
expect(/Sales cannot record customer payments/i.test(databaseSource), "Sales must remain unable to mutate customer payment truth");

console.log("VAL-3 Customers / Orders / Invoices contract: PASS");
