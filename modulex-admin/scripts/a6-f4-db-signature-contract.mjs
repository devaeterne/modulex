import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "../sql/a6-f4-payroll-integration-hardening.sql"), "utf8");

assert.match(
  sql,
  /private\.create_finance_transaction_draft\(\s*'employee_payment',\s*p_source_account_id,\s*null,\s*null,\s*null,\s*p_amount,/i,
  "Atomic Employee Payment draft must pass destination, category and payment-method NULLs before amount",
);

console.log("A6 F4 DB signature contract passed.");
