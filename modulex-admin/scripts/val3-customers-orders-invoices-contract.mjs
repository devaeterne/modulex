import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readOptional = (file) => fs.existsSync(path.join(root, file)) ? read(file) : "";
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

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
const orderValidation = readOptional("src/lib/customers/order-validation.ts");
const orderDomain = read("src/lib/customers/order-domain.ts");
const newOrder = read("src/components/customers/NewCustomerOrder.tsx");
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const invoiceDetail = read("src/components/customers/CustomerInvoiceDetail.tsx");
const customerDirectory = read("src/components/customers/CustomersTable.tsx");
const customerCard = read("src/components/customers/CustomerCard.tsx");
const packageJson = read("package.json");
const roadmap = read("ADMIN_ROADMAP.md");
const a1 = read("sql/a1-core-operations-hardening.sql");
const contactLifecycle = read("sql/customer-contact-address-lifecycle.sql");

// Shared exact-decimal behavior must stay executable, not merely present in source.
const validationModuleSource = ts.transpileModule(validation, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const validationModule = await import(`data:text/javascript,${encodeURIComponent(validationModuleSource)}`);
const { parseDbDecimal, canonicalizeDbDecimal } = validationModule;
const quantityContract = { precision: 18, scale: 4, min: 0.0001, allowNull: false };
const moneyContract = { precision: 18, scale: 4, min: 0, allowNull: false };
const percentContract = { precision: 7, scale: 3, min: 0, max: 100, allowNull: false };

const expectValid = (value, contract, expected, label) => {
  const result = parseDbDecimal(value, contract);
  check(result.error === null && result.value === expected, `${label} must remain exact`);
};
const expectInvalid = (value, contract, label) => {
  const result = parseDbDecimal(value, contract);
  check(result.error !== null && result.value === null, `${label} must be rejected`);
};

expectValid("0.0001", quantityContract, "0.0001", "minimum positive order quantity");
expectValid("99999999999999.9999", quantityContract, "99999999999999.9999", "order quantity precision boundary");
for (const value of ["0", "-0.0001", "1.00001", "100000000000000", "", Number.NaN]) expectInvalid(value, quantityContract, `order quantity ${String(value)}`);
expectValid("0", moneyContract, "0", "zero order money");
expectValid("123.4567", moneyContract, "123.4567", "four-decimal order money");
for (const value of ["-0.0001", "1.00001", "100000000000000", ""]) expectInvalid(value, moneyContract, `order money ${String(value)}`);
for (const value of ["0", "12.345", "100.000"]) expectValid(value, percentContract, value, `order percent ${value}`);
for (const value of ["-0.001", "100.001", "1.2345", ""]) expectInvalid(value, percentContract, `order percent ${value}`);
check(canonicalizeDbDecimal("1.2000", moneyContract) === canonicalizeDbDecimal("1.2", moneyContract), "DB decimal canonicalization must compare equivalent values exactly");

// Order mutation contract: normalized decimal strings cross the RPC boundary without float coercion.
check(Boolean(orderValidation), "Order validation must live in src/lib/customers/order-validation.ts");
check(/ORDER_QUANTITY_DECIMAL\s*=\s*\{[^}]*precision:\s*18[^}]*scale:\s*4[^}]*min:\s*0\.0001[^}]*allowNull:\s*false/s.test(orderValidation), "Order quantity helper must match numeric(18,4) and > 0");
check(/ORDER_MONEY_DECIMAL\s*=\s*\{[^}]*precision:\s*18[^}]*scale:\s*4[^}]*min:\s*0[^}]*allowNull:\s*false/s.test(orderValidation), "Order money helper must match non-negative numeric(18,4)");
check(/ORDER_PERCENT_DECIMAL\s*=\s*\{[^}]*precision:\s*7[^}]*scale:\s*3[^}]*min:\s*0[^}]*max:\s*100[^}]*allowNull:\s*false/s.test(orderValidation), "Order percentage helper must match numeric(7,3) 0..100");
check(/parseOrderQuantity/.test(orderValidation) && /parseOrderMoney/.test(orderValidation) && /parseOrderPercent/.test(orderValidation), "Order validation must expose typed exact decimal helpers");
check(!/function\s+numeric\([\s\S]*?Number\(/.test(orderDomain), "Order mutation serialization must not coerce DB decimals through Number()");
check(!/quantity:\s*Number\(/.test(orderDomain) && !/discount_percent:\s*Number\(/.test(orderDomain), "Order item RPC payloads must preserve validated decimal strings");
check(/order-validation/.test(orderDomain), "Order domain must consume the shared order decimal contract");
check(/parseOrderQuantity/.test(newOrder) && /parseOrderMoney/.test(newOrder) && /parseOrderPercent/.test(newOrder), "New Order must validate quantity, money, and percentages with exact DB contracts");
check(/parseOrderQuantity/.test(editOrder) && /parseOrderMoney/.test(editOrder) && /parseOrderPercent/.test(editOrder), "Edit Order must validate quantity, money, and percentages with exact DB contracts");
check(/FieldErrors/.test(newOrder) && /firstInvalid/.test(newOrder), "New Order must expose field-level validation and focus the first invalid field");
check(/FieldErrors/.test(editOrder) && /firstInvalid/.test(editOrder), "Edit Order must expose field-level validation and focus the first invalid field");

// Customer mutations remain canonical while validation becomes field-specific and exact.
check(customerDirectory.includes('supabase.rpc("create_customer"'), "Customer create must use the canonical create_customer RPC");
check(/CreateCustomerFieldErrors/.test(customerDirectory), "New Customer must keep typed field-level errors");
check(/firstInvalid/.test(customerDirectory) && /\.focus\(\)/.test(customerDirectory), "New Customer must focus the first invalid field");
check(/isValidEmail/.test(customerDirectory) && /isValidPhone/.test(customerDirectory) && /isValidCountryCode/.test(customerDirectory), "New Customer must preserve shared contact/country validation");
check(customerCard.includes('supabase.rpc("update_customer_master"'), "Customer master edit must use the canonical update_customer_master RPC");
check(contactLifecycle.includes("deactivate_customer_contact") && contactLifecycle.includes("deactivate_customer_address"), "Customer contact/address lifecycle must remain soft and audited");
check(/parseDbDecimal/.test(customerCard), "Customer Commercial validation must consume the shared exact DB decimal parser");
check(!/function\s+optionalNumber\(/.test(customerCard), "Customer Commercial mutation truth must not use optional Number() parsing");
check(/CustomerMasterFieldErrors/.test(customerCard) && /ContactFieldErrors/.test(customerCard) && /AddressFieldErrors/.test(customerCard) && /CommercialFieldErrors/.test(customerCard), "Customer detail mutations must expose field-level errors per form");
check(/firstInvalid/.test(customerCard) && /\.focus\(\)/.test(customerCard), "Customer detail validation must focus the first invalid field");

// Invoice payment validation keeps exact numeric semantics and ledger ownership.
check(invoiceDetail.includes('from "@/lib/validation"'), "Invoice mutation surface must consume shared validation");
check(invoiceDetail.includes("parseDbDecimal"), "Invoice paid amount must use shared DB decimal validation");
check(invoiceDetail.includes("precision: 18") && invoiceDetail.includes("scale: 4"), "Invoice paid amount must preserve numeric(18,4)");
check(!/paidAmount\.trim\(\)\s*\?\s*Number\(paidAmount\)/.test(invoiceDetail), "Invoice payment mutation must not parse money with Number()");
check(/PaidAmountFieldError|paidAmountError/.test(invoiceDetail), "Invoice paid amount must expose field-level validation feedback");
check(/canonicalizeDbDecimal|compareDbDecimal/.test(invoiceDetail), "Invoice UI must compare paid amount to canonical total without float mutation truth");
check(/greater than.*total|exceed.*total/i.test(invoiceDetail), "Invoice UI must reject paid amount above total before RPC");
check(/ledger_managed/.test(invoiceDetail), "Ledger-managed invoices must remain explicit in the UI contract");

// Existing DB/RPC authority must remain intact.
check(/quantity[^;]{0,260}(?:>|greater than)\s*zero/i.test(a1), "Order quantity must remain DB validated");
check(/tax_rate/i.test(databaseSource) && /payment_commission_percent/i.test(databaseSource), "Order percentage fields must remain server-authoritative");
check(/shipping address[^;]{0,260}required/i.test(a1), "Delivery orders must retain DB shipping-address validation");
check(/update_customer_invoice_state/i.test(databaseSource), "Invoice lifecycle must remain behind the canonical state RPC");
check(/paid_amount/i.test(databaseSource) && /total_amount/i.test(databaseSource), "Invoice payment bounds must remain DB-authoritative");
check(/ledger_managed/i.test(databaseSource), "Ledger-managed invoices must reject manual payment truth");
check(/Sales cannot record customer payments/i.test(databaseSource), "Sales must remain unable to mutate customer payment truth");

// VAL-3 belongs to the normal Admin smoke chain and must reflect its production-closeout roadmap state.
check(/"smoke:val-3-customers-orders-invoices"/.test(packageJson), "package.json must expose the VAL-3 contract command");
check(/"smoke"\s*:\s*"[^"]*smoke:val-3-customers-orders-invoices/.test(packageJson), "Normal Admin smoke must include VAL-3");
check(/- \[x\] VAL-3 — Customers \/ Orders \/ Invoices\./.test(roadmap), "VAL-3 roadmap row must remain complete after production acceptance");

if (failures.length) {
  throw new Error(`VAL-3 Customers / Orders / Invoices contract failures:\n- ${failures.join("\n- ")}`);
}

console.log("VAL-3 Customers / Orders / Invoices contract: PASS");
