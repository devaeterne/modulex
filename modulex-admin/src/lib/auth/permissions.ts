import type { UserRole } from "@/lib/supabase/profile";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  sales: "Sales",
  warehouse: "Warehouse",
  shipping: "Shipping",
};

export type Permission =
  | "dashboard.view"
  | "products.view"
  | "products.manage"
  | "pricing.view"
  | "pricing.manage"
  | "inventory.view"
  | "inventory.manage"
  | "warehouse.view"
  | "warehouse.manage"
  | "qr.view"
  | "qr.manage"
  | "reports.view"
  | "users.view"
  | "users.manage"
  | "roles.manage";

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "Dashboard",
  "products.view": "View products",
  "products.manage": "Manage products",
  "pricing.view": "View pricing",
  "pricing.manage": "Manage pricing",
  "inventory.view": "View inventory",
  "inventory.manage": "Manage inventory",
  "warehouse.view": "View warehouse",
  "warehouse.manage": "Manage warehouse",
  "qr.view": "View QR operations",
  "qr.manage": "Run QR operations",
  "reports.view": "View reports",
  "users.view": "View users",
  "users.manage": "Manage users",
  "roles.manage": "Manage roles & access",
};

const allPermissions = Object.keys(PERMISSION_LABELS) as Permission[];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: allPermissions,
  admin: allPermissions,
  sales: [
    "dashboard.view",
    "products.view",
    "pricing.view",
    "inventory.view",
    "reports.view",
  ],
  warehouse: [
    "dashboard.view",
    "products.view",
    "inventory.view",
    "inventory.manage",
    "warehouse.view",
    "warehouse.manage",
    "qr.view",
    "qr.manage",
  ],
  shipping: [
    "dashboard.view",
    "products.view",
    "inventory.view",
    "warehouse.view",
    "qr.view",
    "qr.manage",
  ],
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "Full system access, including Super Admin account management.",
  admin: "Full operational access and user management, except protected Super Admin actions.",
  sales: "Read access to products, pricing, inventory and reports.",
  warehouse: "Warehouse, stock and QR operations with operational write access.",
  shipping: "Shipping-focused inventory, warehouse and QR operation access.",
};

export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission
) {
  if (!role) {
    return false;
  }

  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isAdminRole(role: UserRole | null | undefined) {
  return role === "super_admin" || role === "admin";
}
