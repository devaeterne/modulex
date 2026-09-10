import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manager = read("src/components/approvals/ApprovalRequestsManager.tsx");
const route = read("src/app/(admin)/approvals/page.tsx");
const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");
const primaryNavigation = sidebar.split("const managementItems: NavItem[] =")[0];
const managementNavigation = sidebar.split("const managementItems: NavItem[] =")[1] ?? "";

expect(route.includes('ApprovalRequestsManager from "@/components/approvals/ApprovalRequestsManager"'), "Approvals production route must keep ApprovalRequestsManager");
expect(primaryNavigation.includes('name: "Approvals", path: "/approvals", permission: "approvals.view"'), "Approvals must be a first-class shared-workflow navigation item");
expect(!managementNavigation.includes('name: "Approvals", path: "/approvals"'), "Approvals must not be presented as a Finance-owned module");
expect(permissions.includes('{ match: (path) => path === "/approvals" || path.startsWith("/approvals/"), permission: "approvals.view" }'), "Approvals route guard must remain approvals.view");
expect(permissions.includes('| "approvals.review"'), "Approvals must keep a distinct review permission");

for (const primitive of ["ComponentCard", "Label", "Select", "TextArea", "Alert", "Badge", "Button"]) {
  expect(manager.includes(primitive), `Approvals UI must compose shared ${primitive} primitives`);
}

expect(!/<(?:select|textarea|button)\b/.test(manager), "Approvals UI must not reimplement shared select, textarea, or button primitives");
expect(/<article\s+[\s\S]{0,120}key=\{row\.id\}/.test(manager), "Approvals must preserve the semantic per-request article list");
expect(manager.includes("<Metric label=\"Pending\""), "Approvals must preserve its established metric-card summary pattern");

expect(/supabase\.from\("approval_requests"\)\.select\("\*"\)\.order\("created_at", \{ ascending: false \}\)\.limit\(150\)/.test(manager), "Approvals must preserve newest-first bounded approval loading");
expect(/supabase\.from\("profiles"\)\.select\("id, full_name, email"\)\.eq\("is_active", true\)/.test(manager), "Approvals must preserve active staff profile resolution");
expect(/supabase\s*\.from\("customer_orders"\)\s*\.select\("id, customer_id, order_number"\)\s*\.in\("id", orderIds\)/.test(manager), "Approvals must preserve order record link resolution");
expect(/supabase\s*\.from\("customer_invoices"\)\s*\.select\("id, customer_id, invoice_number"\)\s*\.in\("id", invoiceIds\)/.test(manager), "Approvals must preserve invoice record link resolution");
expect(manager.includes('href: `/customers/${item.customer_id}/orders/${item.id}`'), "Order approvals must deep-link to the owning order");
expect(manager.includes('href: `/customers/${item.customer_id}/invoices/${item.id}`'), "Invoice approvals must deep-link to the owning invoice");
expect(manager.includes('href: `/customers/${item.entity_id}`'), "Customer approvals must deep-link to the owning customer");
expect(manager.includes('const canReview = role === "super_admin" || role === "admin"'), "Approvals must preserve the current admin/super-admin review rule");
expect(manager.includes('canReview && row.status === "pending"'), "Approvals review controls must remain pending-only and permission-gated");

for (const requestType of [
  "order_exception",
  "order_revision",
  "order_status_change",
  "customer_commercial_change",
  "customer_price_group_change",
  "invoice_change",
]) {
  expect(manager.includes(`row.request_type === "${requestType}"`), `Approvals UI must recognize production request type ${requestType}`);
}

expect(manager.includes('supabase.rpc("review_approval_request"'), "Approvals must preserve review_approval_request RPC");
expect(manager.includes("p_request_id: row.id"), "Approvals review RPC must keep the request id");
expect(manager.includes("p_decision: decision"), "Approvals review RPC must keep the decision");
expect(manager.includes("p_note: reviewNotes[row.id]?.trim() || null"), "Approvals review RPC must keep the trimmed decision note");
expect(manager.includes('decision: "approved" | "rejected"'), "Approvals must keep approve/reject decisions only");

expect(manager.includes('useState<"all" | ApprovalStatus>("pending")'), "Approvals must keep pending as the default status filter");
expect(manager.includes('const [typeFilter, setTypeFilter] = useState("all")'), "Approvals must keep request-type filtering");
expect(manager.includes('statusFilter === "all" || row.status === statusFilter'), "Approvals must preserve status filtering");
expect(manager.includes('typeFilter === "all" || row.request_type === typeFilter'), "Approvals must preserve request-type filtering");
expect(manager.includes("Loading approvals..."), "Approvals must preserve an explicit loading state");
expect(manager.includes("No approval requests match these filters."), "Approvals must preserve the filtered empty state");

expect(!exists("src/app/(admin)/training/page.tsx"), "Legacy /training route must be removed from the production surface");
expect(!exists("src/components/training/TrainingCenter.tsx"), "Legacy browser-local TrainingCenter must be removed");
expect(!exists("src/lib/training/content.ts"), "Legacy static training lesson catalog must be removed");
expect(!permissions.includes('"training.view"'), "Removed Training surface must not leave a ghost RBAC permission");

console.log("approvals + optional-module UI contract: ok");
