"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { Customer, CustomerAddress, CustomerOrder, CustomerOrderItem, PaymentMethod, PriceGroupLookup } from "@/lib/customers/types";

type Product = { id: string; sku: string; name: string; status: string };
type PriceRow = { product_id: string; amount: string | number };
type DraftItem = { product_id: string; quantity: string; unit_price: string; discount_percent: string };

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
}

export default function EditCustomerOrder() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const customerId = params.id;
  const orderId = params.orderId;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupLookup[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);

  const [priceGroupId, setPriceGroupId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [appliedCommission, setAppliedCommission] = useState("0");
  const [billingAddressId, setBillingAddressId] = useState("");
  const [shippingAddressId, setShippingAddressId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [reference, setReference] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [revisionReason, setRevisionReason] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError || !profile || !["super_admin", "admin", "sales"].includes(profile.role)) {
        setErrorMessage(profileError?.message || "You do not have permission to edit orders.");
        setIsLoading(false);
        return;
      }

      const [customerResult, orderResult, itemsResult, addressesResult, groupsResult, methodsResult, productsResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("customer_orders").select("*").eq("id", orderId).eq("customer_id", customerId).single(),
        supabase.from("customer_order_items").select("*").eq("order_id", orderId).order("line_no"),
        supabase.from("customer_addresses").select("*").eq("customer_id", customerId).eq("is_active", true).order("address_name"),
        supabase.from("price_groups").select("id, name, system_key, sort_order, is_base_price, is_active").eq("is_active", true).order("sort_order"),
        supabase.from("payment_methods").select("id, system_key, name, commission_percent, sort_order, is_active").eq("is_active", true).order("sort_order"),
        supabase.from("products").select("id, sku, name, status").in("status", ["active", "inactive"]).order("sku"),
      ]);

      const firstError = customerResult.error || orderResult.error || itemsResult.error || addressesResult.error || groupsResult.error || methodsResult.error || productsResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedOrder = orderResult.data as CustomerOrder;
      if (loadedOrder.status === "cancelled") {
        setErrorMessage("Cancelled orders cannot be edited.");
      }

      setCustomer(customerResult.data as Customer);
      setOrder(loadedOrder);
      setAddresses((addressesResult.data ?? []) as CustomerAddress[]);
      setPriceGroups((groupsResult.data ?? []) as PriceGroupLookup[]);
      setPaymentMethods((methodsResult.data ?? []) as PaymentMethod[]);
      setProducts((productsResult.data ?? []) as Product[]);
      setItems(((itemsResult.data ?? []) as CustomerOrderItem[]).map((item) => ({
        product_id: item.product_id ?? "",
        quantity: String(item.quantity),
        unit_price: String(item.unit_price),
        discount_percent: String(item.discount_percent),
      })));

      setPriceGroupId(loadedOrder.price_group_id ?? "");
      setPaymentMethodId(loadedOrder.payment_method_id ?? "");
      setAppliedCommission(String(loadedOrder.payment_commission_percent ?? 0));
      setBillingAddressId(loadedOrder.billing_address_id ?? "");
      setShippingAddressId(loadedOrder.shipping_address_id ?? "");
      setExpectedDate(loadedOrder.expected_delivery_date ?? "");
      setReference(loadedOrder.customer_reference ?? "");
      setCustomerNotes(loadedOrder.customer_notes ?? "");
      setInternalNotes(loadedOrder.internal_notes ?? "");
      setTaxRate(String(loadedOrder.tax_rate ?? 0));
      setOrderDiscount(String(loadedOrder.discount_amount ?? 0));
      setIsLoading(false);
    }
    load();
  }, [customerId, orderId]);

  useEffect(() => {
    if (!priceGroupId || !order) return;
    const currencyCode = order.currency_code;
    let active = true;
    async function loadPrices() {
      setIsLoadingPrices(true);
      const { data, error } = await supabase
        .from("product_prices")
        .select("product_id, amount")
        .eq("price_group_id", priceGroupId)
        .eq("is_active", true)
        .is("valid_to", null)
        .eq("currency_code", currencyCode);
      if (!active) return;
      if (error) setErrorMessage(error.message);
      else setPrices((data ?? []) as PriceRow[]);
      setIsLoadingPrices(false);
    }
    loadPrices();
    return () => { active = false; };
  }, [priceGroupId, order]);

  const priceMap = useMemo(() => new Map(prices.map((p) => [p.product_id, Number(p.amount)])), [prices]);
  const selectedPaymentMethod = useMemo(() => paymentMethods.find((m) => m.id === paymentMethodId) ?? null, [paymentMethods, paymentMethodId]);

  const preview = useMemo(() => {
    let subtotal = 0;
    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity || 0));
      const price = Math.max(0, Number(item.unit_price || 0));
      const discount = Math.min(100, Math.max(0, Number(item.discount_percent || 0)));
      subtotal += qty * price * (1 - discount / 100);
    }
    const discountAmount = Math.max(0, Number(orderDiscount || 0));
    const taxable = Math.max(0, subtotal - discountAmount);
    const tax = taxable * Math.max(0, Number(taxRate || 0)) / 100;
    const orderTotal = taxable + tax;
    const commissionPercent = Math.max(0, Number(appliedCommission || 0));
    const commission = orderTotal * commissionPercent / 100;
    return { subtotal, tax, orderTotal, commission, grandTotal: orderTotal + commission };
  }, [items, orderDiscount, taxRate, appliedCommission]);

  function updateItem(index: number, values: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...values } : item));
  }

  function selectProduct(index: number, productId: string) {
    const groupPrice = priceMap.get(productId);
    updateItem(index, { product_id: productId, unit_price: groupPrice !== undefined ? String(groupPrice) : "0" });
  }

  function useGroupPrice(index: number) {
    const groupPrice = priceMap.get(items[index].product_id);
    if (groupPrice !== undefined) updateItem(index, { unit_price: String(groupPrice) });
  }

  async function saveRevision() {
    setErrorMessage(null);
    if (!order || order.status === "cancelled") return;
    if (!priceGroupId || !paymentMethodId) return setErrorMessage("Price group and payment method are required.");
    if (items.length === 0) return setErrorMessage("At least one product line is required.");
    if (Number(appliedCommission) < 0 || Number(appliedCommission) > 100) return setErrorMessage("Applied commission must be between 0 and 100%.");

    for (const item of items) {
      if (!item.product_id) return setErrorMessage("Select a product for every line.");
      if (Number(item.quantity) <= 0) return setErrorMessage("Quantity must be greater than zero.");
      if (Number(item.unit_price) < 0) return setErrorMessage("Unit price cannot be negative.");
      if (Number(item.discount_percent) < 0 || Number(item.discount_percent) > 100) return setErrorMessage("Line discount must be between 0 and 100%.");
    }

    setIsSaving(true);
    const { data, error } = await supabase.rpc("update_customer_order", {
      p_order_id: order.id,
      p_items: items.map((item) => ({ product_id: item.product_id, quantity: Number(item.quantity), unit_price: Number(item.unit_price), discount_percent: Number(item.discount_percent || 0) })),
      p_price_group_id: priceGroupId,
      p_billing_address_id: billingAddressId || null,
      p_shipping_address_id: shippingAddressId || null,
      p_expected_delivery_date: expectedDate || null,
      p_customer_reference: reference.trim() || null,
      p_customer_notes: customerNotes.trim() || null,
      p_internal_notes: internalNotes.trim() || null,
      p_tax_rate: Number(taxRate || 0),
      p_order_discount_amount: Number(orderDiscount || 0),
      p_payment_method_id: paymentMethodId,
      p_payment_commission_percent: Number(appliedCommission || 0),
      p_revision_reason: revisionReason.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push(`/customers/${customerId}/orders/${orderId}?revision=${data}`);
  }

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><p className="text-sm text-gray-500">Loading editable order...</p></div>;
  if (!customer || !order) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700">{errorMessage || "Order not found."}</div>;

  const defaultCommission = Number(selectedPaymentMethod?.commission_percent ?? 0);

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Edit {order.order_number}</h1><p className="mt-1 text-sm text-gray-500">{customer.name} • changes will create a revision snapshot</p></div>
      <Link href={`/customers/${customerId}/orders/${orderId}`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Back to Order</Link>
    </div>

    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}

    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Information</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Price Group"><select value={priceGroupId} onChange={(e) => setPriceGroupId(e.target.value)} className={inputClass}>{priceGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>{isLoadingPrices && <span className="mt-1 block text-xs text-gray-400">Loading group prices...</span>}</Field>
        <Field label="Payment Method"><select value={paymentMethodId} onChange={(e) => { const id = e.target.value; setPaymentMethodId(id); const method = paymentMethods.find((m) => m.id === id); setAppliedCommission(String(Number(method?.commission_percent ?? 0))); }} className={inputClass}>{paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Applied Commission (%)"><div className="flex gap-2"><input value={appliedCommission} onChange={(e) => setAppliedCommission(e.target.value)} inputMode="decimal" className={inputClass} /><button type="button" onClick={() => setAppliedCommission(String(defaultCommission))} className="whitespace-nowrap rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Use Default</button></div><span className="mt-1 block text-xs text-gray-400">Default {defaultCommission.toFixed(2)}%</span></Field>
        <Field label="Expected Delivery"><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Customer Reference"><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} /></Field>
        <Field label="Billing Address"><select value={billingAddressId} onChange={(e) => setBillingAddressId(e.target.value)} className={inputClass}><option value="">None</option>{addresses.filter((a) => ["billing","both"].includes(a.address_type)).map((a) => <option key={a.id} value={a.id}>{a.address_name} — {a.city}</option>)}</select></Field>
        <Field label="Shipping Address"><select value={shippingAddressId} onChange={(e) => setShippingAddressId(e.target.value)} className={inputClass}><option value="">None</option>{addresses.filter((a) => ["shipping","both"].includes(a.address_type)).map((a) => <option key={a.id} value={a.id}>{a.address_name} — {a.city}</option>)}</select></Field>
        <Field label="Order Discount ($)"><input value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} inputMode="decimal" className={inputClass} /></Field>
        <Field label="Tax Rate (%)"><input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" className={inputClass} /></Field>
      </div>
    </div>

    <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Products</h2><p className="mt-1 text-sm text-gray-500">Add, remove, change quantity, discount or unit price.</p></div><button type="button" onClick={() => setItems((current) => [...current, { product_id: "", quantity: "1", unit_price: "0", discount_percent: "0" }])} className="h-9 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Add Line</button></div>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Product","Qty","Unit Price","Discount %","Line Total",""].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{items.map((item, index) => { const total = Number(item.quantity || 0) * Number(item.unit_price || 0) * (1 - Number(item.discount_percent || 0) / 100); return <tr key={index}><td className="min-w-[340px] px-4 py-3"><select value={item.product_id} onChange={(e) => selectProduct(index, e.target.value)} className={inputClass}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}{p.status !== "active" ? " (Inactive)" : ""}</option>)}</select></td><td className="w-[110px] px-4 py-3"><input value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} inputMode="decimal" className={inputClass} /></td><td className="min-w-[190px] px-4 py-3"><div className="flex gap-2"><input value={item.unit_price} onChange={(e) => updateItem(index, { unit_price: e.target.value })} inputMode="decimal" className={inputClass} /><button type="button" disabled={!priceMap.has(item.product_id)} onClick={() => useGroupPrice(index)} className="whitespace-nowrap rounded-lg border border-gray-300 px-2 text-xs font-medium text-gray-600 disabled:opacity-30 dark:border-gray-700 dark:text-gray-300">Group Price</button></div></td><td className="w-[130px] px-4 py-3"><input value={item.discount_percent} onChange={(e) => updateItem(index, { discount_percent: e.target.value })} inputMode="decimal" className={inputClass} /></td><td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{money(total)}</td><td className="px-4 py-3 text-right"><button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="text-xs font-medium text-error-600 disabled:opacity-30">Remove</button></td></tr>; })}</tbody></table></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes"><textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field><Field label="Internal Notes"><textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field></div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><Field label="Revision Reason"><input value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} placeholder="e.g. Quantity changed after customer request" className={inputClass} /></Field><p className="mt-2 text-xs text-gray-400">Optional, but recommended. The previous complete order will be preserved automatically.</p></div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Revised Total</h2><div className="mt-4 space-y-3 text-sm"><Row label="Lines after discount" value={money(preview.subtotal)} /><Row label="Order discount" value={`-${money(Number(orderDiscount || 0))}`} /><Row label="Tax" value={money(preview.tax)} /><Row label="Order Total" value={money(preview.orderTotal)} />{preview.commission > 0 && <Row label={`Payment Commission (${Number(appliedCommission || 0).toFixed(2)}%)`} value={money(preview.commission)} />}<div className="border-t border-gray-200 pt-3 dark:border-gray-800"><Row label="Grand Total" value={money(preview.grandTotal)} strong /></div></div><button type="button" disabled={isSaving || isLoadingPrices || order.status === "cancelled"} onClick={saveRevision} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-40">{isSaving ? "Saving Revision..." : "Save Revision"}</button></div>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>; }
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4"><span className="text-gray-500">{label}</span><span className={strong ? "text-lg font-semibold text-gray-800 dark:text-white/90" : "font-medium text-gray-800 dark:text-white/90"}>{value}</span></div>; }
