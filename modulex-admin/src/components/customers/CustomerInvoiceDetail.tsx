"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { Customer, CustomerInvoice, CustomerInvoiceItem, CustomerInvoiceStatus } from "@/lib/customers/types";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";

function money(value: string | number | null | undefined, currency = "USD", locale = "en-US") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0);
  }
}

function date(value: string | null | undefined, locale = "en-US", timezone = "UTC") {
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

function badge(status: CustomerInvoiceStatus) {
  if (status === "paid") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "overdue") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "issued") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  if (status === "partially_paid") return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function addressLines(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return [];
  return [
    snapshot.company_name,
    snapshot.contact_name,
    snapshot.address_line_1,
    snapshot.address_line_2,
    [snapshot.postal_code, snapshot.city].filter(Boolean).join(" "),
    snapshot.state_region,
    snapshot.country_code,
    snapshot.phone,
  ].filter((value) => typeof value === "string" && value.trim()) as string[];
}

export default function CustomerInvoiceDetail() {
  const params = useParams<{ id: string; invoiceId: string }>();
  const [invoice, setInvoice] = useState<CustomerInvoice | null>(null);
  const [items, setItems] = useState<CustomerInvoiceItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [paidAmount, setPaidAmount] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);

    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError) {
      setErrorMessage(profileError.message);
      setIsLoading(false);
      return;
    }
    if (!["super_admin", "admin", "sales"].includes(profile?.role ?? "")) {
      setErrorMessage("You do not have access to customer invoices.");
      setIsLoading(false);
      return;
    }

    const [invoiceResult, itemsResult, customerResult, settingsResult] = await Promise.all([
      supabase.from("customer_invoices").select("*").eq("id", params.invoiceId).eq("customer_id", params.id).single(),
      supabase.from("customer_invoice_items").select("*").eq("invoice_id", params.invoiceId).order("line_no"),
      supabase.from("customers").select("*").eq("id", params.id).single(),
      supabase.from("general_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    const firstError = invoiceResult.error || itemsResult.error || customerResult.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedInvoice = invoiceResult.data as CustomerInvoice;
    setInvoice(loadedInvoice);
    setItems((itemsResult.data ?? []) as CustomerInvoiceItem[]);
    setCustomer(customerResult.data as Customer);
    if (!settingsResult.error && settingsResult.data) setSettings(settingsResult.data as GeneralSettings);
    setPaidAmount(String(Number(loadedInvoice.paid_amount ?? 0)));
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [params.id, params.invoiceId]);

  const balance = useMemo(() => {
    if (!invoice) return 0;
    return Math.max(Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0), 0);
  }, [invoice]);

  async function updateState(status?: CustomerInvoiceStatus, explicitPaid?: number) {
    if (!invoice || isSaving) return;
    setErrorMessage(null);
    setIsSaving(true);

    const amount = explicitPaid ?? (paidAmount.trim() ? Number(paidAmount) : null);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > Number(invoice.total_amount))) {
      setErrorMessage("Paid amount must be between zero and invoice total.");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase.rpc("update_customer_invoice_state", {
      p_invoice_id: invoice.id,
      p_status: status ?? null,
      p_paid_amount: amount,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await load();
  }

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /><p className="text-sm text-gray-500">Loading invoice...</p></div></div>;
  if (!invoice || !customer) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700">{errorMessage || "Invoice not found."}</div>;

  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const formatMoney = (value: string | number | null | undefined) => money(value, invoice.currency_code, locale);
  const formatDate = (value: string | null | undefined) => date(value, locale, timezone);
  const billing = addressLines(invoice.billing_address_snapshot);

  return <div className="space-y-5">
    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        <Link href="/customers/invoices" className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">All Invoices</Link>
        <Link href={`/customers/${customer.id}/invoices`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Customer Invoices</Link>
        {invoice.order_id && <Link href={`/customers/${customer.id}/orders/${invoice.order_id}`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Source Order</Link>}
      </div>
      <Link href={`/customers/${customer.id}/invoices/${invoice.id}/print`} target="_blank" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">Print Invoice</Link>
    </div>

    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-6 border-b border-gray-200 pb-6 sm:flex-row sm:justify-between dark:border-gray-800">
        <div className="flex items-start gap-4">
          {settings.logo_url && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={settings.logo_url} alt={`${settings.company_name} logo`} className="max-h-14 max-w-44 object-contain" /></>}
          <div>
            <p className="text-xl font-semibold text-gray-900 dark:text-white">{settings.company_name}</p>
            {settings.legal_name && settings.legal_name !== settings.company_name && <p className="text-sm text-gray-500">{settings.legal_name}</p>}
            {settings.email && <p className="mt-1 text-sm text-gray-500">{settings.email}</p>}
            {settings.phone && <p className="text-sm text-gray-500">{settings.phone}</p>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{settings.invoice_document_title || "Invoice"}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</p>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badge(invoice.status)}`}>{titleCase(invoice.status)}</span>
          <p className="mt-3 text-sm text-gray-500">Invoice: {formatDate(invoice.invoice_date)}</p>
          <p className="text-sm text-gray-500">Due: {formatDate(invoice.due_date)}</p>
          <p className="text-sm text-gray-500">Order: {invoice.order_number_snapshot || "—"}</p>
        </div>
      </div>

      <div className="grid gap-6 border-b border-gray-200 py-6 md:grid-cols-2 dark:border-gray-800">
        <div><p className="mb-2 text-xs font-medium uppercase text-gray-400">Bill To</p><p className="font-semibold text-gray-900 dark:text-white">{customer.name}</p>{billing.map((line, index) => <p key={`${line}-${index}`} className="text-sm text-gray-500">{line}</p>)}</div>
        <div className="md:text-right"><p className="mb-2 text-xs font-medium uppercase text-gray-400">Reference</p><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{invoice.customer_reference || "—"}</p>{customer.tax_number && <p className="mt-2 text-sm text-gray-500">Customer Tax ID: {customer.tax_number}</p>}{settings.tax_number && <p className="text-sm text-gray-500">Seller Tax ID: {settings.tax_number}</p>}</div>
      </div>

      <div className="overflow-x-auto py-6"><table className="min-w-full"><thead><tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400 dark:border-gray-800">{["#", "SKU", "Product", "Qty", "Unit Price", "Discount", "Line Total"].map((label) => <th key={label} className={`pb-3 pr-4 ${["Qty","Unit Price","Discount","Line Total"].includes(label) ? "text-right" : ""}`}>{label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-gray-100 text-sm dark:border-gray-800"><td className="py-3 pr-4 text-gray-400">{item.line_no}</td><td className="py-3 pr-4 font-medium text-gray-800 dark:text-gray-200">{item.sku_snapshot}</td><td className="py-3 pr-4 text-gray-700 dark:text-gray-300">{item.product_name_snapshot}</td><td className="py-3 pr-4 text-right">{Number(item.quantity)}</td><td className="py-3 pr-4 text-right">{formatMoney(item.unit_price)}</td><td className="py-3 pr-4 text-right">{Number(item.discount_percent).toFixed(2)}%</td><td className="py-3 text-right font-medium">{formatMoney(item.line_total)}</td></tr>)}</tbody></table></div>

      <div className="ml-auto max-w-md space-y-2 border-t border-gray-200 pt-5 text-sm dark:border-gray-800">
        <Amount label="Subtotal" value={formatMoney(invoice.subtotal)} />
        <Amount label="Order discount" value={`-${formatMoney(invoice.discount_amount)}`} />
        <Amount label={`Tax (${Number(invoice.tax_rate).toFixed(2)}%)`} value={formatMoney(invoice.tax_amount)} />
        {Number(invoice.payment_commission_amount) > 0 && <Amount label={`Payment commission (${Number(invoice.payment_commission_percent).toFixed(2)}%)`} value={formatMoney(invoice.payment_commission_amount)} />}
        <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-semibold text-gray-900 dark:border-gray-800 dark:text-white"><span>Total</span><span>{formatMoney(invoice.total_amount)}</span></div>
        <Amount label="Paid" value={formatMoney(invoice.paid_amount)} />
        <div className="flex justify-between text-base font-semibold text-brand-600 dark:text-brand-400"><span>Balance Due</span><span>{formatMoney(balance)}</span></div>
      </div>

      {invoice.notes && <div className="mt-8 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300"><p className="mb-1 font-medium text-gray-800 dark:text-gray-200">Notes</p><p className="whitespace-pre-wrap">{invoice.notes}</p></div>}
      {settings.invoice_footer_note && <div className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-500 whitespace-pre-wrap dark:border-gray-800">{settings.invoice_footer_note}</div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Invoice Controls</h2><p className="mt-1 text-sm text-gray-500">Issue the invoice, record payment progress, or void it. Invoices are never deleted.</p></div>
        <div className="flex flex-wrap items-end gap-2">
          {invoice.status === "draft" && <button disabled={isSaving} onClick={() => updateState("issued")} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-60">Issue Invoice</button>}
          {!['draft', 'void'].includes(invoice.status) && <><label><span className="mb-1 block text-xs text-gray-500">Paid amount</span><input type="number" min="0" max={Number(invoice.total_amount)} step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="h-10 w-40 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></label><button disabled={isSaving} onClick={() => updateState()} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300">Save Payment</button>{invoice.status !== "paid" && <button disabled={isSaving} onClick={() => updateState("paid", Number(invoice.total_amount))} className="h-10 rounded-lg bg-success-600 px-4 text-sm font-medium text-white disabled:opacity-60">Mark Paid</button>}</>}
          {invoice.status !== "void" && <button disabled={isSaving} onClick={() => updateState("void")} className="h-10 rounded-lg border border-error-300 px-4 text-sm font-medium text-error-600 disabled:opacity-60 dark:border-error-500/40 dark:text-error-400">Void</button>}
        </div>
      </div>
    </section>
  </div>;
}

function Amount({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>{label}</span><span className="font-medium text-gray-800 dark:text-gray-200">{value}</span></div>;
}
