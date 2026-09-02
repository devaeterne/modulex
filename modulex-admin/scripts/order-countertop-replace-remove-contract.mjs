import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const canonicalSqlPath = "sql/countertop-replace-remove.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260902114500_countertop_replace_remove.sql";
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const orderDomain = read("src/lib/customers/order-domain.ts");
const orderEditing = read("sql/customer-order-editing.sql");
const revisionMigration = read("../modulex-store/supabase/migrations/20260901090000_customer_order_revision_identity.sql");

assert(exists(canonicalSqlPath), "canonical Countertop replace/remove SQL is required");
assert(exists(migrationPath), "shared Supabase migration mirror is required");

for (const sqlPath of [canonicalSqlPath, migrationPath]) {
  const sql = read(sqlPath);
  for (const token of [
    "private.remove_countertop_order_item",
    "public.remove_countertop_order_item",
    "current_user_has_any_role(array['super_admin','admin','sales'])",
    "countertop_configurations",
    "delete from public.customer_order_items",
    "customer_activity",
    "Countertop removed",
    "authenticated",
  ]) assert(sql.includes(token), `${sqlPath} missing ${token}`);
  assert(/status\s*<>\s*'draft'/i.test(sql), `${sqlPath} must reject non-Draft removal`);
  assert(/security definer/i.test(sql), `${sqlPath} must keep the privileged mutation private`);
  assert(/revoke all on function public\.remove_countertop_order_item[\s\S]*from public, anon/i.test(sql), `${sqlPath} must revoke public/anon execute`);
  assert(/grant execute on function public\.remove_countertop_order_item[\s\S]*to authenticated/i.test(sql), `${sqlPath} must grant the reviewed wrapper to authenticated`);
}

for (const token of ["Replace Countertop", "Remove Countertop", "CountertopConfigurator", "orderItemId", "Modal", "removeCountertopOrderItem"]) {
  assert(editOrder.includes(token), `Edit Order Countertop workflow missing ${token}`);
}
assert(orderDomain.includes("export async function removeCountertopOrderItem"), "order domain must own Countertop removal");
assert(orderDomain.includes('.rpc("remove_countertop_order_item"'), "order domain must call the dedicated removal RPC");
assert(!editOrder.includes('.rpc("remove_countertop_order_item"'), "Edit Order must not bypass the order domain adapter");

for (const source of [orderEditing, revisionMigration]) {
  assert(source.includes("Configured countertop lines cannot be removed in a generic revision."), "generic configured-Countertop removal guard must remain fail-closed");
}

console.log("Order Countertop replace/remove contract: PASS");
