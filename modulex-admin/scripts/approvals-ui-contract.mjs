import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manager = read("src/components/approvals/ApprovalRequestsManager.tsx");
const route = read("src/app/(admin)/approvals/page.tsx");
const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");

expect(route.includes('ApprovalRequestsManager from "@/components/approvals/ApprovalRequestsManager"'), "Approvals production route must keep ApprovalRequestsManager");
expect(sidebar.includes('path: "/approvals", permission: "approvals.view"'), "Approvals sidebar entry must remain gated by approvals.view");
expect(permissions.includes('{ match: (path) => path === "/approvals" || path.startsWith("/approvals/"), permission: "approvals.view" }'), "Approvals route guard must remain approvals.view");

for (const primitive of ["ComponentCard", "Label", "Select", "TextArea", "Alert", "Badge", "Button"]) {
  expect(manager.includes(primitive), `Approvals UI must compose shared ${primitive} primitives`);
}

expect(!/<(?:select|textarea|button)\b/.test(manager), "Approvals UI must not reimplement shared select, textarea, or button primitives");
expect(manager.includes('<article key={row.id}'), "Approvals must preserve the semantic per-request article list");
expect(manager.includes("<Metric label=\"Pending\""), "Approvals must preserve its established metric-card summary pattern");

expect(manager.includes('supabase.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(150)'), "Approvals must preserve newest-first bounded approval loading");
expect(manager.includes('supabase.from("profiles").select("id, full_name, email").eq("is_active", true)'), "Approvals must preserve active staff profile resolution");
expect(manager.includes('supabase.from("customer_orders").select("id, customer_id, order_number").in("id", orderIds)'), "Approvals must preserve order record link resolution");
expect(manager.includes('supabase.from("customer_invoices").select("id, customer_id, invoice_number").in("id", invoiceIds)'), "Approvals must preserve invoice record link resolution");
expect(manager.includes('const canReview = role === "super_admin" || role === "admin"'), "Approvals must preserve the current admin/super-admin review rule");
expect(manager.includes('canReview && row.status === "pending"'), "Approvals review controls must remain pending-only and permission-gated");

expect(manager.includes('supabase.rpc("review_approval_request"'), "Approvals must preserve review_approval_request RPC");
expect(manager.includes("p_request_id: row.id"), "Approvals review RPC must keep the request id");
expect(manager.includes("p_decision: decision"), "Approvals review RPC must keep the decision");
expect(manager.includes("p_note: reviewNotes[row.id]?.trim() || null"), "Approvals review RPC must keep the optional trimmed review note");
expect(manager.includes('decision: "approved" | "rejected"'), "Approvals must keep approve/reject decisions only");

expect(manager.includes('useState<"all" | ApprovalStatus>("pending")'), "Approvals must keep pending as the default status filter");
expect(manager.includes('const [typeFilter, setTypeFilter] = useState("all")'), "Approvals must keep request-type filtering");
expect(manager.includes('statusFilter === "all" || row.status === statusFilter'), "Approvals must preserve status filtering");
expect(manager.includes('typeFilter === "all" || row.request_type === typeFilter'), "Approvals must preserve request-type filtering");
expect(manager.includes("Loading approvals..."), "Approvals must preserve an explicit loading state");
expect(manager.includes("No approval requests match these filters."), "Approvals must preserve the filtered empty state");

console.log("approvals UI contract: ok");
