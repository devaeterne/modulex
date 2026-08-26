import type { UserRole } from "@/lib/supabase/profile";

export type NotificationEventType =
  | "low_stock"
  | "new_order_request"
  | "new_dealer_application"
  | "order_ready_for_shipment"
  | "order_cancellation"
  | "stock_warehouse_problem"
  | "order_status_changed"
  | "price_review_required"
  | "invoice_issued";

export type NotificationSeverity =
  | "critical"
  | "warning"
  | "info"
  | "success"
  | "dealer";

export type AppNotification = {
  id: string;
  type: NotificationEventType;
  title: string;
  description: string;
  severity: NotificationSeverity;
  href?: string;
  timeLabel: string;
};

const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];

export const NOTIFICATION_ROLE_POLICY: Record<
  NotificationEventType,
  UserRole[]
> = {
  low_stock: [...ADMIN_ROLES, "warehouse"],
  new_order_request: [...ADMIN_ROLES, "sales"],
  new_dealer_application: [...ADMIN_ROLES],
  order_ready_for_shipment: ["shipping"],
  order_cancellation: [...ADMIN_ROLES, "sales", "warehouse"],
  stock_warehouse_problem: [...ADMIN_ROLES, "warehouse"],
  order_status_changed: [...ADMIN_ROLES, "sales", "warehouse", "shipping"],
  price_review_required: [...ADMIN_ROLES, "sales"],
  invoice_issued: [...ADMIN_ROLES, "sales"],
};

export function canRoleSeeNotification(
  role: UserRole,
  type: NotificationEventType
) {
  return NOTIFICATION_ROLE_POLICY[type].includes(role);
}

export const NOTIFICATION_LABELS: Record<NotificationEventType, string> = {
  low_stock: "Low / Critical Stock",
  new_order_request: "New Order Request",
  new_dealer_application: "New Dealer Application",
  order_ready_for_shipment: "Ready for Shipment",
  order_cancellation: "Order Cancellation",
  stock_warehouse_problem: "Stock / Warehouse Problem",
  order_status_changed: "Order Status Changed",
  price_review_required: "Price Review Required",
  invoice_issued: "Invoice Issued",
};
