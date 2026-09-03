"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import SummaryRow from "@/components/common/SummaryRow";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";
import CountertopLineDetails from "@/components/customers/CountertopLineDetails";
import ServiceLineDetails from "@/components/customers/ServiceLineDetails";
import FormHint from "@/components/form/FormHint";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { loadOrderDetail, pricingModelLabel, setCustomerOrderStatus } from "@/lib/customers/order-domain";
import { supabase } from "@/lib/supabase/client";
import type {
  CountertopLineSummary,
  CountertopOrderContext,
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

type StatusActor = { id: string; full_name: string | null; email: string | null };

function money(value: string | number | null | undefined, currency = "USD") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0);
  }
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusColor(status: CustomerOrderStatus): "success" | "error" | "info" | "warning" | "light" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "error";
  if (["shipped", "delivered", "installation_scheduled", "installation_in_progress"].includes(status)) return "info";
  if (["confirmed", "in_preparation", "ready_for_shipment"].includes(status)) return "warning";
  return "light";
}

function orderDiscount(value: string | number | null | undefined, currency: string) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return money(0, currency);
  return `-${money(Math.abs(amount), currency)}`;
}

function describeOrderStatusActivity(entry: CustomerOrderStatusHistory) {
  if (!entry.from_status) return `Order created with ${titleCase(entry.to_status)} status.`;
  return `Order status changed from ${titleCase(entry.from_status)} to ${titleCase(entry.to_status)}.`;
}

function orderStatusActor(entry: CustomerOrderStatusHistory, actors: Map<string, StatusActor>) {
  if (!entry.changed_by) return "System";
  const actor = actors.get(entry.changed_by);
  return actor?.full_name || actor?.email || "Modulex user";
}

function AddressCard({ title, data }: { title: string; data: Record<string, string | null> | null }) {
  const lines = data
    ? [data.company_name, data.contact_name, data.address_line_1, data.address_line_2, [data.postal_code, data.city].filter(Boolean).join(" "), data.state_region, data.country_code, data.phone]
        .filter((value) => typeof value === "string" && value.trim()) as string[]
    : [];

  return (
    <ComponentCard title={title}>
      <div className={`space-y-1 ${ADMIN_TEXT_STYLES.body}`}>
        {lines.length ? lines.map((line, index) => <p key={`${line}-${index}`} className="text-sm">{line}</p>) : <FormHint>—</FormHint>}
      </div>
    </ComponentCard>
  );
}

function InfoBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>{label}</p>
      <p className={`mt-1 whitespace-pre-wrap text-sm ${ADMIN_TEXT_STYLES.body}`}>{value || "—"}</p>
    </div>
  );
}

export default function CustomerOrderDetail() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const customerId = params.id;
  const orderId = params.orderId;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [items, setItems] = useState<CustomerOrderItem[]>([]);
  const [history, setHistory] = useState<CustomerOrderStatusHistory[]>([]);
  const [statusActors, setStatusActors] = useState<StatusActor[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [contextCanManageCountertop, setContextCanManageCountertop] = useState(false);
  const [countertopItems, setCountertopItems] = useState<CountertopOrderContext[]>([]);
  const [countertopSummaries, setCountertopSummaries] = useState<CountertopLineSummary[]>([]);
  const [newStatus, setNewStatus] = useState<CustomerOrderStatus>("draft");
  const [statusNote, setStatusNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countertopContext, setCountertopContext] = useState<CountertopOrderContext | null>(null);

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const context = await loadOrderDetail(customerId, orderId);
      const actorIds = Array.from(new Set(context.history.map((entry) => entry.changed_by).filter((value): value is string => Boolean(value))));
      let nextActors: StatusActor[] = [];
      if (actorIds.length > 0) {
        const actorsResult = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
        if (!actorsResult.error) nextActors = (actorsResult.data ?? []) as StatusActor[];
      }
      setCustomer(context.customer);
      setOrder(context.order);
      setItems(context.items);
      setHistory(context.history);
      setStatusActors(nextActors);
      setPendingApprovals(context.pendingApprovals);
      setCanManage(context.canManage);
      setContextCanManageCountertop(context.canManageCountertop);
      setCountertopItems(context.countertopItems);
      setCountertopSummaries(context.countertopSummaries);
      if (countertopContext && !context.countertopItems.some((item) => item.orderItemId === countertopContext.orderItemId)) setCountertopContext(null);
      setNewStatus(context.order.status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load order detail.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [customerId, orderId]);

  async function updateStatus() {
    if (!order || !canManage || newStatus === order.status) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await setCustomerOrderStatus({ orderId: order.id, status: newStatus, note: statusNote });
      await load();
      setStatusNote("");
      setSuccessMessage(result === "approval_requested" ? "Approval requested. The order status was not changed yet." : "Order status updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update order status.");
    } finally {
      setIsSaving(false);
    }
  }

  const countertopItemsById = useMemo(() => new Map(countertopItems.map((item) => [item.orderItemId, item])), [countertopItems]);
  const summariesByItemId = useMemo(() => new Map(countertopSummaries.map((summary) => [summary.orderItemId, summary])), [countertopSummaries]);
  const statusActorsById = useMemo(() => new Map(statusActors.map((actor) => [actor.id, actor])), [statusActors]);

  if (isLoading) return <ComponentCard title="Order Detail" desc="Loading order, pricing and fulfillment context…"><FormHint>Loading order…</FormHint></ComponentCard>;
  if (!customer || !order) {
    return (
      <div className="space-y-3">
        <Alert variant="error" title="Unable to load order" message={errorMessage || "Order not found."} />
        <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const billing = order.billing_address_snapshot as Record<string, string | null> | null;
  const shipping = order.shipping_address_snapshot as Record<string, string | null> | null;
  const grandTotal = Number(order.grand_total ?? 0) > 0 || Number(order.total_amount ?? 0) === 0 ? Number(order.grand_total ?? 0) : Number(order.total_amount ?? 0);
  const currency = order.currency_code || "USD";

  return (
    <div className="space-y-5">
      <ComponentCard
        title={order.order_number}
        desc={`${customer.name} · ${customer.customer_code} · ${date(order.order_date)}`}
        headerAction={(
          <div className="flex flex-wrap justify-end gap-2">
            <Badge color={statusColor(order.status)}>{titleCase(order.status)}</Badge>
            <Button size="sm" onClick={() => window.open(`/customers/${customer.id}/orders/${order.id}/print`, "_blank", "noopener,noreferrer")}>Print Order</Button>
            <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${customer.id}`)}>Customer Card</Button>
            <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${customer.id}/orders`)}>All Customer Orders</Button>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SummaryRow label="Grand Total" value={money(grandTotal, currency)} strong />
          <SummaryRow label="Items" value={String(order.item_count)} />
          <SummaryRow label="Price Group" value={order.price_group_name_snapshot || "—"} />
          <SummaryRow label="Fulfillment" value={titleCase(order.fulfillment_type || "delivery")} />
          <SummaryRow label="Payment" value={order.payment_method_name_snapshot || "—"} />
          <SummaryRow label="Expected Delivery" value={date(order.expected_delivery_date)} />
        </div>
      </ComponentCard>

      {errorMessage ? <Alert variant="error" title="Order action failed" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Order updated" message={successMessage} /> : null}
      {pendingApprovals > 0 ? (
        <ComponentCard title="Approval Pending" desc={`${pendingApprovals} approval request${pendingApprovals === 1 ? " is" : "s are"} pending for this order.`} headerAction={<Button size="sm" variant="outline" onClick={() => router.push("/approvals")}>Open Approvals</Button>} collapsed><div /></ComponentCard>
      ) : null}

      {canManage ? (
        <ComponentCard title="Update Status" desc="Use the canonical order status workflow; approvals remain server-authoritative.">
          <div className="grid gap-3 md:grid-cols-[260px_1fr_auto]">
            <Select options={STATUSES.map((status) => ({ value: status, label: titleCase(status) }))} value={newStatus} onChange={(value) => setNewStatus(value as CustomerOrderStatus)} />
            <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional status note" />
            <Button disabled={isSaving || newStatus === order.status} onClick={() => void updateStatus()}>{isSaving ? "Saving…" : "Update"}</Button>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Order Items" desc="Product, pricing, Countertop and Service details are historical order snapshots.">
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin"><TableRow>{["#", "SKU", "Product", "Type / UOM", "Pricing Route", "Qty", "Unit Price", "Discount", "Total", "Source", "Actions"].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={11}>No order items found.</TableStateRow> : items.map((item) => {
                const countertopSummary = summariesByItemId.get(item.id);
                return (
                  <TableRow key={item.id}>
                    <TableCell variant="admin">{item.line_no}</TableCell>
                    <TableCell variant="admin" className="font-semibold">{item.sku_snapshot}</TableCell>
                    <TableCell variant="admin" className="min-w-[360px]">
                      <span>{item.product_name_snapshot}</span>
                      <CountertopLineDetails summary={countertopSummary} />
                      <ServiceLineDetails lineNote={item.line_note} />
                    </TableCell>
                    <TableCell variant="admin">{item.product_type_name_snapshot || "Historical"} · {item.uom_name_snapshot || item.uom_code_snapshot || "—"}</TableCell>
                    <TableCell variant="admin"><Badge size="sm" color={item.pricing_model_snapshot === "price_group" ? "success" : item.pricing_model_snapshot ? "warning" : "light"}>{pricingModelLabel(item.pricing_model_snapshot)}</Badge></TableCell>
                    <TableCell variant="admin">{Number(item.quantity)}</TableCell>
                    <TableCell variant="admin">{money(item.unit_price, currency)}</TableCell>
                    <TableCell variant="admin">{Number(item.discount_percent).toFixed(1)}%</TableCell>
                    <TableCell variant="admin" className="font-semibold">{money(item.line_total, currency)}</TableCell>
                    <TableCell variant="admin"><Badge size="sm" color="light">{titleCase(item.price_source)}</Badge></TableCell>
                    <TableCell variant="admin">{order.status === "draft" && contextCanManageCountertop && countertopItemsById.has(item.id) ? <Button size="sm" variant="outline" onClick={() => setCountertopContext(countertopItemsById.get(item.id) ?? null)}>Configure Countertop</Button> : <FormHint>—</FormHint>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      {countertopContext && order.status === "draft" && contextCanManageCountertop ? (
        <CountertopConfigurator
          orderItemId={countertopContext.orderItemId}
          orderContext={countertopContext}
          onClose={() => setCountertopContext(null)}
          onAttached={() => {
            setSuccessMessage("Countertop snapshot saved and order refreshed.");
            void load();
          }}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <AddressCard title="Billing Address" data={billing} />
        <AddressCard title="Shipping Address" data={shipping} />
        <ComponentCard title="Totals & Payment">
          <div className="space-y-3">
            <SummaryRow label="Subtotal" value={money(order.subtotal, currency)} />
            <SummaryRow label="Order Discount" value={orderDiscount(order.discount_amount, currency)} />
            <SummaryRow label={`Tax (${Number(order.tax_rate).toFixed(1)}%)`} value={money(order.tax_amount, currency)} />
            <SummaryRow label="Order Total" value={money(order.total_amount, currency)} />
            <SummaryRow label="Payment Method" value={order.payment_method_name_snapshot || "—"} />
            {Number(order.payment_commission_amount ?? 0) > 0 ? <SummaryRow label={`Commission (${Number(order.payment_commission_percent).toFixed(2)}%)`} value={money(order.payment_commission_amount, currency)} /> : null}
            <SummaryRow label="Grand Total" value={money(grandTotal, currency)} strong divider />
          </div>
        </ComponentCard>
      </div>

      <ComponentCard title="Notes & References">
        <div className="grid gap-4 md:grid-cols-3">
          <InfoBlock label="Customer Reference" value={order.customer_reference} />
          <InfoBlock label="Customer Notes" value={order.customer_notes} />
          <InfoBlock label="Internal Notes" value={order.internal_notes} />
        </div>
      </ComponentCard>

      <ComponentCard title="Status Timeline" desc="A readable Order lifecycle history, newest first.">
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">When</TableCell>
                <TableCell isHeader variant="admin">Activity</TableCell>
                <TableCell isHeader variant="admin">By</TableCell>
                <TableCell isHeader variant="admin">Note</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {history.length === 0 ? <TableStateRow colSpan={4}>No status history yet.</TableStateRow> : history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell variant="admin">{dateTime(entry.created_at)}</TableCell>
                  <TableCell variant="admin">
                    <div className="space-y-1">
                      <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{describeOrderStatusActivity(entry)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.from_status ? <Badge size="sm" color={statusColor(entry.from_status)}>{titleCase(entry.from_status)}</Badge> : <Badge size="sm" color="light">Created</Badge>}
                        <span aria-hidden="true">→</span>
                        <Badge size="sm" color={statusColor(entry.to_status)}>{titleCase(entry.to_status)}</Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell variant="admin">{orderStatusActor(entry, statusActorsById)}</TableCell>
                  <TableCell variant="admin">{entry.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>
    </div>
  );
}
