import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `Project Base requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");
const projectDomain = read("src/lib/customers/project-domain.ts");
const projectsPage = read("src/app/(admin)/projects/page.tsx");
const projectsWorkspace = read("src/components/customers/ProjectsWorkspace.tsx");
const projectDetailPage = read("src/app/(admin)/projects/[id]/page.tsx");
const projectDetail = read("src/components/customers/ProjectDetailWorkspace.tsx");
const customerOrdersList = read("src/components/customers/CustomerOrdersList.tsx");
const newOrderPage = read("src/app/(admin)/customers/[id]/orders/new/page.tsx");
const newOrder = read("src/components/customers/NewCustomerOrder.tsx");
const orderDetailPage = read("src/app/(admin)/customers/[id]/orders/[orderId]/page.tsx");

assert(permissions.includes('"projects.view"'), "permissions must define projects.view");
assert(permissions.includes('"projects.manage"'), "permissions must define projects.manage");
assert(permissions.includes('path === "/projects"'), "route RBAC must guard /projects");
assert(sidebar.includes('name: "Projects"'), "sidebar must expose Projects");
assert(sidebar.includes('path: "/projects"'), "sidebar Projects item must route to /projects");

for (const exportedName of [
  "listCustomerProjects",
  "getCustomerProject",
  "createCustomerProject",
  "updateCustomerProject",
  "createProjectCustomerOrder",
]) {
  assert(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportedName}\\b`).test(projectDomain),
    `project domain must export ${exportedName}`
  );
}

assert(projectDomain.includes('hasPermission(profile.role, "projects.view")'), "Project reads must use projects.view");
assert(projectDomain.includes('hasPermission(profile.role, "projects.manage")'), "Project mutations must use projects.manage");
assert(projectDomain.includes('.rpc("create_customer_project"'), "Project create must use the authoritative RPC");
assert(projectDomain.includes('.rpc("update_customer_project"'), "Project update must use the authoritative RPC");
assert(projectDomain.includes('.rpc("get_customer_projects_page"'), "Project list must use server-side paging RPC");
assert(projectDomain.includes('.rpc("get_customer_project"'), "Project detail must use the authoritative detail RPC");
assert(projectDomain.includes('.rpc("create_project_customer_order"'), "Project-context Order creation must use the project-aware RPC");
assert(projectsPage.includes("PageBreadCrumb"), "Projects list must use the shared page heading convention");
assert(projectDetailPage.includes("PageBreadCrumb"), "Project detail must use the shared page heading convention");
assert(projectDetail.includes("projectId="), "Project detail must launch new Orders with Project context");
assert(newOrderPage.includes("searchParams"), "New Order page must accept Project query context");
assert(newOrderPage.includes("projectId={projectId}"), "New Order page must pass projectId into the shared Order form");
assert(newOrder.includes("createProjectCustomerOrder"), "New Order must use the Project-aware create boundary when projectId is present");
assert(newOrder.includes("projectId?: string | null"), "New Order form must accept an optional projectId without breaking standalone creation");
assert(orderDetailPage.includes("CustomerOrderProjectLink"), "Order detail must expose its Project when linked");

assert(
  customerOrdersList.includes('if (status === "all") query = query.neq("status", "cancelled")'),
  "Customer Orders default list must exclude cancelled Orders"
);
assert(
  customerOrdersList.includes('else query = query.eq("status", status)'),
  "Customer Orders must still allow an explicit Cancelled status filter"
);
assert(
  projectDetail.includes('.neq("status", "cancelled")'),
  "Project link-existing Order choices must exclude cancelled Orders"
);
assert(
  projectDetail.includes('order.status !== "cancelled"'),
  "Project detail must exclude cancelled child Orders"
);
assert(
  projectsWorkspace.includes("TableViewport") && projectsWorkspace.includes("TableStateRow"),
  "Projects list must use the shared Admin table system"
);
assert(
  projectsWorkspace.includes('from "@/components/ui/alert/Alert"'),
  "Projects list must use the shared Alert primitive for feedback"
);
assert(
  projectDetail.includes("TableViewport") && projectDetail.includes("TableStateRow"),
  "Project detail Orders must use the shared Admin table system"
);
assert(
  projectDetail.includes('from "@/components/ui/alert/Alert"'),
  "Project detail must use the shared Alert primitive for feedback"
);

console.log("PASS: project-base foundation contract");
