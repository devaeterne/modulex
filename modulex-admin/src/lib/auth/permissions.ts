import type { UserRole } from "@/lib/supabase/profile";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  sales: "Sales",
  finance: "Finance",
  hr: "HR",
  warehouse: "Warehouse",
  shipping: "Shipping",
};

export type Permission =
  | "dashboard.view"
  | "profile.view"
  | "requests.view"
  | "requests.manage"
  | "products.view"
  | "products.manage"
  | "store.view"
  | "store.manage"
  | "leads.view"
  | "leads.manage"
  | "pricing.view"
  | "pricing.cost.view"
  | "pricing.manage"
  | "customers.view"
  | "customers.manage"
  | "orders.view"
  | "orders.manage"
  | "approvals.view"
  | "approvals.review"
  | "invoices.view"
  | "invoices.manage"
  | "shipments.view"
  | "shipments.manage"
  | "installations.view"
  | "installations.manage"
  | "inventory.view"
  | "inventory.manage"
  | "warehouse.view"
  | "warehouse.manage"
  | "qr.view"
  | "qr.manage"
  | "reports.view"
  | "finance.view"
  | "finance.manage"
  | "personnel.view"
  | "personnel.manage"
  | "training.view"
  | "settings.view"
  | "settings.manage"
  | "users.view"
  | "users.manage"
  | "roles.manage"
  | "system.view";

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "View dashboard",
  "profile.view": "View own profile",
  "requests.view": "View and create own requests",
  "requests.manage": "Manage all requests",
  "products.view": "View products",
  "products.manage": "Manage products, brands & categories",
  "store.view": "View Store content",
  "store.manage": "Manage Store content & publishing",
  "leads.view": "View website leads & dealer applications",
  "leads.manage": "Manage website leads & dealer applications",
  "pricing.view": "View selling prices",
  "pricing.cost.view": "View cost & margin",
  "pricing.manage": "Manage prices & price groups",
  "customers.view": "View customers",
  "customers.manage": "Manage customer records",
  "orders.view": "View customer orders",
  "orders.manage": "Create & change customer orders",
  "approvals.view": "View approval requests",
  "approvals.review": "Approve or reject requests",
  "invoices.view": "View customer invoices",
  "invoices.manage": "Create invoices & record payments",
  "shipments.view": "View shipments",
  "shipments.manage": "Manage shipments",
  "installations.view": "View installations",
  "installations.manage": "Manage installations",
  "inventory.view": "View inventory & low stock",
  "inventory.manage": "Run stock operations",
  "warehouse.view": "View warehouses & locations",
  "warehouse.manage": "Manage warehouse structure",
  "qr.view": "View QR labels",
  "qr.manage": "Run QR / shelf operations",
  "reports.view": "View operational reports",
  "finance.view": "View financial data & reports",
  "finance.manage": "Manage finance operations",
  "personnel.view": "View personnel records",
  "personnel.manage": "Manage employees and HR operations",
  "training.view": "View help and training center",
  "settings.view": "View system settings",
  "settings.manage": "Manage system settings",
  "users.view": "View users",
  "users.manage": "Create and manage users",
  "roles.manage": "Manage roles & access",
  "system.view": "Use system diagnostics",
};

const allPermissions = Object.keys(PERMISSION_LABELS) as Permission[];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: allPermissions,
  admin: allPermissions,
  sales: [
    "dashboard.view",
    "profile.view",
    "requests.view",
    "products.view",
    "leads.view",
    "leads.manage",
    "pricing.view",
    "customers.view",
    "customers.manage",
    "orders.view",
    "orders.manage",
    "approvals.view",
    "invoices.view",
    "invoices.manage",
    "shipments.view",
    "shipments.manage",
    "installations.view",
    "installations.manage",
    "inventory.view",
    "reports.view",
    "training.view",
  ],
  finance: [
    "dashboard.view",
    "profile.view",
    "requests.view",
    "products.view",
    "pricing.view",
    "pricing.cost.view",
    "orders.view",
    "approvals.view",
    "invoices.view",
    "invoices.manage",
    "inventory.view",
    "reports.view",
    "finance.view",
    "finance.manage",
    "training.view",
  ],
  hr: [
    "profile.view",
    "requests.view",
    "personnel.view",
    "personnel.manage",
    "training.view",
  ],
  warehouse: [
    "dashboard.view",
    "profile.view",
    "requests.view",
    "products.view",
    "shipments.view",
    "shipments.manage",
    "inventory.view",
    "inventory.manage",
    "warehouse.view",
    "qr.view",
    "qr.manage",
    "training.view",
  ],
  shipping: [
    "dashboard.view",
    "profile.view",
    "requests.view",
    "products.view",
    "shipments.view",
    "shipments.manage",
    "inventory.view",
    "warehouse.view",
    "qr.view",
    "training.view",
  ],
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "Full system access, including protected Super Admin account management.",
  admin: "Full business and system administration, except protected Super Admin account actions.",
  sales: "Customer, website lead, dealer application, order, invoice, shipment and installation workflows. Financial exceptions remain subject to approval.",
  finance: "Invoices, collections, cost/margin visibility and payroll processing. Compensation setup is read-only; employee HR master data stays restricted.",
  hr: "Full personnel lifecycle management including attendance, leave, compensation, payroll, benefits, documents, compliance, onboarding/offboarding and performance.",
  warehouse: "Stock, shipment and QR operations with read access to warehouse structure. Warehouse master data remains Admin-managed.",
  shipping: "Shipment execution with inventory, warehouse-location and QR-label visibility. General stock operations, customer commercial data and order-financial screens stay restricted.",
};

export function hasPermission(role: UserRole | null | undefined, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: UserRole | null | undefined, permissions: readonly Permission[]) {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function isAdminRole(role: UserRole | null | undefined) {
  return role === "super_admin" || role === "admin";
}

const ROUTE_RULES: Array<{ match: (pathname: string) => boolean; permission: Permission }> = [
  { match: (path) => path === "/profile" || path.startsWith("/profile/"), permission: "profile.view" },
  { match: (path) => path === "/requests" || path.startsWith("/requests/"), permission: "requests.view" },
  { match: (path) => path === "/training" || path.startsWith("/training/"), permission: "training.view" },
  { match: (path) => path === "/api-test" || path.startsWith("/api-test/"), permission: "system.view" },
  { match: (path) => path === "/roles" || path.startsWith("/roles/"), permission: "roles.manage" },
  { match: (path) => path === "/users" || path.startsWith("/users/"), permission: "users.view" },
  { match: (path) => path === "/store/leads", permission: "leads.view" },
  { match: (path) => path.startsWith("/store/leads/"), permission: "leads.manage" },
  {
    match: (path) =>
      path === "/store/company" ||
      path.startsWith("/store/company/") ||
      path === "/store/pages" ||
      path.startsWith("/store/pages/") ||
      path === "/store/projects" ||
      path.startsWith("/store/projects/") ||
      path === "/store/media" ||
      path.startsWith("/store/media/") ||
      path === "/store/content" ||
      path.startsWith("/store/content/") ||
      path === "/store/marketing" ||
      path.startsWith("/store/marketing/") ||
      path === "/store/colors" ||
      path.startsWith("/store/colors/"),
    permission: "store.manage",
  },
  { match: (path) => path === "/store/products", permission: "store.view" },
  { match: (path) => path.startsWith("/store/products/"), permission: "store.manage" },
  { match: (path) => path === "/store" || path.startsWith("/store/"), permission: "store.view" },
  {
    match: (path) =>
      path === "/personnel/departments" ||
      path.startsWith("/personnel/departments/") ||
      path === "/personnel/positions" ||
      path.startsWith("/personnel/positions/"),
    permission: "personnel.manage",
  },
  { match: (path) => path === "/personnel" || path.startsWith("/personnel/"), permission: "personnel.view" },
  { match: (path) => path === "/finance" || path.startsWith("/finance/"), permission: "finance.view" },
  { match: (path) => path === "/settings/general/tax-rules" || path.startsWith("/settings/general/tax-rules/"), permission: "finance.manage" },
  {
    match: (path) =>
      path === "/settings/payment-methods" ||
      path.startsWith("/settings/payment-methods/") ||
      path === "/customers/payment-methods" ||
      path.startsWith("/customers/payment-methods/"),
    permission: "finance.manage",
  },
  { match: (path) => path === "/settings" || path.startsWith("/settings/"), permission: "settings.view" },
  { match: (path) => path === "/approvals" || path.startsWith("/approvals/"), permission: "approvals.view" },
  { match: (path) => path.includes("/invoices"), permission: "invoices.view" },
  { match: (path) => path.includes("/shipments"), permission: "shipments.view" },
  { match: (path) => path.includes("/installations"), permission: "installations.view" },
  { match: (path) => path.includes("/orders/") && (path.endsWith("/new") || path.endsWith("/edit")), permission: "orders.manage" },
  { match: (path) => path === "/customers/orders" || path.includes("/orders"), permission: "orders.view" },
  { match: (path) => path === "/customers" || path.startsWith("/customers/"), permission: "customers.view" },
  { match: (path) => path === "/pricing/cost-margin" || path.startsWith("/pricing/cost-margin/"), permission: "pricing.cost.view" },
  { match: (path) => path === "/pricing/groups" || path.startsWith("/pricing/groups/"), permission: "pricing.manage" },
  { match: (path) => path === "/pricing" || path.startsWith("/pricing/"), permission: "pricing.view" },
  { match: (path) => path === "/brands" || path.startsWith("/brands/") || path === "/categories" || path.startsWith("/categories/"), permission: "products.manage" },
  { match: (path) => path.startsWith("/products/") && (path.endsWith("/new") || path.endsWith("/edit")), permission: "products.manage" },
  { match: (path) => path === "/products" || path.startsWith("/products/"), permission: "products.view" },
  { match: (path) => path === "/low-stock" || path.startsWith("/low-stock/"), permission: "inventory.view" },
  { match: (path) => path === "/stock-operations" || path.startsWith("/stock-operations/"), permission: "inventory.manage" },
  { match: (path) => path === "/stock-movements" || path.startsWith("/stock-movements/") || path === "/inventory" || path.startsWith("/inventory/"), permission: "inventory.view" },
  {
    match: (path) =>
      path === "/warehouses/new" ||
      (path.startsWith("/warehouses/") && path.endsWith("/edit")) ||
      path === "/zones/new" ||
      (path.startsWith("/zones/") && path.endsWith("/edit")) ||
      path === "/locations/new" ||
      (path.startsWith("/locations/") && path.endsWith("/edit")),
    permission: "warehouse.manage",
  },
  { match: (path) => path === "/warehouses" || path.startsWith("/warehouses/") || path === "/zones" || path.startsWith("/zones/") || path === "/locations" || path.startsWith("/locations/"), permission: "warehouse.view" },
  { match: (path) => path === "/qr-labels" || path.startsWith("/qr-labels/"), permission: "qr.view" },
  { match: (path) => path === "/scan" || path.startsWith("/scan/") || path === "/shelf-inventory" || path.startsWith("/shelf-inventory/"), permission: "qr.manage" },
  { match: (path) => path === "/reports" || path.startsWith("/reports/"), permission: "reports.view" },
  { match: (path) => path === "/", permission: "dashboard.view" },
];

export function requiredPermissionForPath(pathname: string): Permission | null {
  return ROUTE_RULES.find((rule) => rule.match(pathname))?.permission ?? null;
}

export function canAccessPath(role: UserRole | null | undefined, pathname: string) {
  const permission = requiredPermissionForPath(pathname);
  return permission ? hasPermission(role, permission) : isAdminRole(role);
}
