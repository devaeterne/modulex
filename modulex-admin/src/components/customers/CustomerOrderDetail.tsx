"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import type {
  Customer,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderStatus,
  CustomerOrderStatusHistory,
} from "@/lib/customers/types";

const STATUSES: CustomerOrderStatus[] = [
  "draft",
  "confirmed",
  "in_preparation",
  "ready_for_shipment",
  "shipped",
  "delivered",
  "installation_scheduled",
  "installation_in_progress",
  "completed",
  "cancelled",
];

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";

function money(value: string | number | null | undefined, currency = "USD") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number.isFinite(amount) ? amount : 0
    );
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      Number.isFinite(amount) ? amount : 0
    );
  }
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: CustomerOrderStatus) {
  if (status === "completed") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "cancelled") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (["shipped", "delivered", "installation_scheduled", "installation_in_progress"].includes(status)) return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  if (["confirmed", "in_preparation", "ready_for_shipment"].includes(status)) return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function CustomerOrderDetail() {
  const params = useParams<{ id: string; orderId: string }>();
  const customerId = params.id;
  const orderId = params.orderId;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [items, setItems] = useState<CustomerOrderItem[]>([]);
  const [history, setHistory] = useState<CustomerOrderStatusHistory[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [newStatus, setNewStatus] = useState<CustomerOrderStatus>("draft");
  const [statusNote, setStatusNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);

    const [customerResult, orderResult, itemsResult, historyResult, approvalsResult] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).single(),
      supabase.from("customer_orders").select("*").eq("id", orderId).eq("customer_id", customerId).single(),
      supabase.from("customer_order_items").select("*").eq("order_id", orderId).order("line_no"),
      supabase.from("customer_order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("entity_type", "order").eq("entity_id", orderId).eq("status", "pending"),
    ]);

    const firstError = customerResult.error || orderResult.error || itemsResult.error || historyResult.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedOrder = orderResult.data as CustomerOrder;
    setCustomer(customerResult.data as Customer);
    setOrder(loadedOrder);
    setItems((itemsResult.data ?? []) as CustomerOrderItem[]);
    setHistory((historyResult.data ?? []) as CustomerOrderStatusHistory[]);
    setPendingApprovals(approvalsResult.error ? 0 : approvalsResult.count ?? 0);
    setNewStatus(loadedOrder.status);
    setIsLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { profile, error } = await getCurrentProfile();
      if (!mounted) return;
      if (error || !profile) {
        setErrorMessage(error?.message ?? "User profile could not be loaded.");
        setIsLoading(false);
        return;
      }
      if (!hasPermission(profile.role, "orders.view")) {
        setErrorMessage("You do not have permission to view customer orders.");
        setIsLoading(false);
        return;
      }
      setCanManage(hasPermission(profile.role, "orders.manage"));
      await load();
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [customerId, orderId]);

  async function updateStatus() {
    if (!order || !canManage || newStatus === order.status) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { data, error } = await supabase.rpc("set_customer_order_status", {
      p_order_id: order.id,
      p_status: newStatus,
      p_note: statusNote.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    await load();
    setStatusNote("");
    setSuccessMessage(
      data === "approval_requested"
        ? "Approval requested. The order status was not changed yet."
        : "Order status updated."
    );
    setIsSaving(false);
  }

  if (isLoading) return <Loading />;
  if (!customer || !order) return <ErrorBox>{errorMessage || "Order not found."}</ErrorBox>;

  const billing = order.billing_address_snapshot as Record<string, string | null> | null;
  const shipping = order.shipping_address_snapshot as Record<string, string | null> | null;
  const grandTotal =
    Number(order.grand_total ?? 0) > 0 || Number(order.total_amount ?? 0) === 0
      ? Number(order.grand_total ?? 0)
      : Number(order.total_amount ?? 0);
  const currency = order.currency_code || "USD";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{order.order_number}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status)}`}>{titleCase(order.status)}</span>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{customer.name} • {customer.customer_code} • {date(order.order_date)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/customers/${customer.id}/orders/${order.id}/print`} target="_blank" className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">Print Order</Link>
            <Link href={`/customers/${customer.id}`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]">Customer Card</Link>
            <Link href={`/customers/${customer.id}/orders`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]">All Customer Orders</Link>
          </div>
        </div>
      </section>

      {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
      {successMessage && <Notice tone="success">{successMessage}</Notice>}
      {pendingApprovals > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400 sm:flex-row sm:items-center sm:justify-between">
          <span>{pendingApprovals} approval request{pendingApprovals === 1 ? " is" : "s are"} pending for this order.</span>
          <Link href="/approvals" className="font-semibold underline underline-offset-2">Open Approvals</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Summary label="Grand Total" value={money(grandTotal, currency)} />
        <Summary label="Items" value={String(order.item_count)} />
        <Summary label="Price Group" value={order.price_group_name_snapshot || "—"} />
        <Summary label="Fulfillment" value={titleCase(order.fulfillment_type || "delivery")} />
        <Summary label="Payment" value={order.payment_method_name_snapshot || "—"} />
        <Summary label="Expected Delivery" value={date(order.expected_delivery_date)} />
      </div>

      {canManage && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Update Status</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[260px_1fr_auto]">
            <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as CustomerOrderStatus)} className={inputClass}>
              {STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
            </select>
            <input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional status note" className={inputClass} />
            <button disabled={isSaving || newStatus === order.status} onClick={() => void updateStatus()} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-40">{isSaving ? "Saving..." : "Update"}</button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Items</h2></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["#", "SKU", "Product", "Qty", "Unit Price", "Discount", "Total", "Source"].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{item.line_no}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{item.sku_snapshot}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{item.product_name_snapshot}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{Number(item.quantity)}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{money(item.unit_price, currency)}</td>
                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{Number(item.discount_percent).toFixed(1)}%</td>
                  <td className="px-4 py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{money(item.line_total, currency)}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">{titleCase(item.price_source)}</span></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">No order items found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <div className="grid gap-5 md:grid-cols-2">
            <AddressCard title="Billing Address" data={billing} />
            <AddressCard title="Shipping Address" data={shipping} />
          </div>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Notes & References</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Info label="Customer Reference" value={order.customer_reference} />
              <Info label="Customer Notes" value={order.customer_notes} />
              <Info label="Internal Notes" value={order.internal_notes} />
            </div>
          </section>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Totals & Payment</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Row label="Subtotal" value={money(order.subtotal, currency)} />
              <Row label="Order Discount" value={`-${money(order.discount_amount, currency)}`} />
              <Row label={`Tax (${Number(order.tax_rate).toFixed(1)}%)`} value={money(order.tax_amount, currency)} />
              <Row label="Order Total" value={money(order.total_amount, currency)} />
              <Row label="Payment Method" value={order.payment_method_name_snapshot || "—"} />
              {Number(order.payment_commission_amount ?? 0) > 0 && <Row label={`Commission (${Number(order.payment_commission_percent).toFixed(2)}%)`} value={money(order.payment_commission_amount, currency)} />}
              <div className="border-t border-gray-200 pt-3 dark:border-gray-800"><Row label="Grand Total" value={money(grandTotal, currency)} strong /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Status Timeline</h2>
            <div className="mt-4 space-y-4">
              {history.map((entry) => (
                <div key={entry.id} className="border-l-2 border-gray-200 pl-4 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{entry.from_status ? `${titleCase(entry.from_status)} → ${titleCase(entry.to_status)}` : titleCase(entry.to_status)}</p>
                  {entry.note && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{entry.note}</p>}
                  <p className="mt-1 text-xs text-gray-400">{dateTime(entry.created_at)}</p>
                </div>
              ))}
              {history.length === 0 && <p className="text-sm text-gray-500">No status history yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function AddressCard({ title, data }: { title: string; data: Record<string, string | null> | null }) {
  const lines = data
    ? [data.company_name, data.contact_name, data.address_line_1, data.address_line_2, [data.postal_code, data.city].filter(Boolean).join(" "), data.state_region, data.country_code, data.phone].filter((value) => typeof value === "string" && value.trim()) as string[]
    : [];
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2><div className="mt-3">{lines.length ? lines.map((line, index) => <p key={`${line}-${index}`} className="text-sm text-gray-500 dark:text-gray-400">{line}</p>) : <p className="text-sm text-gray-500">—</p>}</div></section>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-xs text-gray-500 dark:text-gray-400">{label}</p><p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs font-medium uppercase text-gray-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{value || "—"}</p></div>;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}><span>{label}</span><span>{value}</span></div>;
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"}`}>{children}</div>;
}

function Loading() {
  return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /><p className="text-sm text-gray-500 dark:text-gray-400">Loading order...</p></div></div>;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{children}</div>;
}
