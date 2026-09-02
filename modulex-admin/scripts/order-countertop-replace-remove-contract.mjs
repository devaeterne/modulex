import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const canonicalSqlPath = "sql/countertop-replace-remove.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260902114500_countertop_replace_remove.sql";
const attachGateSqlPath = "sql/countertop-attach-pricing-gate.sql";
const attachGateMigrationPath = "../modulex-store/supabase/migrations/20260902131000_countertop_attach_pricing_gate.sql";
const editOrder = read("src/components/customers/EditCustomerOrder.tsx");
const countertopConfigurator = read("src/components/countertop/CountertopConfigurator.tsx");
const orderDomain = read("src/lib/customers/order-domain.ts");
const orderEditing = read("sql/customer-order-editing.sql");
const revisionMigration = read("../modulex-store/supabase/migrations/20260901090000_customer_order_revision_identity.sql");

assert(exists(canonicalSqlPath), "canonical Countertop replace/remove SQL is required");
assert(exists(migrationPath), "shared Supabase migration mirror is required");
assert(exists(attachGateSqlPath), "canonical Countertop attach pricing-gate hotfix SQL is required");
assert(exists(attachGateMigrationPath), "shared Countertop attach pricing-gate migration mirror is required");

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
    "lock order is parent order -> order item",
    "Remaining line numbers deliberately stay stable",
  ]) assert(sql.includes(token), `${sqlPath} missing ${token}`);
  assert(/status\s*<>\s*'draft'/i.test(sql), `${sqlPath} must reject non-Draft removal`);
  assert(/security definer/i.test(sql), `${sqlPath} must keep the privileged mutation private`);
  assert(/revoke all on function public\.remove_countertop_order_item[\s\S]*from public, anon/i.test(sql), `${sqlPath} must revoke public/anon execute`);
  assert(/grant execute on function public\.remove_countertop_order_item[\s\S]*to authenticated/i.test(sql), `${sqlPath} must grant the reviewed wrapper to authenticated`);
  assert(!/set\s+line_no\s*=/i.test(sql), `${sqlPath} must not UPDATE retained line numbers and accidentally trigger repricing`);
  assert(sql.indexOf("from public.customer_orders o") < sql.indexOf("and oi.order_id = v_order.id\n  for update"), `${sqlPath} must lock the parent order before the target item`);
}

for (const sqlPath of [attachGateSqlPath, attachGateMigrationPath]) {
  const sql = read(sqlPath);
  for (const token of [
    "private.attach_countertop_configuration",
    "p_material_price_band_id uuid",
    "private.countertop_order_pricing_gate",
    "insert into private.countertop_order_pricing_gate",
    "pg_backend_pid()",
    "txid_current()",
    "update public.customer_order_items",
    "delete from private.countertop_order_pricing_gate",
  ]) assert(sql.includes(token), `${sqlPath} missing ${token}`);
  assert(
    sql.indexOf("insert into private.countertop_order_pricing_gate") < sql.indexOf("update public.customer_order_items"),
    `${sqlPath} must open the pricing gate before mutating the configured Countertop line`,
  );
  assert(
    sql.indexOf("update public.customer_order_items") < sql.lastIndexOf("delete from private.countertop_order_pricing_gate"),
    `${sqlPath} must close the pricing gate after the authoritative Countertop mutation`,
  );
}

for (const token of ["Replace Countertop", "Remove Countertop", "CountertopConfigurator", "orderItemId", "Modal", "removeCountertopOrderItem"]) {
  assert(editOrder.includes(token), `Edit Order Countertop workflow missing ${token}`);
}
for (const token of [
  "isConfiguredCountertop",
  "canMutateConfiguredCountertop",
  'order.status === "draft"',
  "Countertop changes are Draft-only.",
  "removeCountertopOrderItem(countertopRemoveItemId",
  "orderItemId={countertopEditItemId}",
]) assert(editOrder.includes(token), `Edit Order configured-Countertop guard missing ${token}`);
assert(countertopConfigurator.includes('.select("order_id,line_no")'), "Existing Countertop replacement must load the saved order line number");
assert(countertopConfigurator.includes("setResolvedLineNo(orderContext?.lineNo ?? orderItemContext.data?.line_no ?? null)"), "Existing Countertop replacement must resolve Line N from the saved item when the caller does not pass it");
assert(countertopConfigurator.includes('resolvedLineNo ? `Line ${resolvedLineNo}` : "New countertop"'), "Countertop replacement must show the existing order line instead of New countertop");
assert(editOrder.includes("Unsaved line edits will be discarded."), "direct Countertop removal must warn before authoritative line reload");
assert(orderDomain.includes("export async function removeCountertopOrderItem"), "order domain must own Countertop removal");
assert(orderDomain.includes('.rpc("remove_countertop_order_item"'), "order domain must call the dedicated removal RPC");
assert(!editOrder.includes('.rpc("remove_countertop_order_item"'), "Edit Order must not bypass the order domain adapter");

for (const source of [orderEditing, revisionMigration]) {
  assert(source.includes("Configured countertop lines cannot be removed in a generic revision."), "generic configured-Countertop removal guard must remain fail-closed");
  assert(source.includes("Configured countertop lines must be changed in the countertop configurator."), "generic configured-Countertop change guard must remain fail-closed");
}

console.log("Order Countertop replace/remove contract: PASS");
