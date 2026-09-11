import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const panelPath = path.join(root, "src/components/customers/EntityDocumentsPanel.tsx");
const orderPanelPath = path.join(root, "src/components/customers/OrderDocumentsPanel.tsx");
const orderPagePath = path.join(root, "src/app/(admin)/customers/[id]/orders/[orderId]/page.tsx");
const projectDocumentsPath = path.join(root, "src/components/customers/project-detail/ProjectDocumentsTab.tsx");
const customerPanelPath = path.join(root, "src/components/customers/CustomerDocumentsPanel.tsx");
const previewPath = path.join(root, "src/components/customers/PrivateDocumentPreview.tsx");
const modalPrimitivePath = path.join(root, "src/components/ui/modal/index.tsx");
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
const registrationMigrationPath = path.join(
  root,
  "../modulex-store/supabase/migrations/20260911145327_entity_document_registration_file_types.sql",
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
const orderPanel = read(orderPanelPath);
const orderPage = read(orderPagePath);
const projectDocuments = read(projectDocumentsPath);
const customerPanel = read(customerPanelPath);
const preview = read(previewPath);
const modalPrimitive = read(modalPrimitivePath);
const grantRepair = read(grantRepairPath);
const customerPolicyGrantRepair = read(customerPolicyGrantRepairPath);
const tfxMigration = read(tfxMigrationPath);
const registrationMigration = read(registrationMigrationPath);

requireMatch(
  panel,
  /acceptedExtensions\s*=\s*["'][^"']*\.pdf[^"']*\.jpg[^"']*\.jpeg[^"']*\.png[^"']*\.webp[^"']*\.docx[^"']*\.xls[^"']*\.xlsx[^"']*\.csv[^"']*\.tfx/i,
  "Entity document upload must advertise PDF/images/DOCX/XLS/XLSX/CSV/TFX.",
);
requireMatch(panel, /xls:\s*["']application\/vnd\.ms-excel["']/, "Entity document upload must normalize XLS MIME.");
requireMatch(panel, /tfx:\s*["']image\/tiff-fx["']/, "Entity document upload must normalize TFX to image/tiff-fx.");
requireMatch(panel, /["']image\/tiff-fx["']/, "Entity document upload must allow the TFX MIME type.");
requireMatch(panel, /XLS\/XLSX[^\n]*TFX|XLSX[^\n]*TFX/i, "Upload guidance must mention spreadsheet and TFX support.");

requireMatch(orderPage, /<OrderDocumentsPanel\b/, "Order detail route must mount exactly one dedicated Order document panel.");
requireMatch(orderPanel, /from\(["']customer_orders["']\)/, "Order documents must verify ownership against customer_orders.");
requireMatch(orderPanel, /\.eq\(["']id["'],\s*params\.orderId\)/, "Order documents must resolve the route Order id through customer_orders.");
requireMatch(orderPanel, /\.eq\(["']customer_id["'],\s*params\.id\)/, "Order documents must verify the Order belongs to the route Customer.");
requireMatch(orderPanel, /entityType=["']order["'][\s\S]*entityId=\{canonicalOrderId\}/, "Order documents must bind metadata/storage ownership to the verified canonical Order id.");
requireNoMatch(projectDocuments, /includeLinkedOrders/, "Project Documents must not aggregate linked Order documents into Project ownership.");

for (const previewPanel of [panel, customerPanel]) {
  requireMatch(previewPanel, /createSignedUrl\(/, "Private document preview must use a short-lived signed URL.");
  requireMatch(previewPanel, /previewUrl|previewDocument|previewItem/i, "Document preview must keep explicit in-app preview state.");
  requireMatch(previewPanel, /<PrivateDocumentPreview\b/, "Document panels must render the shared in-app private preview dialog.");
  requireNoMatch(previewPanel, /getPublicUrl\(/, "Private document preview must never use public bucket URLs.");
}
requireMatch(preview, /<Modal\b/, "Private document preview must use the shared Admin modal primitive.");
requireMatch(preview, /ariaLabelledBy=\{titleId\}/, "Private document preview must label the shared dialog.");
requireMatch(modalPrimitive, /role=["']dialog["']/, "Shared modal primitive must expose dialog semantics.");
requireMatch(modalPrimitive, /aria-modal=["']true["']/, "Shared modal primitive must identify itself as modal.");
requireMatch(preview, /<iframe\b/, "Browser-previewable files must render inside the application.");

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
    `${helper} must be executable by authenticated because customer-document Storage RLS calls it as the caller.`,
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

requireMatch(registrationMigration, /\.xls/i, "Entity document registration must accept XLS metadata.");
requireMatch(registrationMigration, /application\/vnd\.ms-excel/i, "Entity document registration must accept the XLS MIME type.");
requireMatch(registrationMigration, /\.tfx/i, "Entity document registration must accept TFX metadata.");
requireMatch(registrationMigration, /image\/tiff-fx/i, "Entity document registration must accept the TFX MIME type.");
requireMatch(registrationMigration, /revoke\s+(?:all|execute)\s+on\s+function\s+public\.register_entity_document/i, "Registration RPC must retain explicit execute hardening.");

console.log("Project/Order entity document upload contract passed.");
