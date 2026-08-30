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

const sqlPath = "sql/a1-core-operations-hardening.sql";
const confirmationPatchPath = "sql/a1-order-confirmation-validation.sql";
const legacyCompatibilityPath = "sql/a1-order-legacy-progression-compatibility.sql";
const fulfillmentCompatibilityPath = "sql/a1-fulfillment-order-status-compatibility.sql";
assert.equal(exists(sqlPath), true, "A1 core operations hardening SQL contract must exist");
assert.equal(exists(confirmationPatchPath), true, "A1 order confirmation validation patch must exist");
assert.equal(exists(legacyCompatibilityPath), true, "A1 legacy order progression compatibility patch must exist");
assert.equal(exists(fulfillmentCompatibilityPath), true, "A1 fulfillment/order compatibility patch must exist");

const sql = read(sqlPath);
const confirmationPatch = read(confirmationPatchPath);
const legacyCompatibility = read(legacyCompatibilityPath);
const fulfillmentCompatibility = read(fulfillmentCompatibilityPath);
const shipmentDetail = read("src/components/customers/CustomerShipmentDetailRBAC.tsx");
const installationDetail = read("src/components/customers/CustomerInstallationDetail.tsx");
const permissions = read("src/lib/auth/permissions.ts");
const storePortalContract = read("../modulex-store/scripts/store-portal-contract.mjs");
const portalExperienceContract = read("../modulex-store/scripts/portal-experience-contract.mjs");

// Orders: server-authoritative validation and explicit lifecycle policy.
assert.match(sql, /customer_order_status_transition_allowed/i, "order transition helper must exist");
assert.match(sql, /Invalid customer order status transition/i, "invalid order transitions must fail closed");
assert.match(sql, /quantity[^;]{0,220}(?:>|greater than)\s*zero/i, "order quantity must be validated in the database boundary");
assert.match(sql, /status\s*(?:<>|!=)\s*'archived'|status\s+in\s*\([^)]*'active'/i, "order products/variants must be lifecycle-valid");
assert.match(sql, /order_tax_rules/i, "configured order tax rules must be authoritative");
assert.match(sql, /shipping address[^;]{0,220}required/i, "delivery fulfillment must require a shipping address");
assert.match(sql, /price_source/i, "pricing source classification must remain server-controlled");
assert.match(confirmationPatch, /validate_customer_order_confirmation/i, "confirmation must have an explicit readiness validator");
assert.match(confirmationPatch, /p_status\s*=\s*'confirmed'[\s\S]{0,260}validate_customer_order_confirmation/i, "confirmation transition must invoke the readiness validator");
assert.match(confirmationPatch, /v_order\.status\s*<>\s*'draft'/i, "draft orders may remain incomplete while non-Draft commercial mutations enforce readiness");
assert.match(legacyCompatibility, /update of\s+price_group_id,\s*payment_method_id,\s*shipping_address_id,\s*tax_rate,\s*fulfillment_type\b/i, "legacy compatibility guard must continue validating commercial field changes");
assert.doesNotMatch(legacyCompatibility, /update of[^\n]+\bstatus\b/i, "legacy confirmed orders must not be revalidated only because their status advances");

// Shipments: strict warehouse flow, no backwards jumps or order-state regression.
assert.match(sql, /customer_shipment_status_transition_allowed/i, "shipment transition helper must exist");
assert.match(sql, /Invalid customer shipment status transition/i, "invalid shipment transitions must fail closed");
assert.match(sql, /draft[^;]{0,220}picking/i, "shipment flow must include draft to picking");
assert.match(sql, /picking[^;]{0,220}packed/i, "shipment flow must include picking to packed");
assert.match(sql, /packed[^;]{0,220}shipped/i, "shipment flow must include packed to shipped");
assert.match(sql, /shipped[^;]{0,220}delivered/i, "shipment flow must include shipped to delivered");
assert.match(sql, /guard_customer_shipment_association/i, "shipment customer/order association must be guarded");
assert.match(shipmentDetail, /canPack\s*=\s*shipment\.status\s*===\s*["']picking["']/, "shipment UI must only pack from Picking");
assert.match(shipmentDetail, /canShip\s*=\s*shipment\.status\s*===\s*["']packed["']/, "shipment UI must only ship from Packed");
assert.match(fulfillmentCompatibility, /v_shipment\.status\s*<>\s*'packed'/i, "ship RPC must fail early unless shipment is Packed");
assert.match(fulfillmentCompatibility, /v_order_status\s+in\s*\(\s*'confirmed'\s*,\s*'in_preparation'\s*,\s*'ready_for_shipment'\s*\)/i, "shipping may advance only pre-installation order states to Shipped");
assert.match(fulfillmentCompatibility, /v_order_status\s*=\s*'shipped'/i, "delivery may advance the order to Delivered only from Shipped");
assert.match(fulfillmentCompatibility, /installation_scheduled/i, "shipment compatibility patch must explicitly preserve installation-stage order states");
assert.match(fulfillmentCompatibility, /installation_in_progress/i, "shipment compatibility patch must preserve installation-in-progress order states");

// Installations: private mutation core + strict next-state matrix.
assert.match(sql, /customer_installation_status_transition_allowed/i, "installation transition helper must exist");
assert.match(sql, /Invalid customer installation status transition/i, "invalid installation transitions must fail closed");
assert.match(sql, /private\.create_customer_installation_from_order/i, "installation create mutation must live behind a private function");
assert.match(sql, /private\.update_customer_installation_schedule/i, "installation schedule mutation must live behind a private function");
assert.match(sql, /private\.set_customer_installation_status/i, "installation status mutation must live behind a private function");
assert.match(sql, /security definer/i, "private installation mutation functions must use controlled definer execution");
assert.match(sql, /revoke execute[\s\S]*set_customer_installation_status[\s\S]*from public/i, "installation RPC must revoke PUBLIC execute");
assert.match(sql, /grant execute[\s\S]*set_customer_installation_status[\s\S]*to authenticated/i, "installation RPC must grant authenticated execute explicitly");
assert.doesNotMatch(installationDetail, /statuses\.map\(/, "installation UI must not offer every lifecycle status");
assert.match(installationDetail, /nextInstallationStatuses|INSTALLATION_STATUS_TRANSITIONS/, "installation UI must derive valid next statuses");
assert.match(installationDetail, /scheduled[\s\S]{0,260}confirmed[\s\S]{0,260}cancelled/i, "scheduled installation must expose only confirmed/cancelled next actions");
assert.match(installationDetail, /in_progress[\s\S]{0,260}completed/i, "in-progress installation must expose completion as a next action");

// Invoice/payment boundary: active internal roles, no new portal invoice/payment surface.
assert.match(permissions, /"invoices\.manage"/, "Admin permission model must retain invoice mutation permission");
assert.match(permissions, /finance:[\s\S]*"invoices\.manage"/, "Finance must retain invoice management permission");
assert.doesNotMatch(sql + confirmationPatch + legacyCompatibility + fulfillmentCompatibility, /get_store_portal_(?:invoice|payment)/i, "A1 must not add portal invoice/payment RPCs");
assert.doesNotMatch(sql + confirmationPatch + legacyCompatibility + fulfillmentCompatibility, /create\s+table[\s\S]{0,80}(?:payment_transactions|customer_payments|payment_ledger)/i, "standalone payment ledger remains deferred");

// Existing Store contracts are the cross-roadmap proof that portal data is intentionally narrower.
assert.match(storePortalContract, /unit_price\|subtotal\|tax_amount\|total_amount\|grand_total\|payment_commission_amount\|internal_notes/i, "Store order contract must guard financial/internal fields");
assert.match(portalExperienceContract, /source_warehouse_id/, "Store fulfillment contract must guard source warehouse fields");
assert.match(portalExperienceContract, /source_location_id/, "Store fulfillment contract must guard source location fields");
assert.match(portalExperienceContract, /stock_deducted_at/, "Store fulfillment contract must guard stock deduction metadata");
assert.match(portalExperienceContract, /assigned_to/, "Store fulfillment contract must guard internal installer assignment IDs");
assert.match(portalExperienceContract, /internal_notes/, "Store fulfillment contract must guard fulfillment internal notes");

console.log("A1 core operations contract PASS");
