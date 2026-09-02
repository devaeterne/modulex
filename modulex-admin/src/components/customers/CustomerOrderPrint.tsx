"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CommercialDocument from "@/components/documents/CommercialDocument";
import { ADMIN_DOCUMENT_STYLES } from "@/components/ui/theme/adminTheme";
import { formatCountertopPrintDetail, loadCountertopLineSummaries } from "@/lib/customers/countertop-summary";
import type { CountertopLineSummary, Customer, CustomerOrder, CustomerOrderItem } from "@/lib/customers/types";
import type { CommercialDocument as CommercialDocumentModel } from "@/lib/documents/types";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";
import { supabase } from "@/lib/supabase/client";

function money(value: string | number | null | undefined, currency: string, locale: string) {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  }
}

function date(value: string | null | undefined, locale: string, timezone: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: timezone }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function snapshotLines(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return ["—"];
  return [
    snapshot.address_name,
    snapshot.company_name,
    snapshot.contact_name,
    snapshot.address_line_1,
    snapshot.address_line_2,
    [snapshot.city, snapshot.state_region, snapshot.postal_code].filter(Boolean).join(", "),
    snapshot.country_code,
    snapshot.phone,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

function customerLines(customer: Customer) {
  return [
    customer.name,
    customer.legal_name && customer.legal_name !== customer.name ? customer.legal_name : null,
    customer.customer_code,
    customer.tax_number ? `Tax / VAT: ${customer.tax_number}` : null,
    customer.email,
    customer.phone,
  ].filter((value): value is string => Boolean(value));
}

function lineDetail(summary: CountertopLineSummary | undefined, lineNote: string | null | undefined) {
  const values = [formatCountertopPrintDetail(summary), lineNote?.trim() || null].filter((value): value is string => Boolean(value));
  return values.length ? values.join("\n") : null;
}

export default function CustomerOrderPrint() {
  const params = useParams<{ id: string; orderId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [items, setItems] = useState<CustomerOrderItem[]>([]);
  const [countertopSummaries, setCountertopSummaries] = useState<CountertopLineSummary[]>([]);
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [customerResult, orderResult, itemsResult, settingsResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", params.id).single(),
        supabase.from("customer_orders").select("*").eq("id", params.orderId).eq("customer_id", params.id).single(),
        supabase.from("customer_order_items").select("*").eq("order_id", params.orderId).order("line_no"),
        supabase.from("general_settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      const firstError = customerResult.error || orderResult.error || itemsResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const itemRows = (itemsResult.data ?? []) as CustomerOrderItem[];
      try {
        setCountertopSummaries(await loadCountertopLineSummaries(itemRows.map((item) => item.id)));
      } catch {
        setCountertopSummaries([]);
      }

      setCustomer(customerResult.data as Customer);
      setOrder(orderResult.data as CustomerOrder);
      setItems(itemRows);
      if (!settingsResult.error && settingsResult.data) setSettings(settingsResult.data as GeneralSettings);
      setIsLoading(false);
    }
    void load();
  }, [params.id, params.orderId]);

  if (isLoading) return <div className={`min-h-screen p-10 text-center text-sm ${ADMIN_DOCUMENT_STYLES.loading}`}>Preparing printable order...</div>;
  if (!customer || !order) return <div className={`min-h-screen p-10 text-center text-sm ${ADMIN_DOCUMENT_STYLES.loadError}`}>{errorMessage || "Order not found."}</div>;

  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const currency = order.currency_code || settings.default_currency || "USD";
  const formatMoney = (value: string | number | null | undefined) => money(value, currency, locale);
  const formatDate = (value: string | null | undefined) => date(value, locale, timezone);
  const grandTotal = Number(order.grand_total ?? order.total_amount ?? 0);
  const summariesByItemId = new Map(countertopSummaries.map((summary) => [summary.orderItemId, summary]));

  const document: CommercialDocumentModel = {
    kind: "order",
    title: settings.order_document_title || "Sales Order / Order Confirmation",
    number: order.order_number,
    fileName: `Order-${order.order_number.replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`,
    meta: [
      { label: "Order Date", value: formatDate(order.order_date) },
      { label: "Status", value: titleCase(order.status) },
      ...(order.expected_delivery_date ? [{ label: "Expected Delivery", value: formatDate(order.expected_delivery_date) }] : []),
    ],
    billTo: { title: "Customer", lines: customerLines(customer) },
    shipTo: { title: "Shipping Address", lines: snapshotLines(order.shipping_address_snapshot) },
    information: [
      { label: "Billing Address", value: snapshotLines(order.billing_address_snapshot).join(" · ") },
      { label: "Payment", value: order.payment_method_name_snapshot || "—" },
      { label: "Currency", value: currency },
      ...(Number(order.payment_commission_percent ?? 0) > 0 ? [{ label: "Payment Commission", value: `${Number(order.payment_commission_percent).toFixed(2)}%` }] : []),
      ...(order.customer_reference ? [{ label: "Reference", value: order.customer_reference }] : []),
    ],
    lines: items.map((item) => ({
      lineNo: String(item.line_no),
      sku: item.sku_snapshot,
      description: item.product_name_snapshot,
      detail: lineDetail(summariesByItemId.get(item.id), item.line_note),
      quantity: String(Number(item.quantity)),
      unitPrice: formatMoney(item.unit_price),
      discount: `${Number(item.discount_percent).toFixed(1)}%`,
      total: formatMoney(item.line_total),
    })),
    totals: [
      { label: "Subtotal", value: formatMoney(order.subtotal) },
      { label: "Order Discount", value: `-${formatMoney(order.discount_amount)}` },
      { label: `Tax (${Number(order.tax_rate).toFixed(1)}%)`, value: formatMoney(order.tax_amount) },
      { label: "Order Total", value: formatMoney(order.total_amount) },
      ...(Number(order.payment_commission_amount ?? 0) > 0 ? [{ label: `${order.payment_method_name_snapshot || "Payment"} Commission`, value: formatMoney(order.payment_commission_amount) }] : []),
      { label: "Grand Total", value: formatMoney(grandTotal), strong: true },
    ],
    notes: order.customer_notes,
    footerNote: settings.order_footer_note,
    signatureLabels: ["Customer Signature", "Authorized Signature"],
  };

  return <CommercialDocument document={document} settings={settings} />;
}
