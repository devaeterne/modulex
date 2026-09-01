"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ServiceLineDetails from "@/components/customers/ServiceLineDetails";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { Customer, CustomerOrder, CustomerOrderItem } from "@/lib/customers/types";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";
import { supabase } from "@/lib/supabase/client";

function money(value: string | number | null | undefined, currency: string, locale: string) {
  const number = Number(value ?? 0);
  const safeNumber = Number.isFinite(number) ? number : 0;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(safeNumber);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(safeNumber);
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

function companyAddress(settings: GeneralSettings) {
  const firstLine = [settings.address_line_1, settings.address_line_2].filter(Boolean).join(", ");
  const secondLine = [settings.postal_code, settings.city, settings.state_region, settings.country_code].filter(Boolean).join(", ");
  return [firstLine, secondLine].filter(Boolean);
}

export default function CustomerOrderPrint() {
  const params = useParams<{ id: string; orderId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [items, setItems] = useState<CustomerOrderItem[]>([]);
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

      setCustomer(customerResult.data as Customer);
      setOrder(orderResult.data as CustomerOrder);
      setItems((itemsResult.data ?? []) as CustomerOrderItem[]);
      if (!settingsResult.error && settingsResult.data) setSettings(settingsResult.data as GeneralSettings);
      setIsLoading(false);
    }
    void load();
  }, [params.id, params.orderId]);

  if (isLoading) return <div className="p-10 text-center text-sm">Preparing printable order...</div>;
  if (!customer || !order) return <div className="p-10 text-center text-sm">{errorMessage || "Order not found."}</div>;

  const billing = order.billing_address_snapshot as Record<string, string | null> | null;
  const shipping = order.shipping_address_snapshot as Record<string, string | null> | null;
  const grandTotal = Number(order.grand_total ?? order.total_amount ?? 0);
  const currency = order.currency_code || settings.default_currency || "USD";
  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const addressLines = companyAddress(settings);
  const formatMoney = (value: string | number | null | undefined) => money(value, currency, locale);
  const formatDate = (value: string | null | undefined) => date(value, locale, timezone);

  return (
    <div className="mx-auto max-w-[900px] p-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden"><Button onClick={() => window.print()}>Print Order</Button></div>

      <div className="flex items-start justify-between gap-8 border-b pb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-4">
            {settings.logo_url ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={settings.logo_url} alt={`${settings.company_name} logo`} className="max-h-16 max-w-[180px] object-contain" /></> : null}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight">{settings.company_name}</h1>
              {settings.legal_name && settings.legal_name !== settings.company_name ? <p className="mt-1 text-sm font-medium">{settings.legal_name}</p> : null}
              <p className="mt-2 text-sm">{settings.order_document_title}</p>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-xs leading-5">
            {addressLines.map((line) => <p key={line}>{line}</p>)}
            {(settings.phone || settings.email) ? <p>{[settings.phone, settings.email].filter(Boolean).join(" · ")}</p> : null}
            {settings.website ? <p>{settings.website}</p> : null}
            {(settings.tax_number || settings.registration_number) ? <p>{[settings.tax_number ? `Tax/VAT: ${settings.tax_number}` : null, settings.registration_number ? `Reg: ${settings.registration_number}` : null].filter(Boolean).join(" · ")}</p> : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold">{order.order_number}</p>
          <p className="mt-2 text-sm">Order Date: {formatDate(order.order_date)}</p>
          <p className="text-sm">Status: {titleCase(order.status)}</p>
          {order.expected_delivery_date ? <p className="text-sm">Expected Delivery: {formatDate(order.expected_delivery_date)}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 py-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Customer</p>
          <p className="mt-2 font-semibold">{customer.name}</p>
          {customer.legal_name && customer.legal_name !== customer.name ? <p className="text-sm">{customer.legal_name}</p> : null}
          <p className="text-sm">{customer.customer_code}</p>
          {customer.tax_number ? <p className="text-sm">Tax/VAT: {customer.tax_number}</p> : null}
          {customer.email ? <p className="text-sm">{customer.email}</p> : null}
          {customer.phone ? <p className="text-sm">{customer.phone}</p> : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Order Information</p>
          <p className="mt-2 text-sm"><span className="font-medium">Payment:</span> {order.payment_method_name_snapshot || "—"}</p>
          <p className="text-sm"><span className="font-medium">Currency:</span> {currency}</p>
          {Number(order.payment_commission_percent ?? 0) > 0 ? <p className="text-sm"><span className="font-medium">Payment Commission:</span> {Number(order.payment_commission_percent).toFixed(2)}%</p> : null}
          {order.customer_reference ? <p className="text-sm"><span className="font-medium">Reference:</span> {order.customer_reference}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 border-y py-5">
        <AddressBlock title="Billing Address" data={billing} />
        <AddressBlock title="Shipping Address" data={shipping} />
      </div>

      <div className="mt-6">
        <Table variant="plain">
          <TableHeader variant="plain"><TableRow className="border-b">{["#", "SKU", "Product", "Qty", "Unit Price", "Discount", "Total"].map((label) => <TableCell key={label} isHeader variant="plain" className="px-3 py-2 text-xs font-semibold uppercase">{label}</TableCell>)}</TableRow></TableHeader>
          <TableBody variant="plain">
            {items.map((item) => (
              <TableRow key={item.id} className="border-t">
                <TableCell variant="plain" className="px-3 py-3 text-sm">{item.line_no}</TableCell>
                <TableCell variant="plain" className="px-3 py-3 text-sm font-medium">{item.sku_snapshot}</TableCell>
                <TableCell variant="plain" className="px-3 py-3 text-sm"><span>{item.product_name_snapshot}</span><ServiceLineDetails lineNote={item.line_note} /></TableCell>
                <TableCell variant="plain" className="px-3 py-3 text-right text-sm">{Number(item.quantity)}</TableCell>
                <TableCell variant="plain" className="px-3 py-3 text-right text-sm">{formatMoney(item.unit_price)}</TableCell>
                <TableCell variant="plain" className="px-3 py-3 text-right text-sm">{Number(item.discount_percent).toFixed(1)}%</TableCell>
                <TableCell variant="plain" className="px-3 py-3 text-right text-sm font-medium">{formatMoney(item.line_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="ml-auto mt-6 w-full max-w-[360px] space-y-2 text-sm">
        <TotalRow label="Subtotal" value={formatMoney(order.subtotal)} />
        <TotalRow label="Order Discount" value={`-${formatMoney(order.discount_amount)}`} />
        <TotalRow label={`Tax (${Number(order.tax_rate).toFixed(1)}%)`} value={formatMoney(order.tax_amount)} />
        <TotalRow label="Order Total" value={formatMoney(order.total_amount)} />
        {Number(order.payment_commission_amount ?? 0) > 0 ? <TotalRow label={`${order.payment_method_name_snapshot || "Payment"} Commission (${Number(order.payment_commission_percent).toFixed(2)}%)`} value={formatMoney(order.payment_commission_amount)} /> : null}
        <div className="border-t-2 pt-3"><TotalRow label="Grand Total" value={formatMoney(grandTotal)} strong /></div>
      </div>

      {order.customer_notes ? <div className="mt-8 border-t pt-5"><p className="text-xs font-semibold uppercase tracking-wide">Customer Notes</p><p className="mt-2 whitespace-pre-wrap text-sm">{order.customer_notes}</p></div> : null}
      {settings.order_footer_note ? <div className="mt-8 border-t pt-5"><p className="whitespace-pre-wrap text-xs leading-5">{settings.order_footer_note}</p></div> : null}

      <div className="mt-10 grid grid-cols-2 gap-12 pt-10 text-sm">
        <div className="border-t pt-2 text-center">Customer Signature</div>
        <div className="border-t pt-2 text-center">Authorized Signature</div>
      </div>
    </div>
  );
}

function AddressBlock({ title, data }: { title: string; data: Record<string, string | null> | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      {!data ? <p className="mt-2 text-sm">—</p> : (
        <div className="mt-2 text-sm leading-5">
          {data.address_name ? <p className="font-medium">{data.address_name}</p> : null}
          {data.company_name ? <p>{data.company_name}</p> : null}
          {data.contact_name ? <p>{data.contact_name}</p> : null}
          <p>{data.address_line_1}{data.address_line_2 ? `, ${data.address_line_2}` : ""}</p>
          <p>{[data.postal_code, data.city, data.state_region, data.country_code].filter(Boolean).join(", ")}</p>
          {data.phone ? <p>{data.phone}</p> : null}
        </div>
      )}
    </div>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-6"><span className={strong ? "text-base font-semibold" : ""}>{label}</span><span className={strong ? "text-lg font-bold" : "font-medium"}>{value}</span></div>;
}