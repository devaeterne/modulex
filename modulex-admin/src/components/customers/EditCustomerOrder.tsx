"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import OrderProductPicker, { type OrderPickerProduct } from "@/components/customers/OrderProductPicker";
import {
  getCustomerOrderRevisionPolicy,
  loadEditOrderContext,
  loadOrderPrices,
  updateCustomerOrder,
  type OrderPriceRow,
  type OrderTaxRule,
} from "@/lib/customers/order-domain";
import type { UserRole } from "@/lib/supabase/profile";
import type { Customer, CustomerAddress, CustomerOrder, OrderFulfillmentType, PaymentMethod, PriceGroupLookup } from "@/lib/customers/types";

type Product = OrderPickerProduct;
type PriceRow = OrderPriceRow;
type DraftItem = { id?: string; product_id: string; quantity: string; unit_price: string; discount_percent: string };
type TaxRule = OrderTaxRule;

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
}

function resolveOrderLineUnitPrice(item: DraftItem, product: Product | undefined, priceMap: Map<string, number>) {
  if (product?.pricing_model === "price_group") return priceMap.get(item.product_id);
  if (product?.pricing_model === "countertop_material_band" && item.id) {
    const storedPrice = Number(item.unit_price || 0);
    return Number.isFinite(storedPrice) && storedPrice >= 0 ? storedPrice : undefined;
  }
  return undefined;
}

export default function EditCustomerOrder() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const customerId = params.id;
  const orderId = params.orderId;

  const [role, setRole] = useState<UserRole | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupLookup[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);

  const [priceGroupId, setPriceGroupId] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<OrderFulfillmentType>("delivery");
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

  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const context = await loadEditOrderContext(customerId, orderId);
        if (!active) return;

        const loadedOrder = context.order;
        setRole(context.role);
        setCustomer(context.customer);
        setOrder(loadedOrder);
        setAddresses(context.addresses);
        setPriceGroups(context.priceGroups);
        setPaymentMethods(context.paymentMethods);
        setProducts(context.products as Product[]);
        setTaxRules(context.taxRules);
        setItems(context.items.map((item) => ({
          id: item.id,
          product_id: item.product_id ?? "",
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
          discount_percent: String(item.discount_percent),
        })));

        setPriceGroupId(loadedOrder.price_group_id ?? "");
        setFulfillmentType(loadedOrder.fulfillment_type || "delivery");
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
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load editable order.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [customerId, orderId]);

  useEffect(() => {
    if (!priceGroupId || !order) return;
    const currencyCode = order.currency_code;
    let active = true;

    async function loadPrices() {
      setIsLoadingPrices(true);
      try {
        const data = await loadOrderPrices(priceGroupId, currencyCode);
        if (!active) return;
        setPrices(data);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load order prices.");
      } finally {
        if (active) setIsLoadingPrices(false);
      }
    }

    void loadPrices();
    return () => { active = false; };
  }, [priceGroupId, order]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const activeProducts = useMemo(() => products.filter((product) => product.status === "active"), [products]);
  const priceMap = useMemo(() => new Map(prices.map((p) => [p.product_id, Number(p.amount)])), [prices]);
  const selectedQuantities = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of items) values.set(item.product_id, (values.get(item.product_id) ?? 0) + Number(item.quantity || 0));
    return values;
  }, [items]);
  const selectedPriceGroup = useMemo(() => priceGroups.find((group) => group.id === priceGroupId) ?? null, [priceGroups, priceGroupId]);
  const selectedPaymentMethod = useMemo(() => paymentMethods.find((m) => m.id === paymentMethodId) ?? null, [paymentMethods, paymentMethodId]);
  const selectedTaxRule = useMemo(() => taxRules.find((rule) => rule.fulfillment_type === fulfillmentType) ?? null, [taxRules, fulfillmentType]);
  const revisionPolicy = useMemo(() => order && role ? getCustomerOrderRevisionPolicy(order.status, role) : null, [order, role]);

  const preview = useMemo(() => {
    let subtotal = 0;
    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity || 0));
      const price = Math.max(0, resolveOrderLineUnitPrice(item, productMap.get(item.product_id), priceMap) ?? 0);
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
  }, [items, productMap, priceMap, orderDiscount, taxRate, appliedCommission]);

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

      const groupPrice = priceMap.get(product.id);
      return [...current, {
        product_id: product.id,
        quantity: "1",
        unit_price: groupPrice !== undefined ? String(groupPrice) : "0",
        discount_percent: "0",
      }];
    });
  }

  function handlePriceGroupChange(groupId: string) {
    setPriceGroupId(groupId);
    const group = priceGroups.find((item) => item.id === groupId);
    if (group?.system_key === "pickup_level") handleFulfillmentChange("pickup");
    else if (fulfillmentType === "pickup") handleFulfillmentChange("delivery");
  }

  function handleFulfillmentChange(next: OrderFulfillmentType) {
    setFulfillmentType(next);
    const rule = taxRules.find((item) => item.fulfillment_type === next && item.is_active && item.tax_rate !== null);
    if (rule) setTaxRate(String(Number(rule.tax_rate)));
  }

  async function saveRevision() {
    setErrorMessage(null);
    if (!order || !revisionPolicy?.canEdit) return setErrorMessage(revisionPolicy?.reason ?? "This order cannot be revised.");
    if (!priceGroupId || !paymentMethodId) return setErrorMessage("Price group and payment method are required.");
    if (items.length === 0) return setErrorMessage("At least one product line is required.");
    if (Number(appliedCommission) < 0 || Number(appliedCommission) > 100) return setErrorMessage("Applied commission must be between 0 and 100%.");

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (product?.pricing_model === "countertop_material_band" && !item.id) return setErrorMessage("Countertop Material Band products must be configured in the Countertop workspace.");
      if (product?.pricing_model === "none") return setErrorMessage("No Commercial Pricing products cannot be added to customer orders.");
      if (!item.product_id) return setErrorMessage("Select a product for every line.");
      if (Number(item.quantity) <= 0) return setErrorMessage("Quantity must be greater than zero.");
      if (product?.pricing_model === "price_group" && !priceMap.has(item.product_id)) return setErrorMessage(`No current Price Group price exists for ${product.sku}.`);
      if (resolveOrderLineUnitPrice(item, product, priceMap) === undefined) return setErrorMessage("The selected product does not have a valid commercial price for this order.");
      if (Number(item.discount_percent) < 0 || Number(item.discount_percent) > 100) return setErrorMessage("Line discount must be between 0 and 100%.");
    }

    setIsSaving(true);
    try {
      const revision = await updateCustomerOrder({
        orderId: order.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          quantity: item.quantity,
          unitPrice: String(resolveOrderLineUnitPrice(item, productMap.get(item.product_id), priceMap) ?? 0),
          discountPercent: item.discount_percent,
        })),
        priceGroupId,
        billingAddressId,
        shippingAddressId,
        expectedDeliveryDate: expectedDate,
        customerReference: reference,
        customerNotes,
        internalNotes,
        taxRate,
        orderDiscountAmount: orderDiscount,
        paymentMethodId,
        paymentCommissionPercent: appliedCommission,
        revisionReason,
        fulfillmentType,
      });

      if (revision === 0) {
        router.push(`/customers/${customerId}/orders/${orderId}?approval=requested`);
        return;
      }
      router.push(`/customers/${customerId}/orders/${orderId}?revision=${revision}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save order revision.");
      setIsSaving(false);
    }
  }

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><p className="text-sm text-gray-500">Loading editable order...</p></div>;
  if (!customer || !order) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700">{errorMessage || "Order not found."}</div>;
  if (!revisionPolicy) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700">Unable to resolve order revision policy.</div>;
  if (!revisionPolicy.canEdit) return <div className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Revision Locked · {order.order_number}</h1><p className="mt-1 text-sm text-gray-500">{customer.name} • {revisionPolicy.reason}</p></div><Link href={`/customers/${customerId}/orders/${orderId}`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Back to Order</Link></div><div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm text-warning-800 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300"><p className="font-medium">Commercial revision is disabled for status {order.status.replaceAll("_", " ")}.</p><p className="mt-2">Order number, customer, status, currency, snapshots, calculated totals, and system metadata remain immutable. Status changes continue through the dedicated status workflow.</p></div></div>;

  const defaultCommission = Number(selectedPaymentMethod?.commission_percent ?? 0);
  const commissionOverridden = Math.abs(Number(appliedCommission || 0) - defaultCommission) > 0.0001;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Edit {order.order_number}</h1><p className="mt-1 text-sm text-gray-500">{customer.name} • {revisionPolicy.reason}</p></div>
      <Link href={`/customers/${customerId}/orders/${orderId}`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Back to Order</Link>
    </div>

    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
    {selectedPriceGroup?.requires_approval && <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">{selectedPriceGroup.name} is a restricted price group. Sales use requires approval.</div>}

    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Information</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Price Group"><select value={priceGroupId} onChange={(e) => handlePriceGroupChange(e.target.value)} className={inputClass}>{priceGroups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.requires_approval ? " · Approval" : ""}</option>)}</select>{isLoadingPrices && <span className="mt-1 block text-xs text-gray-400">Loading group prices...</span>}</Field>
        <Field label="Fulfillment Type"><select value={fulfillmentType} onChange={(e) => handleFulfillmentChange(e.target.value as OrderFulfillmentType)} className={inputClass}><option value="pickup">Customer Pickup</option><option value="delivery">Delivery</option><option value="delivery_installation">Delivery + Installation</option></select><span className="mt-1 block text-xs text-gray-400">{selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%` : "No active tax rule configured."}</span></Field>
        <Field label="Payment Method"><select value={paymentMethodId} onChange={(e) => { const id = e.target.value; setPaymentMethodId(id); const method = paymentMethods.find((m) => m.id === id); setAppliedCommission(String(Number(method?.commission_percent ?? 0))); }} className={inputClass}>{paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Applied Commission (%)"><div className="flex gap-2"><input value={appliedCommission} onChange={(e) => setAppliedCommission(e.target.value)} inputMode="decimal" className={inputClass} /><button type="button" onClick={() => setAppliedCommission(String(defaultCommission))} className="whitespace-nowrap rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Use Default</button></div><span className={`mt-1 block text-xs ${commissionOverridden ? "text-warning-600" : "text-gray-400"}`}>Default {defaultCommission.toFixed(2)}%{commissionOverridden ? " · Sales override requires approval" : ""}</span></Field>
        <Field label="Expected Delivery"><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Customer Reference"><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} /></Field>
        <Field label="Billing Address"><select value={billingAddressId} onChange={(e) => setBillingAddressId(e.target.value)} className={inputClass}><option value="">None</option>{addresses.filter((a) => ["billing","both"].includes(a.address_type)).map((a) => <option key={a.id} value={a.id}>{a.address_name} — {a.city}</option>)}</select></Field>
        <Field label="Shipping Address"><select value={shippingAddressId} onChange={(e) => setShippingAddressId(e.target.value)} className={inputClass}><option value="">None</option>{addresses.filter((a) => ["shipping","both"].includes(a.address_type)).map((a) => <option key={a.id} value={a.id}>{a.address_name} — {a.city}</option>)}</select></Field>
        <Field label="Order Discount ($)"><input value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} inputMode="decimal" className={inputClass} /><span className="mt-1 block text-xs text-gray-400">Sales discounts are approval-controlled.</span></Field>
        <Field label="Tax Rate (%)"><input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" className={inputClass} /><span className="mt-1 block text-xs text-gray-400">Tax overrides against an active fulfillment rule require approval.</span></Field>
      </div>
    </div>

    <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800"><div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Products</h2><p className="mt-1 text-sm text-gray-500">Prices are resolved by the canonical pricing route and are read-only. Line discounts remain approval-controlled for Sales.</p></div><button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-theme-xs hover:bg-brand-600">Add Products</button></div>
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Product","Qty","Server Price","Discount %","Line Total",""].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{items.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No products added. Use <span className="font-medium text-gray-700 dark:text-gray-300">Add Products</span> to select items.</td></tr> : items.map((item, index) => { const product = productMap.get(item.product_id); const resolvedPrice = resolveOrderLineUnitPrice(item, product, priceMap); const total = Number(item.quantity || 0) * Number(resolvedPrice ?? 0) * (1 - Number(item.discount_percent || 0) / 100); return <tr key={item.product_id}><td className="min-w-[340px] px-4 py-3"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-gray-800 dark:text-white/90">{product?.sku ?? "Unknown product"}</span>{product?.status === "inactive" && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">Inactive</span>}</div><div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{product?.name ?? item.product_id}</div></td><td className="w-[110px] px-4 py-3"><input value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} inputMode="decimal" className={inputClass} /></td><td className="min-w-[180px] px-4 py-3"><span className="text-sm font-semibold text-gray-800 dark:text-white/90">{resolvedPrice === undefined ? "Unavailable" : money(resolvedPrice)}</span><span className="mt-1 block text-xs text-gray-400">{product?.pricing_model === "countertop_material_band" ? "Countertop · configured price" : "Price Group · server authoritative"}</span></td><td className="w-[130px] px-4 py-3"><input value={item.discount_percent} onChange={(e) => updateItem(index, { discount_percent: e.target.value })} inputMode="decimal" className={inputClass} /></td><td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{money(total)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="text-xs font-medium text-error-600">Remove</button></td></tr>; })}</tbody></table></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes"><textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field><Field label="Internal Notes"><textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></Field></div></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><Field label="Revision Reason"><input value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} placeholder="e.g. Quantity changed after customer request" className={inputClass} /></Field><p className="mt-2 text-xs text-gray-400">Recommended. Sales revisions from Confirmed through Ready for Shipment stay pending until Admin approval; Shipped and later orders are revision-locked.</p></div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Revised Total</h2><div className="mt-4 space-y-3 text-sm"><Row label="Lines after discount" value={money(preview.subtotal)} /><Row label="Order discount" value={`-${money(Number(orderDiscount || 0))}`} /><Row label="Tax" value={money(preview.tax)} /><Row label="Order Total" value={money(preview.orderTotal)} />{preview.commission > 0 && <Row label={`Payment Commission (${Number(appliedCommission || 0).toFixed(2)}%)`} value={money(preview.commission)} />}<div className="border-t border-gray-200 pt-3 dark:border-gray-800"><Row label="Grand Total" value={money(preview.grandTotal)} strong /></div></div><button type="button" disabled={isSaving || isLoadingPrices || !revisionPolicy.canEdit} onClick={saveRevision} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-40">{isSaving ? "Saving..." : revisionPolicy.mode === "approval" ? "Submit for Approval" : "Save Revision"}</button></div>
    </div>

    <OrderProductPicker
      isOpen={isProductPickerOpen}
      onClose={() => setIsProductPickerOpen(false)}
      products={activeProducts}
      selectedQuantities={selectedQuantities}
      priceMap={priceMap}
      onAdd={addProduct}
      currencyCode={order.currency_code}
      disableWithoutPrice
    />
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>; }
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4"><span className="text-gray-500">{label}</span><span className={strong ? "text-lg font-semibold text-gray-800 dark:text-white/90" : "font-medium text-gray-800 dark:text-white/90"}>{value}</span></div>; }