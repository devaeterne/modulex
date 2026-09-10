import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const pagePath = path.join(root, "src/app/(admin)/customers/[id]/page.tsx");
const cardPath = path.join(root, "src/components/customers/CustomerCard.tsx");
const documentsPanelPath = path.join(root, "src/components/customers/CustomerDocumentsPanel.tsx");
const entityDocumentsPanelPath = path.join(root, "src/components/customers/EntityDocumentsPanel.tsx");
const orderDocumentsPanelPath = path.join(root, "src/components/customers/OrderDocumentsPanel.tsx");
const orderDetailPagePath = path.join(root, "src/app/(admin)/customers/[id]/orders/[orderId]/page.tsx");
const projectDocumentsTabPath = path.join(root, "src/components/customers/project-detail/ProjectDocumentsTab.tsx");
const orderActionsPath = path.join(root, "src/components/customers/CustomerOrderActions.tsx");
const customerInstallationsPath = path.join(root, "src/app/(admin)/customers/[id]/installations/page.tsx");
const portalCardPath = path.join(root, "src/components/customers/CustomerPortalAccessCard.tsx");
const readDedupPath = path.join(root, "src/lib/customers/read-dedup.ts");
const sqlPath = path.join(root, "sql/customer-address-integrity.sql");
const entityDocumentsMigrationPath = path.join(root, "../modulex-store/supabase/migrations/20260910173000_project_order_entity_documents.sql");
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

const page = read(pagePath);
const card = read(cardPath);
const documentsPanel = read(documentsPanelPath);
const entityDocumentsPanel = read(entityDocumentsPanelPath);
const orderDocumentsPanel = read(orderDocumentsPanelPath);
const orderDetailPage = read(orderDetailPagePath);
const projectDocumentsTab = read(projectDocumentsTabPath);
const orderActions = read(orderActionsPath);
const customerInstallations = read(customerInstallationsPath);
const portalCard = read(portalCardPath);
const readDedup = read(readDedupPath);
const sql = read(sqlPath);
const entityDocumentsMigration = read(entityDocumentsMigrationPath);
const pkg = JSON.parse(read(packagePath));

requireNoMatch(page, /legacy-customer-card|<style>/, "Customer detail must not hide legacy actions with route-level CSS.");
requireMatch(page, /<CustomerOrderActions\s*\/>[\s\S]*<CustomerCard\s*\/>[\s\S]*<CustomerPortalAccessCard\s+customerId=\{id\}\s*\/>[\s\S]*<CustomerDocumentsPanel\s+customerId=\{id\}\s*\/>/, "Customer detail hierarchy must keep global order actions first, core customer data second, then secure portal and document management.");
requireMatch(orderActions, /\/customers\/\$\{customerId\}\/installations/, "Customer operations must link to a real customer-scoped installations route.");
requireMatch(customerInstallations, /<CustomerInstallationsList\s+customerId=\{id\}\s*\/>/, "Customer-scoped installations route must pass the customer id into CustomerInstallationsList.");

requireNoMatch(card, /["']Web \/ Portal["']/, "Legacy Web / Portal tab must be removed from CustomerCard.");
requireNoMatch(card, /\.from\(["']customer_portal_users["']\)\.(insert|update|delete)/, "CustomerCard must not mutate portal users directly from the browser.");
requireNoMatch(card, /saveCustomer\s*\(\s*\{\s*portal_enabled/, "CustomerCard must not toggle portal_enabled through a generic customer update.");
requireMatch(portalCard, /\/api\/admin\/dealer-portal/, "The dedicated portal card must use the secure Admin lifecycle API.");
requireMatch(portalCard, />Store Portal Access</, "The secure lifecycle surface must use customer-type-neutral portal wording.");

requireMatch(readDedup, /export\s+function\s+loadCustomerRecord\b/, "Customer detail must expose a shared in-flight customer read helper.");
requireMatch(readDedup, /export\s+function\s+loadCustomerDocuments\b/, "Customer detail must expose a shared in-flight document read helper.");
requireMatch(card, /loadCustomerRecord\(customerId\)/, "CustomerCard must consume the shared customer read helper.");
requireMatch(card, /loadCustomerDocuments\(customerId\)/, "CustomerCard must consume the shared document read helper.");
requireMatch(portalCard, /loadCustomerRecord\(customerId\)/, "CustomerPortalAccessCard must reuse the shared customer read helper.");
requireNoMatch(portalCard, /from\(["']customers["']\)[\s\S]{0,120}select\(["']portal_enabled["']\)/, "Portal card must not issue a second customer read on initial detail load.");
requireMatch(documentsPanel, /loadCustomerDocuments\(customerId\)/, "CustomerDocumentsPanel must reuse the shared document read helper.");
requireNoMatch(documentsPanel, /from\(["']customer_documents["']\)[\s\S]{0,120}select\(["']\*["']\)/, "CustomerDocumentsPanel must not issue an independent active-document read.");

requireMatch(card, /supabase\.rpc\(\s*["']create_customer_address["']/, "Address creation must use the atomic create_customer_address RPC.");
requireMatch(card, /supabase\.rpc\(\s*["']set_customer_address_default["']/, "Existing addresses must support atomic default assignment through set_customer_address_default.");
requireNoMatch(card, /customer_addresses["']\)\.update\(\s*\{\s*is_default_(billing|shipping):\s*false/, "CustomerCard must not clear address defaults in a separate browser update.");

requireMatch(sql, /create or replace function public\.create_customer_address\s*\(/i, "A1.1C SQL must define create_customer_address.");
requireMatch(sql, /create or replace function public\.set_customer_address_default\s*\(/i, "A1.1C SQL must define set_customer_address_default.");
requireNoMatch(sql, /security\s+definer/i, "A1.1C address RPCs must not use SECURITY DEFINER.");
requireMatch(sql, /security\s+invoker/i, "A1.1C address RPCs must be SECURITY INVOKER.");
requireMatch(sql, /current_user_has_any_role\s*\(\s*array\s*\[\s*['"]super_admin['"]\s*,\s*['"]admin['"]\s*,\s*['"]sales['"]/i, "Address mutations must authorize the approved Admin roles.");
requireMatch(sql, /from public\.customers[\s\S]{0,220}for update/i, "Address default mutations must serialize on the customer row.");
requireMatch(sql, /is_default_billing\s*=\s*false/i, "Atomic address creation must clear the previous billing default inside the RPC.");
requireMatch(sql, /is_default_shipping\s*=\s*false/i, "Atomic address creation must clear the previous shipping default inside the RPC.");
requireMatch(sql, /insert into public\.customer_addresses/i, "Atomic address creation must insert the address inside the same RPC transaction.");
requireMatch(sql, /insert into public\.customer_activity/i, "Address/default mutations must write customer activity in the same transaction.");
requireMatch(sql, /revoke all on function public\.create_customer_address[\s\S]{0,400}from public/i, "create_customer_address must revoke PUBLIC execute.");
requireMatch(sql, /grant execute on function public\.create_customer_address[\s\S]{0,400}to authenticated/i, "create_customer_address must grant execute to authenticated only.");
requireMatch(sql, /revoke all on function public\.set_customer_address_default[\s\S]{0,300}from public/i, "set_customer_address_default must revoke PUBLIC execute.");
requireMatch(sql, /grant execute on function public\.set_customer_address_default[\s\S]{0,300}to authenticated/i, "set_customer_address_default must grant execute to authenticated only.");

requireMatch(entityDocumentsMigration, /create table public\.entity_documents/i, "Project/Order documents must have a canonical metadata table.");
requireMatch(entityDocumentsMigration, /entity_type[\s\S]{0,180}project[\s\S]{0,180}order/i, "Entity documents must be restricted to Project and Order ownership.");
requireMatch(entityDocumentsMigration, /25\s*\*\s*1024\s*\*\s*1024|26214400/i, "Entity document storage must enforce a 25 MiB maximum.");
requireMatch(entityDocumentsMigration, /application\/pdf[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/i, "Entity document storage must explicitly allow PDF and supported image MIME types.");
requireMatch(entityDocumentsMigration, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i, "Entity document storage must allow DOCX.");
requireMatch(entityDocumentsMigration, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i, "Entity document storage must allow XLSX.");
requireMatch(entityDocumentsMigration, /text\/csv/i, "Entity document storage must allow CSV.");
requireMatch(entityDocumentsMigration, /create or replace function public\.list_entity_documents\s*\(/i, "Entity documents must expose a canonical list RPC.");
requireMatch(entityDocumentsMigration, /p_include_linked_orders[\s\S]*customer_orders[\s\S]*project_id/i, "Project document reads must be able to include linked Order documents without copying files.");
requireMatch(entityDocumentsMigration, /create or replace function public\.register_entity_document\s*\(/i, "Entity documents must expose a canonical registration RPC.");
requireMatch(entityDocumentsMigration, /create or replace function public\.deactivate_entity_document\s*\(/i, "Entity documents must expose a canonical deactivation RPC.");
requireMatch(entityDocumentsMigration, /set search_path = ''/i, "Entity document RPCs/helpers must pin search_path.");
requireMatch(entityDocumentsMigration, /insert into public\.customer_activity/i, "Entity document lifecycle must write Customer activity.");
requireMatch(entityDocumentsMigration, /registered entity document files are retained|unregistered/i, "Storage deletion must be limited to failed-registration orphan cleanup.");
requireMatch(entityDocumentsMigration, /grant execute on function public\.list_entity_documents[\s\S]*to authenticated/i, "Entity document listing must be authenticated-only.");
requireMatch(entityDocumentsMigration, /grant execute on function public\.register_entity_document[\s\S]*to authenticated/i, "Entity document registration must be authenticated-only.");
requireMatch(entityDocumentsMigration, /grant execute on function public\.deactivate_entity_document[\s\S]*to authenticated/i, "Entity document deactivation must be authenticated-only.");

requireMatch(entityDocumentsPanel, /multiple/, "Shared entity document upload must support multiple files.");
requireMatch(entityDocumentsPanel, /\.pdf.*\.jpg.*\.jpeg.*\.png.*\.webp.*\.docx.*\.xlsx.*\.csv/i, "Shared entity document upload must advertise the approved extensions.");
requireMatch(entityDocumentsPanel, /25\s*\*\s*1024\s*\*\s*1024|26214400/, "Shared entity document upload must apply the 25 MiB early UX guard.");
requireMatch(entityDocumentsPanel, /rpc\(\s*["']list_entity_documents["']/, "Shared entity document panel must use the canonical list RPC.");
requireMatch(entityDocumentsPanel, /rpc\(\s*["']register_entity_document["']/, "Shared entity document panel must use the canonical registration RPC.");
requireMatch(entityDocumentsPanel, /rpc\(\s*["']deactivate_entity_document["']/, "Shared entity document panel must use the canonical deactivation RPC.");
requireMatch(entityDocumentsPanel, /createSignedUrl\([\s\S]{0,200}60/, "Entity document preview/download must use a short-lived signed URL.");
requireMatch(entityDocumentsPanel, /\.remove\(\[storagePath\]\)/, "Failed metadata registration must clean up its unregistered orphan object.");
requireNoMatch(entityDocumentsPanel, /from\(["']entity_documents["']\)\.(insert|update|delete)/, "Browser code must not bypass the canonical entity document lifecycle RPCs.");
requireMatch(projectDocumentsTab, /<EntityDocumentsPanel[\s\S]*entityType="project"[\s\S]*includeLinkedOrders/, "Project Documents must show uploaded Project and linked Order documents.");
requireMatch(projectDocumentsTab, /title="System Documents"/, "Accepted Proposal artifacts must remain a separate System Documents section.");
requireMatch(orderDocumentsPanel, /<EntityDocumentsPanel[\s\S]*entityType="order"/, "Order document wrapper must mount the shared panel for the current Order.");
requireMatch(orderDetailPage, /<OrderDocumentsPanel\s*\/>/, "Order Detail must expose Documents & Photos.");

if (pkg.scripts?.["smoke:customer-detail"] !== "node scripts/customer-detail-integrity-contract.mjs") {
  throw new Error("package.json must expose smoke:customer-detail.");
}
if (!pkg.scripts?.smoke?.includes("smoke:customer-detail")) {
  throw new Error("Main Admin smoke chain must include smoke:customer-detail.");
}

console.log("Customer detail integrity contract passed.");
