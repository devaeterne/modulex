import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const panelPath = path.join(root, "src/components/customers/EntityDocumentsPanel.tsx");
const orderDetailPath = path.join(root, "src/components/customers/CustomerOrderDetail.tsx");
const orderPagePath = path.join(root, "src/app/(admin)/customers/[id]/orders/[orderId]/page.tsx");
const customerPanelPath = path.join(root, "src/components/customers/CustomerDocumentsPanel.tsx");
const grantRepairPath = path.join(
  root,
  "../modulex-store/supabase/migrations/20260911134819_entity_document_storage_helper_execute_grants.sql",
);
const customerPolicyGrantRepairPath = path.join(
  root,
  "../modulex-store/supabase/migrations/20260911141832_customer_document_storage_policy_helper_execute_grants.sql",
);
const tfxMigrationPath = path.join(
  root,
  "../modulex-store/supabase/migrations/20260911135828_entity_document_tfx_mime_support.sql",
);

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function requireNoMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const panel = read(panelPath);
const orderDetail = read(orderDetailPath);
const orderPage = read(orderPagePath);
const customerPanel = read(customerPanelPath);
const grantRepair = read(grantRepairPath);
const customerPolicyGrantRepair = read(customerPolicyGrantRepairPath);
const tfxMigration = read(tfxMigrationPath);

requireMatch(
  panel,
  /acceptedExtensions\s*=\s*["'][^"']*\.pdf[^"']*\.jpg[^"']*\.jpeg[^"']*\.png[^"']*\.webp[^"']*\.docx[^"']*\.xls[^"']*\.xlsx[^"']*\.csv[^"']*\.tfx/i,
  "Entity document upload must advertise PDF/images/DOCX/XLS/XLSX/CSV/TFX.",
);
requireMatch(panel, /xls:\s*["']application\/vnd\.ms-excel["']/, "Entity document upload must normalize XLS MIME.");
requireMatch(panel, /tfx:\s*["']image\/tiff-fx["']/, "Entity document upload must normalize TFX to image/tiff-fx.");
requireMatch(panel, /["']image\/tiff-fx["']/, "Entity document upload must allow the TFX MIME type.");
requireMatch(panel, /XLS\/XLSX[^\n]*TFX|XLSX[^\n]*TFX/i, "Upload guidance must mention spreadsheet and TFX support.");

requireMatch(
  orderDetail,
  /<EntityDocumentsPanel[\s\S]*entityType=["']order["'][\s\S]*entityId=\{order\.id\}/,
  "Order detail must bind document ownership to the loaded canonical order.id, never only to a route parameter.",
);
requireNoMatch(
  orderPage,
  /<OrderDocumentsPanel\b/,
  "Order page must not mount a second route-param-driven document panel.",
);

for (const previewPanel of [panel, customerPanel]) {
  requireMatch(previewPanel, /createSignedUrl\(/, "Private document preview must use a short-lived signed URL.");
  requireMatch(previewPanel, /previewUrl|previewDocument|previewItem/i, "Document preview must keep explicit in-app preview state.");
  requireMatch(previewPanel, /role=["']dialog["']|aria-modal=["']true["']/, "Document preview must render in an accessible in-app dialog.");
  requireNoMatch(previewPanel, /getPublicUrl\(/, "Private document preview must never use public bucket URLs.");
}

for (const helper of [
  "can_upload_entity_document_object",
  "can_read_entity_document_object",
  "can_delete_unregistered_entity_document_object",
]) {
  requireMatch(
    grantRepair,
    new RegExp(`grant\\s+execute\\s+on\\s+function\\s+private\\.${helper}\\(text,\\s*text\\)\\s+to\\s+authenticated`, "i"),
    `${helper} must remain executable by authenticated because Storage RLS calls it as the caller.`,
  );
}
requireNoMatch(grantRepair, /grant\s+execute[\s\S]*\s+to\s+(?:public|anon)\b/i, "Storage policy helpers must not be exposed to PUBLIC or anon.");

for (const helper of ["can_store_dealer_read_document_object", "can_staff_mutate_customer_document_object"]) {
  requireMatch(
    customerPolicyGrantRepair,
    new RegExp(`grant\\s+execute\\s+on\\s+function\\s+private\\.${helper}\\(text,\\s*text\\)\\s+to\\s+authenticated`, "i"),
    `${helper} must be executable by authenticated because customer-document Storage RLS policies are planned with entity-document access.`,
  );
}
requireNoMatch(
  customerPolicyGrantRepair,
  /grant\s+execute[\s\S]*\s+to\s+(?:public|anon)\b/i,
  "Customer-document Storage policy helpers must not be exposed to PUBLIC or anon.",
);

requireMatch(tfxMigration, /update\s+storage\.buckets/i, "TFX support must update the existing private entity-documents bucket.");
requireMatch(tfxMigration, /image\/tiff-fx/i, "TFX support must add the registered image/tiff-fx MIME type.");
requireMatch(tfxMigration, /where\s+id\s*=\s*['"]entity-documents['"]/i, "TFX MIME support must stay scoped to entity-documents.");
requireNoMatch(tfxMigration, /public\s*=\s*true/i, "TFX support must not make the entity-documents bucket public.");

console.log("Project/Order entity document upload contract passed.");
