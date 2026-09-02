"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CommercialDocument from "@/components/documents/CommercialDocument";
import type { Customer, CustomerInvoice, CustomerInvoiceItem } from "@/lib/customers/types";
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
    snapshot.company_name,
    snapshot.contact_name,
    snapshot.address_line_1,
    snapshot.address_line_2,
    [snapshot.city, snapshot.state_region, snapshot.postal_code].filter(Boolean).join(", "),
    snapshot.country_code,
    snapshot.phone,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

export default function CustomerInvoicePrint() {
  const params = useParams<{ id: string; invoiceId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoice, setInvoice] = useState<CustomerInvoice | null>(null);
  const [items, setItems] = useState<CustomerInvoiceItem[]>([]);
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [customerResult, invoiceResult, itemsResult, settingsResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", params.id).single(),
        supabase.from("customer_invoices").select("*").eq("id", params.invoiceId).eq("customer_id", params.id).single(),
        supabase.from("customer_invoice_items").select("*").eq("invoice_id", params.invoiceId).order("line_no"),
        supabase.from("general_settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      const firstError = customerResult.error || invoiceResult.error || itemsResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setCustomer(customerResult.data as Customer);
      setInvoice(invoiceResult.data as CustomerInvoice);
      setItems((itemsResult.data ?? []) as CustomerInvoiceItem[]);
      if (!settingsResult.error && settingsResult.data) setSettings(settingsResult.data as GeneralSettings);
      setIsLoading(false);
    }
    void load();
  }, [params.id, params.invoiceId]);

  if (isLoading) return <div className="min-h-screen bg-gray-100 p-10 text-center text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Preparing printable invoice...</div>;
  if (!customer || !invoice) return <div className="min-h-screen bg-gray-100 p-10 text-center text-sm text-error-600 dark:bg-gray-950 dark:text-error-400">{errorMessage || "Invoice not found."}</div>;

  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const currency = invoice.currency_code || settings.default_currency || "USD";
  const formatMoney = (value: string | number | null | undefined) => money(value, currency, locale);
  const formatDate = (value: string | null | undefined) => date(value, locale, timezone);
  const balance = Math.max(Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0), 0);
  const billTo = [
    customer.name,
    customer.legal_name && customer.legal_name !== customer.name ? customer.legal_name : null,
    ...snapshotLines(invoice.billing_address_snapshot),
    customer.tax_number ? `Tax / VAT: ${customer.tax_number}` : null,
  ].filter((value): value is string => Boolean(value));

  const document: CommercialDocumentModel = {
    kind: "invoice",
    title: settings.invoice_document_title || "Invoice",
    number: invoice.invoice_number,
    fileName: `Invoice-${invoice.invoice_number.replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`,
    meta: [
      { label: "Invoice Date", value: formatDate(invoice.invoice_date) },
      { label: "Due Date", value: formatDate(invoice.due_date) },
      { label: "Status", value: titleCase(invoice.status) },
    ],
    billTo: { title: "Bill To", lines: billTo },
    information: [
      { label: "Order", value: invoice.order_number_snapshot || "—" },
      { label: "Reference", value: invoice.customer_reference || "—" },
      { label: "Currency", value: currency },
    ],
    lines: items.map((item) => ({
      lineNo: String(item.line_no),
      sku: item.sku_snapshot,
      description: item.product_name_snapshot,
      detail: item.line_note,
      quantity: String(Number(item.quantity)),
      unitPrice: formatMoney(item.unit_price),
      discount: `${Number(item.discount_percent).toFixed(2)}%`,
      total: formatMoney(item.line_total),
    })),
    totals: [
      { label: "Subtotal", value: formatMoney(invoice.subtotal) },
      { label: "Discount", value: `-${formatMoney(invoice.discount_amount)}` },
      { label: `Tax (${Number(invoice.tax_rate).toFixed(2)}%)`, value: formatMoney(invoice.tax_amount) },
      ...(Number(invoice.payment_commission_amount ?? 0) > 0 ? [{ label: `Payment Commission (${Number(invoice.payment_commission_percent).toFixed(2)}%)`, value: formatMoney(invoice.payment_commission_amount) }] : []),
      { label: "Total", value: formatMoney(invoice.total_amount), strong: true },
      { label: "Paid", value: formatMoney(invoice.paid_amount) },
      { label: "Balance Due", value: formatMoney(balance), strong: true },
    ],
    notes: invoice.notes,
    footerNote: settings.invoice_footer_note,
  };

  return <CommercialDocument document={document} settings={settings} />;
}
