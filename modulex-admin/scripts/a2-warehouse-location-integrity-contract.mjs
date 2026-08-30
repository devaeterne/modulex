import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};
const exists = (file) => fs.existsSync(path.join(root, file));

const sqlPath = "sql/a2-warehouse-location-integrity.sql";

assert.equal(exists(sqlPath), true, "A2.1 warehouse/location integrity SQL contract must exist");

const sql = read(sqlPath);
const warehouseForm = read("src/components/warehouses/WarehouseForm.tsx");
const warehousesTable = read("src/components/warehouses/WarehousesTable.tsx");
const zoneForm = read("src/components/zones/ZoneForm.tsx");
const zonesTable = read("src/components/zones/ZonesTable.tsx");
const locationForm = read("src/components/locations/LocationForm.tsx");
const locationsTable = read("src/components/locations/LocationsTable.tsx");

// Role parity: location master writes must match warehouse.manage (Admin/Super Admin only).
assert.match(sql, /drop policy if exists locations_insert_admin_or_warehouse on public\.locations/i, "legacy warehouse-role location INSERT policy must be removed");
assert.match(sql, /drop policy if exists locations_update_admin_or_warehouse on public\.locations/i, "legacy warehouse-role location UPDATE policy must be removed");
assert.match(sql, /create policy locations_insert_admin_only[\s\S]{0,320}with check\s*\(\s*\(\s*select public\.is_admin\(\)\s*\)\s*\)/i, "location INSERT must be Admin-only");
assert.match(sql, /create policy locations_update_admin_only[\s\S]{0,420}using\s*\(\s*\(\s*select public\.is_admin\(\)\s*\)\s*\)[\s\S]{0,160}with check\s*\(\s*\(\s*select public\.is_admin\(\)\s*\)\s*\)/i, "location UPDATE must be Admin-only");

// Hierarchy integrity must be database-authoritative.
assert.match(sql, /guard_location_hierarchy/i, "location hierarchy guard must exist");
assert.match(sql, /zone[^;]{0,260}same warehouse|same warehouse[^;]{0,260}zone/i, "location zone must belong to the same warehouse");
assert.match(sql, /guard_inventory_location_hierarchy/i, "inventory/location hierarchy guard must exist");
assert.match(sql, /inventory[^;]{0,260}location[^;]{0,260}warehouse/i, "inventory location must belong to the same warehouse");
assert.match(sql, /guard_zone_parent_state/i, "zone parent-state guard must exist");
assert.match(sql, /guard_location_parent_state/i, "location parent-state guard must exist");

// Lifecycle safety: active stock/children cannot be orphaned by deactivation.
assert.match(sql, /guard_warehouse_deactivation/i, "warehouse deactivation guard must exist");
assert.match(sql, /guard_zone_deactivation/i, "zone deactivation guard must exist");
assert.match(sql, /guard_location_deactivation/i, "location deactivation guard must exist");
assert.match(sql, /quantity\s*>\s*0|reserved_quantity\s*>\s*0/i, "deactivation guards must inspect active stock/reservations");
assert.match(sql, /active zones|active locations/i, "parent deactivation must account for active child structure");

// Guard failures themselves are operator-facing because every existing structure
// mutation surface already renders the Supabase error.message directly.
assert.match(sql, /Move stock first/i, "stock-blocked lifecycle errors must tell operators what to do next");
assert.match(sql, /same warehouse/i, "hierarchy mismatch errors must explain the same-warehouse rule");
assert.match(sql, /Deactivate (?:active )?(?:zones|locations) first/i, "parent lifecycle errors must explain child deactivation order");

for (const [name, source] of [
  ["WarehouseForm", warehouseForm],
  ["WarehousesTable", warehousesTable],
  ["ZoneForm", zoneForm],
  ["ZonesTable", zonesTable],
  ["LocationForm", locationForm],
  ["LocationsTable", locationsTable],
]) {
  assert.match(source, /setErrorMessage\(error\.message\)/, `${name} must continue surfacing database guard messages`);
}

// Delete semantics: stock and operational history must not be silently erased/nullified.
for (const constraint of [
  "inventory_warehouse_id_fkey",
  "inventory_location_id_fkey",
  "zones_warehouse_id_fkey",
  "locations_warehouse_id_fkey",
  "locations_zone_id_fkey",
  "inventory_movements_from_warehouse_id_fkey",
  "inventory_movements_to_warehouse_id_fkey",
  "inventory_movements_from_location_id_fkey",
  "inventory_movements_to_location_id_fkey",
]) {
  assert.match(sql, new RegExp(`${constraint}[\\s\\S]{0,260}on delete restrict`, "i"), `${constraint} must use ON DELETE RESTRICT`);
}

console.log("A2.1 warehouse/location integrity contract PASS");
