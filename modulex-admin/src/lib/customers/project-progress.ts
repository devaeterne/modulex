import { supabase } from "@/lib/supabase/client";
import type { CustomerProject, CustomerProjectOrder } from "@/lib/customers/project-domain";

export const PROJECT_PROGRESS_ACTIVITY_LIMIT = 12;
export const PROJECT_PROGRESS_INVOICE_LIMIT = 200;
const PROJECT_PROGRESS_ACTOR_LIMIT = 50;

const DELIVERY_COMPLETE_STATUSES = new Set(["delivered", "installation_scheduled", "installation_in_progress", "completed"]);
const ORDER_CONFIRMED_STATUSES = new Set([
  "confirmed",
  "in_preparation",
  "ready_for_shipment",
  "shipped",
  "delivered",
  "installation_scheduled",
  "installation_in_progress",
  "completed",
]);

type OrderStatusHistoryRow = {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string | null;
  created_at: string;
};

type OrderRevisionRow = {
  id: string;
  order_id: string;
  revision_number: number;
  reason: string | null;
  revised_by: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  order_id: string | null;
  invoice_number: string;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type ActorRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type ProjectProgressActivityKind = "order" | "revision" | "invoice";

export type ProjectProgressActivity = {
  id: string;
  kind: ProjectProgressActivityKind;
  title: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

export type ProjectProgressData = {
  orders: {
    active: number;
    confirmedOrLater: number;
  };
  delivery: {
    completed: number;
    total: number;
  };
  installation: {
    completed: number;
    total: number;
  };
  commercial: {
    invoicedOrders: number;
    activeOrders: number;
    paidInvoices: number;
    invoices: number;
  };
  activities: ProjectProgressActivity[];
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function activeProjectOrders(project: CustomerProject): CustomerProjectOrder[] {
  return (project.orders ?? []).filter((order) => order.status !== "cancelled");
}

function actorName(actorId: string | null, actors: Map<string, ActorRow>) {
  if (!actorId) return "System";
  const actor = actors.get(actorId);
  return actor?.full_name || actor?.email || "Modulex user";
}

export async function loadProjectProgress(project: CustomerProject): Promise<ProjectProgressData> {
  const activeOrders = activeProjectOrders(project);
  const activeOrderIds = activeOrders.map((order) => order.id);
  const deliveryOrders = activeOrders.filter((order) => order.fulfillment_type !== "pickup");
  const installationOrders = activeOrders.filter((order) => order.fulfillment_type === "delivery_installation");

  const base: ProjectProgressData = {
    orders: {
      active: activeOrders.length,
      confirmedOrLater: activeOrders.filter((order) => ORDER_CONFIRMED_STATUSES.has(order.status)).length,
    },
    delivery: {
      completed: deliveryOrders.filter((order) => DELIVERY_COMPLETE_STATUSES.has(order.status)).length,
      total: deliveryOrders.length,
    },
    installation: {
      completed: installationOrders.filter((order) => order.status === "completed").length,
      total: installationOrders.length,
    },
    commercial: {
      invoicedOrders: 0,
      activeOrders: activeOrders.length,
      paidInvoices: 0,
      invoices: 0,
    },
    activities: [],
  };

  if (activeOrderIds.length === 0) return base;

  const [historyResult, revisionsResult, invoicesResult] = await Promise.all([
    supabase
      .from("customer_order_status_history")
      .select("id, order_id, from_status, to_status, note, changed_by, created_at")
      .in("order_id", activeOrderIds)
      .order("created_at", { ascending: false })
      .limit(PROJECT_PROGRESS_ACTIVITY_LIMIT),
    supabase
      .from("customer_order_revisions")
      .select("id, order_id, revision_number, reason, revised_by, created_at")
      .in("order_id", activeOrderIds)
      .order("created_at", { ascending: false })
      .limit(PROJECT_PROGRESS_ACTIVITY_LIMIT),
    supabase
      .from("customer_invoices")
      .select("id, order_id, invoice_number, status, issued_at, paid_at, created_at, updated_at")
      .in("order_id", activeOrderIds)
      .neq("status", "void")
      .order("updated_at", { ascending: false })
      .limit(PROJECT_PROGRESS_INVOICE_LIMIT),
  ]);

  const firstError = historyResult.error || revisionsResult.error || invoicesResult.error;
  if (firstError) throw firstError;

  const historyRows = (historyResult.data ?? []) as OrderStatusHistoryRow[];
  const revisionRows = (revisionsResult.data ?? []) as OrderRevisionRow[];
  const invoiceRows = (invoicesResult.data ?? []) as InvoiceRow[];
  const actorIds = Array.from(new Set([
    ...historyRows.map((row) => row.changed_by),
    ...revisionRows.map((row) => row.revised_by),
  ].filter((value): value is string => Boolean(value)))).slice(0, PROJECT_PROGRESS_ACTOR_LIMIT);

  const actors = new Map<string, ActorRow>();
  if (actorIds.length > 0) {
    const actorsResult = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds)
      .limit(PROJECT_PROGRESS_ACTOR_LIMIT);
    if (!actorsResult.error) {
      for (const actor of (actorsResult.data ?? []) as ActorRow[]) actors.set(actor.id, actor);
    }
  }

  const ordersById = new Map(activeOrders.map((order) => [order.id, order]));
  const invoicedOrderIds = new Set(invoiceRows.map((invoice) => invoice.order_id).filter((value): value is string => Boolean(value)));

  const statusActivities: ProjectProgressActivity[] = historyRows.map((row) => {
    const order = ordersById.get(row.order_id);
    const prefix = order?.order_number || "Order";
    const title = row.from_status
      ? `${prefix} status changed from ${statusLabel(row.from_status)} to ${statusLabel(row.to_status)}.`
      : `${prefix} entered ${statusLabel(row.to_status)} status.`;
    return {
      id: `order-status-${row.id}`,
      kind: "order",
      title,
      note: row.note,
      actorName: actorName(row.changed_by, actors),
      createdAt: row.created_at,
    };
  });

  const revisionActivities: ProjectProgressActivity[] = revisionRows.map((row) => {
    const order = ordersById.get(row.order_id);
    return {
      id: `order-revision-${row.id}`,
      kind: "revision",
      title: `${order?.order_number || "Order"} revised — Revision ${row.revision_number}.`,
      note: row.reason,
      actorName: actorName(row.revised_by, actors),
      createdAt: row.created_at,
    };
  });

  const invoiceActivities: ProjectProgressActivity[] = invoiceRows.slice(0, PROJECT_PROGRESS_ACTIVITY_LIMIT).map((invoice) => {
    const order = invoice.order_id ? ordersById.get(invoice.order_id) : null;
    const orderLabel = order ? ` for ${order.order_number}` : "";
    const state = statusLabel(invoice.status);
    return {
      id: `invoice-${invoice.id}`,
      kind: "invoice",
      title: `${invoice.invoice_number}${orderLabel} — ${state}.`,
      note: null,
      actorName: null,
      createdAt: invoice.paid_at || invoice.issued_at || invoice.updated_at || invoice.created_at,
    };
  });

  return {
    ...base,
    commercial: {
      invoicedOrders: invoicedOrderIds.size,
      activeOrders: activeOrders.length,
      paidInvoices: invoiceRows.filter((invoice) => invoice.status === "paid").length,
      invoices: invoiceRows.length,
    },
    activities: [...statusActivities, ...revisionActivities, ...invoiceActivities]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, PROJECT_PROGRESS_ACTIVITY_LIMIT),
  };
}
