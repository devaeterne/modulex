"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ServiceLineDetails from "@/components/customers/ServiceLineDetails";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { Customer, CustomerInvoice, CustomerInvoiceItem } from "@/lib/customers/types";
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

function lines(snapshot: Record<string, unknown> | null) {
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

  if (isLoading) return <div className="p-10 text-center text-sm">Preparing printable invoice...</div>;
  if (!customer || !invoice) return <div className="p-10 text-center text-sm">{errorMessage || "Invoice not found."}</div>;

  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const currency = invoice.currency_code || settings.default_currency || "USD";
  const formatMoney = (value: string | number | null | undefined) => money(value, currency, locale);
  const formatDate = (value: string | null | undefined) => date(value, locale, timezone);
  const billingLines = lines(invoice.billing_address_snapshot);
  const balance = Math.max(Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0), 0);
  const companyAddress = [
    [settings.address_line_1, settings.address_line_2].filter(Boolean).join(", "),
    [settings.postal_code, settings.city, settings.state_region, settings.country_code].filter(Boolean).join(", "),
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-5xl p-6 print:max-w-none print:p-0">
      <div className="mb-5 flex justify-end print:hidden"><Button onClick={() => window.print()}>Print / Save PDF</Button></div>

      <div className="border-b pb-6">
        <div className="flex items-start justify-between gap-8">
          <div className="flex items-start gap-4">
            {settings.logo_url ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={settings.logo_url} alt={`${settings.company_name} logo`} className="max-h-16 max-w-48 object-contain object-left" /></> : null}
            <div>
              <h1 className="text-xl font-bold">{settings.company_name}</h1>
              {settings.legal_name && settings.legal_name !== settings.company_name ? <p className="mt-1 text-sm">{settings.legal_name}</p> : null}
              {companyAddress.map((line) => <p key={line} className="text-sm">{line}</p>)}
              {settings.email ? <p className="text-sm">{settings.email}</p> : null}
              {settings.phone ? <p className="text-sm">{settings.phone}</p> : null}
              {settings.tax_number ? <p className="text-sm">Tax / VAT: {settings.tax_number}</p> : null}
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">{settings.invoice_document_title || "Invoice"}</p>
            <p className="mt-1 text-2xl font-bold">{invoice.invoice_number}</p>
            <div className="mt-4 space-y-1 text-sm">
              <p><span className="font-medium">Invoice date:</span> {formatDate(invoice.invoice_date)}</p>
              <p><span className="font-medium">Due date:</span> {formatDate(invoice.due_date)}</p>
              <p><span className="font-medium">Order:</span> {invoice.order_number_snapshot || "—"}</p>
              <p><span className="font-medium">Reference:</span> {invoice.customer_reference || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 border-b py-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Bill To</p>
          <p className="font-semibold">{customer.name}</p>
          {customer.legal_name && customer.legal_name !== customer.name ? <p className="text-sm">{customer.legal_name}</p> : null}
          {billingLines.map((line, index) => <p key={`${line}-${index}`} className="text-sm">{line}</p>)}
          {customer.tax_number ? <p className="mt-1 text-sm">Tax / VAT: {customer.tax_number}</p> : null}
        </div>
        <div className="text-right text-sm">
          <p><span className="font-medium">Status:</span> {invoice.status.replace(/_/g, " ")}</p>
          <p><span className="font-medium">Currency:</span> {currency}</p>
        </div>
      </div>

      <div className="mt-6">
        <Table variant="plain">
          <TableHeader variant="plain"><TableRow className="border-b">{["#", "SKU", "Product", "Qty", "Unit Price", "Discount", "Total"].map((label) => <TableCell key={label} isHeader variant="plain" className="py-3 pr-3 text-xs font-semibold uppercase">{label}</TableCell>)}</TableRow></TableHeader>
          <TableBody variant="plain">
            {items.map((item) => (
              <TableRow key={item.id} className="border-b">
                <TableCell variant="plain" className="py-3 pr-3 text-sm">{item.line_no}</TableCell>
                <TableCell variant="plain" className="py-3 pr-3 text-sm font-medium">{item.sku_snapshot}</TableCell>
                <TableCell variant="plain" className="py-3 pr-3 text-sm"><span>{item.product_name_snapshot}</span><ServiceLineDetails lineNote={item.line_note} /></TableCell>
                <TableCell variant="plain" className="py-3 pr-3 text-right text-sm">{Number(item.quantity)}</TableCell>
                <TableCell variant="plain" className="py-3 pr-3 text-right text-sm">{formatMoney(item.unit_price)}</TableCell>
                <TableCell variant="plain" className="py-3 pr-3 text-right text-sm">{Number(item.discount_percent).toFixed(2)}%</TableCell>
                <TableCell variant="plain" className="py-3 text-right text-sm font-medium">{formatMoney(item.line_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="ml-auto mt-6 max-w-md space-y-2 text-sm">
        <Row label="Subtotal" value={formatMoney(invoice.subtotal)} />
        <Row label="Discount" value={`-${formatMoney(invoice.discount_amount)}`} />
        <Row label={`Tax (${Number(invoice.tax_rate).toFixed(2)}%)`} value={formatMoney(invoice.tax_amount)} />
        {Number(invoice.payment_commission_amount ?? 0) > 0 ? <Row label={`Payment commission (${Number(invoice.payment_commission_percent).toFixed(2)}%)`} value={formatMoney(invoice.payment_commission_amount)} /> : null}
        <div className="flex justify-between border-t pt-3 text-base font-bold"><span>Total</span><span>{formatMoney(invoice.total_amount)}</span></div>
        <Row label="Paid" value={formatMoney(invoice.paid_amount)} />
        <div className="flex justify-between text-base font-bold"><span>Balance Due</span><span>{formatMoney(balance)}</span></div>
      </div>

      {invoice.notes ? <div className="mt-8 border-t pt-5"><p className="text-xs font-semibold uppercase tracking-wide">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm">{invoice.notes}</p></div> : null}
      {settings.invoice_footer_note ? <div className="mt-8 whitespace-pre-wrap border-t pt-4 text-xs">{settings.invoice_footer_note}</div> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-5"><span>{label}</span><span className="font-medium">{value}</span></div>;
}