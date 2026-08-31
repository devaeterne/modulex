import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const [migration, orders, detail, dealer] = await Promise.all([
  read("supabase/migrations/20260901100000_countertop_portal_safe_projection.sql"),
  read("src/lib/portal/orders.ts"),
  read("src/components/portal/PortalOrderDetail.tsx"),
  read("src/lib/portal/dealer.ts"),
]);

assert.match(migration, /get_store_portal_context\(\)/, "projection must use the existing portal context boundary");
assert.match(migration, /o\.customer_id=v_customer_id/, "customer scope must remain enforced");
assert.match(migration, /portal_kind.*dealer/, "dealer scope must remain enforced by the unified context");
assert.match(migration, /get_store_portal_countertop_projection/, "countertop item projection must be explicit");
for (const forbidden of ["'slab_quantity'", "'countertop_reservation_quantity'", "'inventory'", "'reserved_quantity'", "'available_quantity'", "'cost'", "'margin'", "'vendor'", "'source'", "'manual_override'", "'override_reason'", "'overridden_by'", "'overridden_at'", "'configuration'", "'pricing_snapshot'"]) {
  assert.doesNotMatch(migration, new RegExp(forbidden.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `portal projection must not expose ${forbidden}`);
}
for (const field of ["PortalCountertopStone", "PortalCountertopEdge", "PortalCountertopSink", "PortalCountertopService", "PortalCountertopSummary"]) assert.match(orders, new RegExp(`export type ${field}`), `${field} typing missing`);
for (const field of ["stone", "stone_type", "material_price_band", "price_per_sqft", "sqft", "edge", "sink", "services", "Countertop Total"]) assert.match(detail, new RegExp(field), `portal UI field missing: ${field}`);
assert.match(detail, /item\.countertop/, "portal UI must render the typed countertop projection");
assert.match(dealer, /PortalOrderDetail\["items"\]\[number\]/, "Dealer portal must reuse the unified portal item contract");
assert.doesNotMatch(orders, /any/, "portal order typing must not fall back to any");
console.log("Portal countertop projection contract: PASS");
