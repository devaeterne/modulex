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
  | "projects.view"
  | "projects.manage"
  | "projects.import"
  | "calendar.view"
  | "calendar.manage"
  | "project_payments.view"
  | "project_payments.manage"
  | "project_procurement.view"
  | "project_procurement.manage"
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
  | "system.view"
  | "updates.view";

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
  "projects.view": "View customer projects",
  "projects.manage": "Create & change customer projects",
  "projects.import": "Import historical customer projects",
  "calendar.view": "View Admin calendars & schedules",
  "calendar.manage": "Manage Admin calendars, owners & Google bindings",
  "project_payments.view": "View Project customer collection status",
  "project_payments.manage": "Manage Project customer payments & allocations",
  "project_procurement.view": "View Project procurement status",
  "project_procurement.manage": "Manage Project vendor commitments and delivery",
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
  "updates.view": "View product updates",
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
    "projects.view",
    "projects.manage",
    "calendar.view",
    "calendar.manage",
    "project_payments.view",
    "project_procurement.view",
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
    "updates.view",
  ],
  finance: [
    "dashboard.view",
    "profile.view",
    "requests.view",
    "products.view",
    "pricing.view",
    "projects.view",
    "calendar.view",
    "project_payments.view",
    "project_payments.manage",
    "project_procurement.view",
    "orders.view",
    "approvals.view",
    "invoices.view",
    "invoices.manage",
    "inventory.view",
    "reports.view",
    "finance.view",
    "finance.manage",
    "training.view",
    "updates.view",
  ],
  hr: [
    "profile.view",
    "requests.view",
    "personnel.view",
    "personnel.manage",
    "training.view",
    "updates.view",
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
    "updates.view",
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
    "updates.view",
  ],
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "Full system access, including protected Super Admin account management.",
  admin: "Full business and system administration, except protected Super Admin account actions.",
  sales: "Customer, project, calendar, procurement status, website lead, dealer application, order, invoice, shipment and installation workflows. Customer collection and procurement status are visible, while payment entry, vendor cost and internal finance remain restricted.",
  finance: "Projects, calendar visibility, invoices, customer payment ledger, vendor-invoice allocation, collections and approved payroll settlement. Payroll calculation/source records and employee HR master data remain HR-owned; Product Cost/FOB, cost-margin pricing and procurement ordering/delivery stay restricted.",
  hr: "Full personnel lifecycle management including attendance, leave, compensation, payroll, benefits, documents, compliance, onboarding/offboarding and performance.",
  warehouse: "Stock, shipment and QR operations with read access to warehouse structure. Warehouse master data remains Admin-managed.",
  shipping: "Shipment execution with inventory, warehouse-location and QR-label visibility. General stock operations, customer commercial data and order-financial screens stay restricted.",
};

export type RoleInput = UserRole | readonly UserRole[] | null | undefined;

export function normalizeRoles(input: RoleInput): UserRole[] {
  if (!input) return [];
  if (typeof input === "string") return [input];
  return Array.from(new Set(input));
}

export function hasPermission(roles: RoleInput, permission: Permission) {
  return normalizeRoles(roles).some((role) => ROLE_PERMISSIONS[role].includes(permission));
}
