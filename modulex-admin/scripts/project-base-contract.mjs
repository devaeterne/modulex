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
const orderDomain = read("src/lib/customers/order-domain.ts");
const projectsPage = read("src/app/(admin)/projects/page.tsx");
const projectDetailPage = read("src/app/(admin)/projects/[id]/page.tsx");

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
]) {
  assert(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportedName}\\b`).test(projectDomain),
    `project domain must export ${exportedName}`
  );
}

assert(projectDomain.includes('.rpc("create_customer_project"'), "Project create must use the authoritative RPC");
assert(projectDomain.includes('.rpc("update_customer_project"'), "Project update must use the authoritative RPC");
assert(projectDomain.includes('.rpc("get_customer_projects_page"'), "Project list must use server-side paging RPC");
assert(projectDomain.includes('.rpc("get_customer_project"'), "Project detail must use the authoritative detail RPC");
assert(orderDomain.includes('.rpc("create_project_customer_order"'), "Project-context Order creation must use the project-aware RPC");
assert(projectsPage.includes("PageBreadCrumb"), "Projects list must use the shared page heading convention");
assert(projectDetailPage.includes("PageBreadCrumb"), "Project detail must use the shared page heading convention");

console.log("PASS: project-base foundation contract");
