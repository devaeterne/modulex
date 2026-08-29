import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const cardPath = path.join(root, "src/components/customers/CustomerCard.tsx");
const sqlPath = path.join(root, "sql/customer-master-mutation.sql");
const packagePath = path.join(root, "package.json");

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function requireNoMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const card = read(cardPath);
const sql = read(sqlPath);
const pkg = JSON.parse(read(packagePath));

requireMatch(card, /async function saveCustomerMaster\s*\(/, "Customer General save must use a dedicated customer-master mutation handler.");
requireMatch(card, /supabase\.rpc\(\s*["']update_customer_master["']/, "Customer master handler must call update_customer_master RPC.");
requireMatch(card, /Save General[\s\S]{0,800}saveCustomerMaster|saveCustomerMaster[\s\S]{0,800}Save General/, "Save General must route through saveCustomerMaster.");

requireMatch(sql, /create or replace function public\.update_customer_master\s*\(/i, "Customer master SQL must define update_customer_master.");
requireNoMatch(sql, /update_customer_master[\s\S]{0,1200}security\s+definer/i, "Customer master RPC must not use SECURITY DEFINER.");
requireMatch(sql, /current_user_has_any_role\s*\(\s*array\s*\[\s*['"]super_admin['"]\s*,\s*['"]admin['"]\s*,\s*['"]sales['"]\s*\]/i, "Customer master RPC must authorize super_admin/admin/sales.");
requireMatch(sql, /from public\.customers[\s\S]{0,160}for update/i, "Customer master RPC must lock the customer row FOR UPDATE.");
requireMatch(sql, /customer_types[\s\S]{0,240}is_active\s*=\s*true/i, "Changed customer type must resolve to an active customer type.");
requireMatch(sql, /old\.status\s*<>\s*['"]prospect['"][\s\S]{0,180}new\.status\s*=\s*['"]prospect['"]/i, "DB guard must prevent returning a converted customer to prospect.");
requireMatch(sql, /before\s+update[\s\S]{0,220}on\s+public\.customers/i, "Customer status/type validation must be enforced by a BEFORE UPDATE trigger.");
requireMatch(sql, /after\s+update[\s\S]{0,220}on\s+public\.customers/i, "Sensitive customer changes must be audited by an AFTER UPDATE trigger.");
requireMatch(sql, /insert into public\.customer_activity/i, "Customer master audit trigger must write customer_activity.");
requireMatch(sql, /['"]changed_fields['"]/i, "Customer master audit metadata must include changed_fields.");
requireMatch(sql, /['"]status['"][\s\S]{0,180}['"]from['"][\s\S]{0,180}['"]to['"]/i, "Status audit metadata must include from/to when status changes.");
requireMatch(sql, /['"]customer_type['"][\s\S]{0,180}['"]from['"][\s\S]{0,180}['"]to['"]/i, "Customer-type audit metadata must include from/to when type changes.");
requireNoMatch(sql, /to_jsonb\s*\(\s*(old|new)\s*\)/i, "Customer master audit must not snapshot full customer rows/PII.");
requireMatch(sql, /revoke all on function public\.update_customer_master[\s\S]{0,220}from public/i, "Customer master RPC must revoke default PUBLIC execute.");
requireMatch(sql, /grant execute on function public\.update_customer_master[\s\S]{0,220}to authenticated/i, "Customer master RPC must grant execute only to authenticated.");

if (pkg.scripts?.["smoke:customer-master"] !== "node scripts/customer-master-contract.mjs") {
  throw new Error("package.json must expose smoke:customer-master.");
}
if (!pkg.scripts?.smoke?.includes("smoke:customer-master")) {
  throw new Error("Main smoke chain must include smoke:customer-master.");
}

console.log("Customer master mutation contract passed.");
