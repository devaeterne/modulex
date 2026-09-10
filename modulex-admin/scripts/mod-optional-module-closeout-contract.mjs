import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");
const approvals = read("src/components/approvals/ApprovalRequestsManager.tsx");
const roadmap = read("ADMIN_ROADMAP.md");

expect(exists("src/app/(admin)/approvals/page.tsx"), "Approvals production route must remain");
expect(sidebar.includes('path: "/approvals", permission: "approvals.view"'), "Approvals must remain discoverable behind approvals.view");
expect(permissions.includes('"approvals.view"'), "Approvals view permission must remain");
expect(permissions.includes('"approvals.review"'), "Approvals review permission must remain");
expect(approvals.includes('supabase.rpc("review_approval_request"'), "Approvals must use the canonical review RPC");
expect(approvals.includes('const canReview = role === "super_admin" || role === "admin"'), "Review actions must remain Admin/Super Admin only");
expect(approvals.includes('row.status === "pending"'), "Review actions must remain pending-only");
expect(approvals.includes('href: `/customers/${item.customer_id}/orders/${item.id}`'), "Order approvals must deep-link to the owning order");
expect(approvals.includes('href: `/customers/${item.customer_id}/invoices/${item.id}`'), "Invoice approvals must deep-link to the owning invoice");
expect(approvals.includes('href: `/customers/${item.entity_id}`'), "Customer approvals must deep-link to the owning customer");

for (const requestType of ["order_exception", "order_revision", "order_status_change", "customer_commercial_change", "customer_price_group_change", "invoice_change"]) {
  expect(approvals.includes(requestType), `Approvals UI must explicitly recognize ${requestType}`);
}

expect(!exists("src/app/(admin)/training/page.tsx"), "Standalone /training route must be removed from production surface");
expect(!exists("src/components/training/TrainingCenter.tsx"), "Static browser-local training UI must be removed");
expect(!exists("src/lib/training/content.ts"), "Static training lesson content must be removed");
expect(!permissions.includes('"training.view"'), "Ghost training.view permission must be removed");
expect(!permissions.includes('path === "/training"'), "Training route guard must be removed");
expect(!sidebar.includes('path: "/training"'), "Training must not remain in navigation");

expect(roadmap.includes('Status: `[x]` MOD-A1→MOD-A3 closed'), "MOD roadmap status must be closed");
expect(roadmap.includes('- [x] **MOD-A1 — Approvals decision.**'), "MOD-A1 must be checked off");
expect(roadmap.includes('- [x] **MOD-A2 — Training decision.**'), "MOD-A2 must be checked off");
expect(roadmap.includes('- [x] **MOD-A3 — Optional-module exit gate.**'), "MOD-A3 must be checked off");

console.log("MOD optional-module closeout contract: ok");
