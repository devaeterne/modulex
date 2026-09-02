import { hasPermission, type Permission, type RoleInput } from "@/lib/auth/permissions";

export type NotificationEventType =
  | "low_stock"
  | "new_order_request"
  | "new_store_lead"
  | "new_dealer_application"
  | "order_ready_for_shipment"
  | "order_cancellation"
  | "stock_warehouse_problem"
  | "order_status_changed"
  | "price_review_required"
  | "invoice_issued"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "request_created"
  | "request_updated"
  | "request_completed";

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

const NOTIFICATION_PERMISSION_POLICY: Record<
  NotificationEventType,
  Permission
> = {
  low_stock: "inventory.manage",
  new_order_request: "orders.view",
  new_store_lead: "leads.view",
  new_dealer_application: "leads.view",
  order_ready_for_shipment: "shipments.manage",
  order_cancellation: "orders.view",
  stock_warehouse_problem: "inventory.manage",
  order_status_changed: "orders.view",
  price_review_required: "pricing.view",
  invoice_issued: "invoices.view",
  approval_requested: "approvals.review",
  approval_approved: "approvals.view",
  approval_rejected: "approvals.view",
  request_created: "requests.manage",
  request_updated: "requests.view",
  request_completed: "requests.view",
};

export function canRoleSeeNotification(
  roles: RoleInput,
  type: NotificationEventType
) {
  return hasPermission(roles, NOTIFICATION_PERMISSION_POLICY[type]);
}

export const NOTIFICATION_LABELS: Record<NotificationEventType, string> = {
  low_stock: "Low / Critical Stock",
  new_order_request: "New Order Request",
  new_store_lead: "New Store Lead",
  new_dealer_application: "New Dealer Application",
  order_ready_for_shipment: "Ready for Shipment",
  order_cancellation: "Order Cancellation",
  stock_warehouse_problem: "Stock / Warehouse Problem",
  order_status_changed: "Order Status Changed",
  price_review_required: "Price Review Required",
  invoice_issued: "Invoice Issued",
  approval_requested: "Approval Requested",
  approval_approved: "Approval Approved",
  approval_rejected: "Approval Rejected",
  request_created: "New Request",
  request_updated: "Request Updated",
  request_completed: "Request Completed",
};
