"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { Customer, CustomerAddress, PaymentMethod, PriceGroupLookup } from "@/lib/customers/types";

type Product = { id: string; sku: string; name: string; barcode: string | null; status: string };
type PriceRow = { product_id: string; price_group_id: string; amount: string | number };
type DraftItem = { product_id: string; quantity: string; discount_percent: string };

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
}

export default function NewCustomerOrder() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupLookup[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [priceGroupId, setPriceGroupId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [billingAddressId, setBillingAddressId] = useState("");
  const [shippingAddressId, setShippingAddressId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [reference, setReference] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [initialStatus, setInitialStatus] = useState<"draft" | "confirmed">("draft");
  const [items, setItems] = useState<DraftItem[]>([{ product_id: "", quantity: "1", discount_percent: "0" }]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }
      if (!["super_admin", "admin", "sales"].includes(profile?.role ?? "")) {
        setErrorMessage("You do not have permission to create orders.");
        setIsLoading(false);
        return;
      }

      const [customerResult, addressesResult, groupsResult, methodsResult, productsResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("customer_addresses").select("*").eq("customer_id", customerId).eq("is_active", true).order("address_name"),
        supabase.from("price_groups").select("id, name, system_key, sort_order, is_base_price, is_active").eq("is_active", true).order("sort_order"),
        supabase.from("payment_methods").select("id, system_key, name, commission_percent, sort_order, is_active").eq("is_active", true).order("sort_order"),
        supabase.from("products").select("id, sku, name, barcode, status").eq("status", "active").order("sku"),
      ]);

      const firstError = customerResult.error || addressesResult.error || groupsResult.error || methodsResult.error || productsResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedCustomer = customerResult.data as Customer;
      const loadedAddresses = (addressesResult.data ?? []) as CustomerAddress[];
      const loadedGroups = (groupsResult.data ?? []) as PriceGroupLookup[];
      const loadedMethods = (methodsResult.data ?? []) as PaymentMethod[];

      setCustomer(loadedCustomer);
      setAddresses(loadedAddresses);
      setPriceGroups(loadedGroups);
      setPaymentMethods(loadedMethods);
      setProducts((productsResult.data ?? []) as Product[]);
      setPriceGroupId(loadedCustomer.price_group_id || loadedGroups.find((g) => g.is_base_price)?.id || loadedGroups[0]?.id || "");
      setPaymentMethodId(loadedMethods.find((m) => m.system_key === "cash")?.id || loadedMethods[0]?.id || "");
      setBillingAddressId(loadedAddresses.find((a) => a.is_default_billing)?.id || "");
      setShippingAddressId(loadedAddresses.find((a) => a.is_default_shipping)?.id || "");
      setIsLoading(false);
    }

    load();
  }, [customerId]);

  useEffect(() => {
    if (!priceGroupId) {
      setPrices([]);
      return;
    }

    let active = true;

    async function loadGroupPrices() {
      setIsLoadingPrices(true);
      const { data, error } = await supabase
        .from("product_prices")
        .select("product_id, price_group_id, amount")
        .eq("price_group_id", priceGroupId)
        .eq("is_active", true)
        .is("valid_to", null)
        .eq("currency_code", "USD");

      if (!active) return;
      if (error) {
        setErrorMessage(error.message);
        setPrices([]);
      } else {
        setPrices((data ?? []) as PriceRow[]);
      }
      setIsLoadingPrices(false);
    }

    loadGroupPrices();
    return () => { active = false; };
  }, [priceGroupId]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const priceMap = useMemo(() => new Map(prices.map((p) => [p.product_id, Number(p.amount)])), [prices]);
  const selectedPaymentMethod = useMemo(() => paymentMethods.find((m) => m.id === paymentMethodId) ?? null, [paymentMethods, paymentMethodId]);

  const preview = useMemo(() => {
    let subtotal = 0;
    for (const item of items) {
      const quantity = Number(item.quantity || 0);
      const discount = Number(item.discount_percent || 0);
      const price = priceMap.get(item.product_id) ?? 0;
      subtotal += quantity * price * (1 - discount / 100);
    }
    const orderDiscountNumber = Math.max(0, Number(orderDiscount || 0));
    const taxable = Math.max(0, subtotal - orderDiscountNumber);
    const tax = taxable * Math.max(0, Number(taxRate || 0)) / 100;
    const orderTotal = taxable + tax;
    const commissionPercent = Number(selectedPaymentMethod?.commission_percent ?? 0);
    const paymentCommission = orderTotal * commissionPercent / 100;
    const grandTotal = orderTotal + paymentCommission;
    return { subtotal, tax, orderTotal, commissionPercent, paymentCommission, grandTotal };
  }, [items, priceMap, orderDiscount, taxRate, selectedPaymentMethod]);

  function updateItem(index: number, values: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...values } : item));
  }

  async function saveOrder() {
    setErrorMessage(null);
    if (!customer || !priceGroupId) return setErrorMessage("Customer and price group are required.");
    if (!paymentMethodId) return setErrorMessage("Payment method is required.");
    if (isLoadingPrices) return setErrorMessage("Prices are still loading.");

    const validItems = items.filter((item) => item.product_id && Number(item.quantity) > 0);
    if (validItems.length === 0) return setErrorMessage("Add at least one valid product line.");

    for (const item of validItems) {
      if (!priceMap.has(item.product_id)) {
        return setErrorMessage(`No current price exists for ${productMap.get(item.product_id)?.sku ?? "selected product"} in this price group.`);
      }
      const discount = Number(item.discount_percent || 0);
      if (discount < 0 || discount > 100) return setErrorMessage("Line discount must be between 0 and 100%.");
    }

    setIsSaving(true);
    const payload = validItems.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      discount_percent: Number(item.discount_percent || 0),
    }));

    const { data, error } = await supabase.rpc("create_customer_order", {
      p_customer_id: customer.id,
      p_items: payload,
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
      p_initial_status: initialStatus,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push(`/customers/${customer.id}/orders/${data}`);
  }

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /><p className="text-sm text-gray-500">Preparing order...</p></div></div>;
  if (!customer || errorMessage && !customer) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700">{errorMessage || "Customer not found."}</div>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">New Order</h1><p className="mt-1 text-sm text-gray-500">{customer.name} • {customer.customer_code}</p></div>
      <Link href={`/customers/${customer.id}/orders`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Back to Orders</Link>
    </div>

    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}

    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Information</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Price Group"><select value={priceGroupId} onChange={(e) => setPriceGroupId(e.target.value)} className={inputClass}>{priceGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>{isLoadingPrices && <span className="mt-1 block text-xs text-gray-400">Loading prices...</span>}</Field>
        <Field label="Payment Method"><select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className={inputClass}>{paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}{Number(m.commission_percent) > 0 ? ` (+${Number(m.commission_percent).toFixed(2)}%)` : ""}</option>)}</select></Field>
        <Field label="Initial Status"><select value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as "draft" | "confirmed")} className={inputClass}><option value="draft">Draft</option><option value="confirmed">Confirmed</option></select></Field>
        <Field label="Expected Delivery"><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Customer Reference"><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO / reference" className={inputClass} /></Field>
        <Field label="Billing Address"><select value={billingAddressId} onChange={(e) => setBillingAddressId(e.target.value)} className={inputClass}><option value="">None</option>{addresses.filter((a) => ["billing", "both"].includes(a.address_type)).map((a) => <option key={a.id} value={a.id}>{a.address_name} — {a.city}</option>)}</select></Field>
        <Field label="Shipping Address"><select value={shippingAddressId} onChange={(e) => setShippingAddressId(e.target.value)} className={inputClass}><option value="">None</option>{addresses.filter((a) => ["shipping", "both"].includes(a.address_type)).map((a) => <option key={a.id} value={a.id}>{a.address_name} — {a.city}</option>)}</select></Field>
        <Field label="Order Discount ($)"><input inputMode="decimal" value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} className={inputClass} /></Field>
        <Field label="Tax Rate (%)"><input inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={inputClass} /></Field>
      </div>
    </div>

    <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Products</h2><p className="mt-1 text-sm text-gray-500">Prices resolve from the selected price group.</p></div><button type="button" onClick={() => setItems((current) => [...current, { product_id: "", quantity: "1", discount_percent: "0" }])} className="h-9 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Add Line</button></div>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Product", "Qty", "Unit Price", "Discount %", "Line Total", ""].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((item, index) => {
          const price = priceMap.get(item.product_id) ?? 0;
          const total = Number(item.quantity || 0) * price * (1 - Number(item.discount_percent || 0) / 100);
          return <tr key={index}><td className="min-w-[360px] px-4 py-3"><select value={item.product_id} onChange={(e) => updateItem(index, { product_id: e.target.value })} className={inputClass}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></td><td className="w-[110px] px-4 py-3"><input inputMode="decimal" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} className={inputClass} /></td><td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{item.product_id ? (priceMap.has(item.product_id) ? money(price) : "No price") : "—"}</td><td className="w-[130px] px-4 py-3"><input inputMode="decimal" value={item.discount_percent} onChange={(e) => updateItem(index, { discount_percent: e.target.value })} className={inputClass} /></td><td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{money(total)}</td><td className="px-4 py-3 text-right"><button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="text-xs font-medium text-error-600 disabled:opacity-30">Remove</button></td></tr>;
        })}
      </tbody></table></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-8"><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes"><textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field><Field label="Internal Notes"><textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field></div></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Total</h2><div className="mt-4 space-y-3 text-sm"><Row label="Lines after discount" value={money(preview.subtotal)} /><Row label="Order discount" value={`-${money(Number(orderDiscount || 0))}`} /><Row label="Tax" value={money(preview.tax)} /><Row label="Order Total" value={money(preview.orderTotal)} />{preview.paymentCommission > 0 && <Row label={`${selectedPaymentMethod?.name || "Payment"} Commission (${preview.commissionPercent.toFixed(2)}%)`} value={money(preview.paymentCommission)} />}<div className="border-t border-gray-200 pt-3 dark:border-gray-800"><Row label="Grand Total" value={money(preview.grandTotal)} strong /></div></div><button type="button" disabled={isSaving || isLoadingPrices || !paymentMethodId} onClick={saveOrder} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{isSaving ? "Creating..." : initialStatus === "confirmed" ? "Create & Confirm" : "Create Draft"}</button></div>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>; }
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4"><span className="text-gray-500">{label}</span><span className={strong ? "text-lg font-semibold text-gray-800 dark:text-white/90" : "font-medium text-gray-800 dark:text-white/90"}>{value}</span></div>; }
