"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import OrderProductPicker, { type OrderPickerProduct } from "@/components/customers/OrderProductPicker";
import type { Customer, CustomerAddress, OrderFulfillmentType, PaymentMethod, PriceGroupLookup } from "@/lib/customers/types";

type Product = OrderPickerProduct;
type PriceRow = { product_id: string; price_group_id: string; amount: string | number };
type DraftItem = { product_id: string; quantity: string; discount_percent: string };
type TaxRule = { fulfillment_type: OrderFulfillmentType; tax_rate: string | number | null; is_active: boolean };

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
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [priceGroupId, setPriceGroupId] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<OrderFulfillmentType>("delivery");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentCommissionPercent, setPaymentCommissionPercent] = useState("0");
  const [billingAddressId, setBillingAddressId] = useState("");
  const [shippingAddressId, setShippingAddressId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [reference, setReference] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [initialStatus, setInitialStatus] = useState<"draft" | "confirmed">("draft");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
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

      const [customerResult, addressesResult, groupsResult, methodsResult, productsResult, taxRulesResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("customer_addresses").select("*").eq("customer_id", customerId).eq("is_active", true).order("address_name"),
        supabase.from("price_groups").select("id, name, system_key, sort_order, is_base_price, is_active, available_for_orders, requires_approval, internal_only").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
        supabase.from("payment_methods").select("id, system_key, name, commission_percent, sort_order, is_active").eq("is_active", true).order("sort_order"),
        supabase.from("products").select("id, sku, name, barcode, status, brand, category, brand_id, category_id").eq("status", "active").order("sku"),
        supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),
      ]);

      const firstError = customerResult.error || addressesResult.error || groupsResult.error || methodsResult.error || productsResult.error || taxRulesResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedCustomer = customerResult.data as Customer;
      const loadedAddresses = (addressesResult.data ?? []) as CustomerAddress[];
      const loadedGroups = (groupsResult.data ?? []) as PriceGroupLookup[];
      const loadedMethods = (methodsResult.data ?? []) as PaymentMethod[];
      const defaultMethod = loadedMethods.find((m) => m.system_key === "cash") ?? loadedMethods[0] ?? null;
      const defaultGroup = loadedGroups.find((group) => group.id === loadedCustomer.price_group_id) ?? loadedGroups.find((group) => group.is_base_price) ?? loadedGroups[0] ?? null;

      setCustomer(loadedCustomer);
      setAddresses(loadedAddresses);
      setPriceGroups(loadedGroups);
      setPaymentMethods(loadedMethods);
      setProducts((productsResult.data ?? []) as Product[]);
      setTaxRules((taxRulesResult.data ?? []) as TaxRule[]);
      setPriceGroupId(defaultGroup?.id || "");
      setFulfillmentType(defaultGroup?.system_key === "pickup_level" ? "pickup" : "delivery");
      setPaymentMethodId(defaultMethod?.id || "");
      setPaymentCommissionPercent(String(Number(defaultMethod?.commission_percent ?? 0)));
      setBillingAddressId(loadedAddresses.find((a) => a.is_default_billing)?.id || "");
      setShippingAddressId(loadedAddresses.find((a) => a.is_default_shipping)?.id || "");
      setIsLoading(false);
    }

    void load();
  }, [customerId]);

  useEffect(() => {
    const rule = taxRules.find((item) => item.fulfillment_type === fulfillmentType && item.is_active && item.tax_rate !== null);
    if (rule) setTaxRate(String(Number(rule.tax_rate)));
  }, [fulfillmentType, taxRules]);

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

    void loadGroupPrices();
    return () => { active = false; };
  }, [priceGroupId]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const priceMap = useMemo(() => new Map(prices.map((p) => [p.product_id, Number(p.amount)])), [prices]);
  const selectedQuantities = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of items) values.set(item.product_id, (values.get(item.product_id) ?? 0) + Number(item.quantity || 0));
    return values;
  }, [items]);
  const selectedPriceGroup = useMemo(() => priceGroups.find((group) => group.id === priceGroupId) ?? null, [priceGroups, priceGroupId]);
  const selectedPaymentMethod = useMemo(() => paymentMethods.find((m) => m.id === paymentMethodId) ?? null, [paymentMethods, paymentMethodId]);
  const selectedTaxRule = useMemo(() => taxRules.find((rule) => rule.fulfillment_type === fulfillmentType) ?? null, [taxRules, fulfillmentType]);
  const defaultCommissionPercent = Number(selectedPaymentMethod?.commission_percent ?? 0);
  const appliedCommissionPercent = Math.min(100, Math.max(0, Number(paymentCommissionPercent || 0)));
  const commissionOverridden = Math.abs(appliedCommissionPercent - defaultCommissionPercent) > 0.0001;

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
    const paymentCommission = orderTotal * appliedCommissionPercent / 100;
    const grandTotal = orderTotal + paymentCommission;
    return { subtotal, tax, orderTotal, paymentCommission, grandTotal };
  }, [items, priceMap, orderDiscount, taxRate, appliedCommissionPercent]);

  function handlePriceGroupChange(groupId: string) {
    setPriceGroupId(groupId);
    const group = priceGroups.find((item) => item.id === groupId);
    if (group?.system_key === "pickup_level") setFulfillmentType("pickup");
    else if (fulfillmentType === "pickup") setFulfillmentType("delivery");
  }

  function handlePaymentMethodChange(methodId: string) {
    setPaymentMethodId(methodId);
    const method = paymentMethods.find((item) => item.id === methodId);
    setPaymentCommissionPercent(String(Number(method?.commission_percent ?? 0)));
  }

  function updateItem(index: number, values: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...values } : item));
  }

  function addProduct(product: Product) {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.product_id === product.id);
      if (existingIndex >= 0) {
        return current.map((item, index) => index === existingIndex
          ? { ...item, quantity: String(Number(item.quantity || 0) + 1) }
          : item);
      }
      return [...current, { product_id: product.id, quantity: "1", discount_percent: "0" }];
    });
  }

  async function saveOrder() {
    setErrorMessage(null);
    if (!customer || !priceGroupId) return setErrorMessage("Customer and price group are required.");
    if (!paymentMethodId) return setErrorMessage("Payment method is required.");
    if (appliedCommissionPercent < 0 || appliedCommissionPercent > 100) return setErrorMessage("Payment commission must be between 0 and 100%.");
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
      p_payment_commission_percent: appliedCommissionPercent,
      p_initial_status: initialStatus,
      p_fulfillment_type: fulfillmentType,
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
    {selectedPriceGroup?.requires_approval && <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">{selectedPriceGroup.name} is a restricted price level. Sales orders using it require Admin approval before confirmation.</div>}

    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Information</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Price Group"><select value={priceGroupId} onChange={(e) => handlePriceGroupChange(e.target.value)} className={inputClass}>{priceGroups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.requires_approval ? " · Approval" : ""}</option>)}</select>{isLoadingPrices && <span className="mt-1 block text-xs text-gray-400">Loading prices...</span>}</Field>
        <Field label="Fulfillment Type"><select value={fulfillmentType} onChange={(e) => setFulfillmentType(e.target.value as OrderFulfillmentType)} className={inputClass}><option value="pickup">Customer Pickup</option><option value="delivery">Delivery</option><option value="delivery_installation">Delivery + Installation</option></select><span className="mt-1 block text-xs text-gray-400">{selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%` : "No active tax rule configured for this fulfillment type."}</span></Field>
        <Field label="Payment Method"><select value={paymentMethodId} onChange={(e) => handlePaymentMethodChange(e.target.value)} className={inputClass}>{paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}{Number(m.commission_percent) > 0 ? ` (+${Number(m.commission_percent).toFixed(2)}%)` : ""}</option>)}</select></Field>
        <Field label="Applied Commission (%)"><div className="flex gap-2"><input type="number" min="0" max="100" step="0.01" value={paymentCommissionPercent} onChange={(e) => setPaymentCommissionPercent(e.target.value)} className={inputClass} /><button type="button" onClick={() => setPaymentCommissionPercent(String(defaultCommissionPercent))} className="whitespace-nowrap rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]">Use Default</button></div><span className={`mt-1 block text-xs ${commissionOverridden ? "text-warning-600 dark:text-warning-400" : "text-gray-400"}`}>Default: {defaultCommissionPercent.toFixed(2)}%{commissionOverridden ? ` • Override applied: ${appliedCommissionPercent.toFixed(2)}%` : ""}</span></Field>
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
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Products</h2><p className="mt-1 text-sm text-gray-500">Search and add products from the picker. Prices resolve from the selected price group.</p></div><button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-theme-xs hover:bg-brand-600">Add Products</button></div>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Product", "Qty", "Unit Price", "Discount %", "Line Total", ""].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No products added yet. Use <span className="font-medium text-gray-700 dark:text-gray-300">Add Products</span> to search and select items.</td></tr> : items.map((item, index) => {
          const product = productMap.get(item.product_id);
          const price = priceMap.get(item.product_id) ?? 0;
          const total = Number(item.quantity || 0) * price * (1 - Number(item.discount_percent || 0) / 100);
          return <tr key={item.product_id}><td className="min-w-[360px] px-4 py-3"><div className="text-sm font-semibold text-gray-800 dark:text-white/90">{product?.sku ?? "Unknown product"}</div><div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{product?.name ?? item.product_id}</div></td><td className="w-[110px] px-4 py-3"><input inputMode="decimal" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} className={inputClass} /></td><td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{priceMap.has(item.product_id) ? money(price) : "No price"}</td><td className="w-[130px] px-4 py-3"><input inputMode="decimal" value={item.discount_percent} onChange={(e) => updateItem(index, { discount_percent: e.target.value })} className={inputClass} /></td><td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{money(total)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="text-xs font-medium text-error-600">Remove</button></td></tr>;
        })}
      </tbody></table></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-8"><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes"><textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field><Field label="Internal Notes"><textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field></div></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Total</h2><div className="mt-4 space-y-3 text-sm"><Row label="Lines after discount" value={money(preview.subtotal)} /><Row label="Order discount" value={`-${money(Number(orderDiscount || 0))}`} /><Row label="Tax" value={money(preview.tax)} /><Row label="Order Total" value={money(preview.orderTotal)} />{preview.paymentCommission > 0 && <Row label={`${selectedPaymentMethod?.name || "Payment"} Commission (${appliedCommissionPercent.toFixed(2)}%)`} value={money(preview.paymentCommission)} />}<div className="border-t border-gray-200 pt-3 dark:border-gray-800"><Row label="Grand Total" value={money(preview.grandTotal)} strong /></div>{commissionOverridden && <p className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">Payment commission overridden from {defaultCommissionPercent.toFixed(2)}% to {appliedCommissionPercent.toFixed(2)}% for this order only.</p>}</div><button type="button" disabled={isSaving || isLoadingPrices || !paymentMethodId} onClick={saveOrder} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{isSaving ? "Creating..." : initialStatus === "confirmed" ? "Create & Confirm" : "Create Draft"}</button></div>
    </div>

    <OrderProductPicker
      isOpen={isProductPickerOpen}
      onClose={() => setIsProductPickerOpen(false)}
      products={products}
      selectedQuantities={selectedQuantities}
      priceMap={priceMap}
      onAdd={addProduct}
      disableWithoutPrice
    />
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>; }
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4"><span className="text-gray-500">{label}</span><span className={strong ? "text-lg font-semibold text-gray-800 dark:text-white/90" : "font-medium text-gray-800 dark:text-white/90"}>{value}</span></div>; }
