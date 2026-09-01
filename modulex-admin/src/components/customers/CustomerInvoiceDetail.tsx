"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import SummaryRow from "@/components/common/SummaryRow";
import ServiceLineDetails from "@/components/customers/ServiceLineDetails";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import type { Customer, CustomerInvoice, CustomerInvoiceItem, CustomerInvoiceStatus } from "@/lib/customers/types";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

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

function statusColor(status: CustomerInvoiceStatus): "success" | "error" | "info" | "warning" | "light" {
  if (status === "paid") return "success";
  if (status === "overdue" || status === "void") return "error";
  if (status === "issued") return "warning";
  if (status === "partially_paid") return "info";
  return "light";
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
  const router = useRouter();
  const [invoice, setInvoice] = useState<CustomerInvoice | null>(null);
  const [items, setItems] = useState<CustomerInvoiceItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [canManage, setCanManage] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);

    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setErrorMessage(profileError?.message ?? "User profile could not be loaded.");
      setIsLoading(false);
      return;
    }
    if (!hasPermission(profile.role, "invoices.view")) {
      setErrorMessage("You do not have permission to view customer invoices.");
      setIsLoading(false);
      return;
    }
    setCanManage(hasPermission(profile.role, "invoices.manage"));

    const [invoiceResult, itemsResult, customerResult, settingsResult, approvalsResult] = await Promise.all([
      supabase.from("customer_invoices").select("*").eq("id", params.invoiceId).eq("customer_id", params.id).single(),
      supabase.from("customer_invoice_items").select("*").eq("invoice_id", params.invoiceId).order("line_no"),
      supabase.from("customers").select("*").eq("id", params.id).single(),
      supabase.from("general_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("entity_type", "invoice").eq("entity_id", params.invoiceId).eq("status", "pending"),
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
    setPendingApprovals(approvalsResult.error ? 0 : approvalsResult.count ?? 0);
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
    if (!invoice || !canManage || isSaving) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    const amount = explicitPaid ?? (paidAmount.trim() ? Number(paidAmount) : null);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > Number(invoice.total_amount))) {
      setErrorMessage("Paid amount must be between zero and invoice total.");
      setIsSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc("update_customer_invoice_state", {
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
    setSuccessMessage(data === "approval_requested" ? "Approval requested. The invoice was not changed yet." : "Invoice updated.");
  }

  if (isLoading) return <ComponentCard title="Invoice Detail" desc="Loading invoice and payment context…"><FormHint>Loading invoice…</FormHint></ComponentCard>;
  if (!invoice || !customer) return <Alert variant="error" title="Unable to load invoice" message={errorMessage || "Invoice not found."} />;

  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const formatMoney = (value: string | number | null | undefined) => money(value, invoice.currency_code, locale);
  const formatDate = (value: string | null | undefined) => date(value, locale, timezone);
  const billing = addressLines(invoice.billing_address_snapshot);

  return (
    <div className="space-y-5">
      {errorMessage ? <Alert variant="error" title="Invoice action failed" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Invoice updated" message={successMessage} /> : null}
      {pendingApprovals > 0 ? (
        <ComponentCard title="Approval Pending" desc={`${pendingApprovals} protected invoice change${pendingApprovals === 1 ? " is" : "s are"} waiting for approval.`} headerAction={<Button size="sm" variant="outline" onClick={() => router.push("/approvals")}>Open Approvals</Button>} collapsed><div /></ComponentCard>
      ) : null}

      <ComponentCard
        title={invoice.invoice_number}
        desc={`${customer.name} · Invoice ${formatDate(invoice.invoice_date)} · Due ${formatDate(invoice.due_date)}`}
        headerAction={(
          <div className="flex flex-wrap justify-end gap-2">
            <Badge color={statusColor(invoice.status)}>{titleCase(invoice.status)}</Badge>
            <Button size="sm" onClick={() => window.open(`/customers/${customer.id}/invoices/${invoice.id}/print`, "_blank", "noopener,noreferrer")}>Print Invoice</Button>
            {invoice.order_id ? <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${customer.id}/orders/${invoice.order_id}`)}>Source Order</Button> : null}
            <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${customer.id}/invoices`)}>Customer Invoices</Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/customers/invoices")}>All Invoices</Button>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SummaryRow label="Total" value={formatMoney(invoice.total_amount)} strong />
          <SummaryRow label="Paid" value={formatMoney(invoice.paid_amount)} />
          <SummaryRow label="Balance Due" value={formatMoney(balance)} strong />
          <SummaryRow label="Order" value={invoice.order_number_snapshot || "—"} />
          <SummaryRow label="Reference" value={invoice.customer_reference || "—"} />
          <SummaryRow label="Currency" value={invoice.currency_code || "USD"} />
        </div>
      </ComponentCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ComponentCard title="Seller">
          <div className="flex items-start gap-4">
            {settings.logo_url ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={settings.logo_url} alt={`${settings.company_name} logo`} className="max-h-14 max-w-44 object-contain" /></> : null}
            <div className="space-y-1">
              <p className="font-semibold">{settings.company_name}</p>
              {settings.legal_name && settings.legal_name !== settings.company_name ? <p className="text-sm">{settings.legal_name}</p> : null}
              {settings.email ? <p className="text-sm">{settings.email}</p> : null}
              {settings.phone ? <p className="text-sm">{settings.phone}</p> : null}
              {settings.tax_number ? <p className="text-sm">Seller Tax ID: {settings.tax_number}</p> : null}
            </div>
          </div>
        </ComponentCard>
        <ComponentCard title="Bill To">
          <div className="space-y-1">
            <p className="font-semibold">{customer.name}</p>
            {billing.length ? billing.map((line, index) => <p key={`${line}-${index}`} className="text-sm">{line}</p>) : <FormHint>No billing snapshot.</FormHint>}
            {customer.tax_number ? <p className="text-sm">Customer Tax ID: {customer.tax_number}</p> : null}
          </div>
        </ComponentCard>
      </div>

      <ComponentCard title="Invoice Items" desc="Invoice lines are immutable commercial snapshots, including saved Service details.">
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin"><TableRow>{["#", "SKU", "Product", "Qty", "Unit Price", "Discount", "Line Total"].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={7}>No invoice items found.</TableStateRow> : items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell variant="admin">{item.line_no}</TableCell>
                  <TableCell variant="admin" className="font-semibold">{item.sku_snapshot}</TableCell>
                  <TableCell variant="admin" className="min-w-[320px]"><span>{item.product_name_snapshot}</span><ServiceLineDetails lineNote={item.line_note} /></TableCell>
                  <TableCell variant="admin">{Number(item.quantity)}</TableCell>
                  <TableCell variant="admin">{formatMoney(item.unit_price)}</TableCell>
                  <TableCell variant="admin">{Number(item.discount_percent).toFixed(2)}%</TableCell>
                  <TableCell variant="admin" className="font-semibold">{formatMoney(item.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          {invoice.notes ? <ComponentCard title="Notes"><p className="whitespace-pre-wrap text-sm">{invoice.notes}</p></ComponentCard> : null}
          {settings.invoice_footer_note ? <ComponentCard title="Invoice Footer"><p className="whitespace-pre-wrap text-sm">{settings.invoice_footer_note}</p></ComponentCard> : null}
        </div>
        <div className="xl:col-span-4">
          <ComponentCard title="Totals">
            <div className="space-y-3">
              <SummaryRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
              <SummaryRow label="Order discount" value={`-${formatMoney(invoice.discount_amount)}`} />
              <SummaryRow label={`Tax (${Number(invoice.tax_rate).toFixed(2)}%)`} value={formatMoney(invoice.tax_amount)} />
              {Number(invoice.payment_commission_amount) > 0 ? <SummaryRow label={`Payment commission (${Number(invoice.payment_commission_percent).toFixed(2)}%)`} value={formatMoney(invoice.payment_commission_amount)} /> : null}
              <SummaryRow label="Total" value={formatMoney(invoice.total_amount)} strong divider />
              <SummaryRow label="Paid" value={formatMoney(invoice.paid_amount)} />
              <SummaryRow label="Balance Due" value={formatMoney(balance)} strong />
            </div>
          </ComponentCard>
        </div>
      </div>

      {canManage ? (
        <ComponentCard title="Invoice Controls" desc="Issue invoices, record payment progress, mark paid or void. Approval rules remain database-authoritative.">
          <div className="flex flex-wrap items-end gap-3">
            {invoice.status === "draft" ? <Button disabled={isSaving} onClick={() => void updateState("issued")}>Issue Invoice</Button> : null}
            {!['draft', 'void'].includes(invoice.status) ? (
              <>
                <div className="w-44"><Label htmlFor="invoice-paid-amount">Paid amount</Label><Input id="invoice-paid-amount" type="number" min="0" max={Number(invoice.total_amount)} step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} /></div>
                <Button variant="outline" disabled={isSaving} onClick={() => void updateState()}>Save Payment</Button>
                {invoice.status !== "paid" ? <Button disabled={isSaving} onClick={() => void updateState("paid", Number(invoice.total_amount))}>Mark Paid</Button> : null}
              </>
            ) : null}
            {invoice.status !== "void" ? <Button variant="danger" disabled={isSaving} onClick={() => void updateState("void")}>Void</Button> : null}
          </div>
        </ComponentCard>
      ) : null}
    </div>
  );
}