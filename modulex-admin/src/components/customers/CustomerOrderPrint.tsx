"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Customer, CustomerOrder, CustomerOrderItem } from "@/lib/customers/types";
import {
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
} from "@/lib/settings/types";

function money(
  value: string | number | null | undefined,
  currency: string,
  locale: string
) {
  const number = Number(value ?? 0);
  const safeNumber = Number.isFinite(number) ? number : 0;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(safeNumber);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(safeNumber);
  }
}

function date(
  value: string | null | undefined,
  locale: string,
  timezone: string
) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
      new Date(value)
    );
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function companyAddress(settings: GeneralSettings) {
  const firstLine = [settings.address_line_1, settings.address_line_2]
    .filter(Boolean)
    .join(", ");
  const secondLine = [
    settings.postal_code,
    settings.city,
    settings.state_region,
    settings.country_code,
  ]
    .filter(Boolean)
    .join(", ");

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
        supabase
          .from("customer_orders")
          .select("*")
          .eq("id", params.orderId)
          .eq("customer_id", params.id)
          .single(),
        supabase
          .from("customer_order_items")
          .select("*")
          .eq("order_id", params.orderId)
          .order("line_no"),
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

      if (!settingsResult.error && settingsResult.data) {
        setSettings(settingsResult.data as GeneralSettings);
      }

      setIsLoading(false);
    }
    load();
  }, [params.id, params.orderId]);

  if (isLoading) {
    return <div className="p-10 text-center text-sm text-gray-500">Preparing printable order...</div>;
  }

  if (!customer || !order) {
    return <div className="p-10 text-center text-sm text-error-600">{errorMessage || "Order not found."}</div>;
  }

  const billing = order.billing_address_snapshot as Record<string, string | null> | null;
  const shipping = order.shipping_address_snapshot as Record<string, string | null> | null;
  const grandTotal = Number(order.grand_total ?? order.total_amount ?? 0);
  const currency = order.currency_code || settings.default_currency || "USD";
  const locale = settings.locale || "en-US";
  const timezone = settings.timezone || "UTC";
  const addressLines = companyAddress(settings);

  const formatMoney = (value: string | number | null | undefined) =>
    money(value, currency, locale);
  const formatDate = (value: string | null | undefined) =>
    date(value, locale, timezone);

  return (
    <div className="min-h-screen bg-gray-100 p-4 text-gray-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-[900px] rounded-xl bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-6 flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Print Order
          </button>
        </div>

        <div className="flex items-start justify-between gap-8 border-b border-gray-300 pb-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-4">
              {settings.logo_url && (
                <div className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.logo_url}
                    alt={`${settings.company_name} logo`}
                    className="max-h-16 max-w-[180px] object-contain"
                  />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight">{settings.company_name}</h1>
                {settings.legal_name && settings.legal_name !== settings.company_name && (
                  <p className="mt-1 text-sm font-medium text-gray-600">{settings.legal_name}</p>
                )}
                <p className="mt-2 text-sm text-gray-500">{settings.order_document_title}</p>
              </div>
            </div>

            <div className="mt-4 space-y-0.5 text-xs leading-5 text-gray-500">
              {addressLines.map((line) => <p key={line}>{line}</p>)}
              {(settings.phone || settings.email) && (
                <p>{[settings.phone, settings.email].filter(Boolean).join(" · ")}</p>
              )}
              {settings.website && <p>{settings.website}</p>}
              {(settings.tax_number || settings.registration_number) && (
                <p>
                  {[
                    settings.tax_number ? `Tax/VAT: ${settings.tax_number}` : null,
                    settings.registration_number ? `Reg: ${settings.registration_number}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold">{order.order_number}</p>
            <p className="mt-2 text-sm text-gray-500">Order Date: {formatDate(order.order_date)}</p>
            <p className="text-sm text-gray-500">Status: {titleCase(order.status)}</p>
            {order.expected_delivery_date && (
              <p className="text-sm text-gray-500">Expected Delivery: {formatDate(order.expected_delivery_date)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer</p>
            <p className="mt-2 font-semibold">{customer.name}</p>
            {customer.legal_name && customer.legal_name !== customer.name && <p className="text-sm text-gray-600">{customer.legal_name}</p>}
            <p className="text-sm text-gray-600">{customer.customer_code}</p>
            {customer.tax_number && <p className="text-sm text-gray-600">Tax/VAT: {customer.tax_number}</p>}
            {customer.email && <p className="text-sm text-gray-600">{customer.email}</p>}
            {customer.phone && <p className="text-sm text-gray-600">{customer.phone}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Order Information</p>
            <p className="mt-2 text-sm"><span className="font-medium">Price Group:</span> {order.price_group_name_snapshot || "—"}</p>
            <p className="text-sm"><span className="font-medium">Payment:</span> {order.payment_method_name_snapshot || "—"}</p>
            <p className="text-sm"><span className="font-medium">Currency:</span> {currency}</p>
            {Number(order.payment_commission_percent ?? 0) > 0 && (
              <p className="text-sm"><span className="font-medium">Payment Commission:</span> {Number(order.payment_commission_percent).toFixed(2)}%</p>
            )}
            {order.customer_reference && <p className="text-sm"><span className="font-medium">Reference:</span> {order.customer_reference}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 border-y border-gray-200 py-5">
          <AddressBlock title="Billing Address" data={billing} />
          <AddressBlock title="Shipping Address" data={shipping} />
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-300 print:rounded-none">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">SKU</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Unit Price</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Discount</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-gray-200">
                  <td className="px-3 py-3 text-sm">{item.line_no}</td>
                  <td className="px-3 py-3 text-sm font-medium">{item.sku_snapshot}</td>
                  <td className="px-3 py-3 text-sm">{item.product_name_snapshot}</td>
                  <td className="px-3 py-3 text-right text-sm">{Number(item.quantity)}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatMoney(item.unit_price)}</td>
                  <td className="px-3 py-3 text-right text-sm">{Number(item.discount_percent).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right text-sm font-medium">{formatMoney(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 ml-auto w-full max-w-[360px] space-y-2 text-sm">
          <TotalRow label="Subtotal" value={formatMoney(order.subtotal)} />
          <TotalRow label="Order Discount" value={`-${formatMoney(order.discount_amount)}`} />
          <TotalRow label={`Tax (${Number(order.tax_rate).toFixed(1)}%)`} value={formatMoney(order.tax_amount)} />
          <TotalRow label="Order Total" value={formatMoney(order.total_amount)} />
          {Number(order.payment_commission_amount ?? 0) > 0 && (
            <TotalRow
              label={`${order.payment_method_name_snapshot || "Payment"} Commission (${Number(order.payment_commission_percent).toFixed(2)}%)`}
              value={formatMoney(order.payment_commission_amount)}
            />
          )}
          <div className="border-t-2 border-gray-900 pt-3">
            <TotalRow label="Grand Total" value={formatMoney(grandTotal)} strong />
          </div>
        </div>

        {order.customer_notes && (
          <div className="mt-8 border-t border-gray-200 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{order.customer_notes}</p>
          </div>
        )}

        {settings.order_footer_note && (
          <div className="mt-8 border-t border-gray-200 pt-5">
            <p className="whitespace-pre-wrap text-xs leading-5 text-gray-500">{settings.order_footer_note}</p>
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-12 pt-10 text-sm">
          <div className="border-t border-gray-500 pt-2 text-center text-gray-500">Customer Signature</div>
          <div className="border-t border-gray-500 pt-2 text-center text-gray-500">Authorized Signature</div>
        </div>
      </div>
    </div>
  );
}

function AddressBlock({ title, data }: { title: string; data: Record<string, string | null> | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      {!data ? (
        <p className="mt-2 text-sm text-gray-500">—</p>
      ) : (
        <div className="mt-2 text-sm leading-5 text-gray-700">
          {data.address_name && <p className="font-medium">{data.address_name}</p>}
          {data.company_name && <p>{data.company_name}</p>}
          {data.contact_name && <p>{data.contact_name}</p>}
          <p>{data.address_line_1}{data.address_line_2 ? `, ${data.address_line_2}` : ""}</p>
          <p>{[data.postal_code, data.city, data.state_region, data.country_code].filter(Boolean).join(", ")}</p>
          {data.phone && <p>{data.phone}</p>}
        </div>
      )}
    </div>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className={strong ? "text-base font-semibold" : "text-gray-600"}>{label}</span>
      <span className={strong ? "text-lg font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
