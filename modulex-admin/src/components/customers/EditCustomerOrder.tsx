"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import SummaryRow from "@/components/common/SummaryRow";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";
import CountertopLineDetails from "@/components/customers/CountertopLineDetails";
import ManualServiceLineModal from "@/components/customers/ManualServiceLineModal";
import OrderProductPicker, { type OrderPickerProduct } from "@/components/customers/OrderProductPicker";
import ServiceLineDetails from "@/components/customers/ServiceLineDetails";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { PlusIcon } from "@/icons";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getCustomerOrderRevisionPolicy,
  loadEditOrderContext,
  loadOrderPrices,
  removeCountertopOrderItem,
  updateCustomerOrder,
  type OrderPriceRow,
  type OrderTaxRule,
} from "@/lib/customers/order-domain";
import type { UserRole } from "@/lib/supabase/profile";
import type {
  CountertopLineSummary,
  Customer,
  CustomerAddress,
  CustomerOrder,
  CustomerOrderItem,
  OrderFulfillmentType,
  OrderPricingModel,
  PaymentMethod,
  PriceGroupLookup,
} from "@/lib/customers/types";

type Product = OrderPickerProduct;
type PriceRow = OrderPriceRow;
type DraftItem = { id?: string;
  product_id: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  pricing_model: OrderPricingModel | null;
  line_note: string;
};
type TaxRule = OrderTaxRule;

function money(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
  }
}

function operationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function pricingModelFor(item: DraftItem, product: Product | undefined): OrderPricingModel | null {
  return item.pricing_model ?? product?.pricing_model ?? null;
}

function resolveOrderLineUnitPrice(item: DraftItem, product: Product | undefined, priceMap: Map<string, number>) {
  const model = pricingModelFor(item, product);
  if (model === "price_group") return priceMap.get(item.product_id);
  if ((model === "countertop_material_band" || model === "manual_service") && (item.id || model === "manual_service")) {
    const storedPrice = Number(item.unit_price || 0);
    return Number.isFinite(storedPrice) && storedPrice >= 0 ? storedPrice : undefined;
  }
  return undefined;
}

function mapDraftItem(item: CustomerOrderItem): DraftItem {
  return {
    id: item.id,
    product_id: item.product_id ?? "",
    quantity: String(item.quantity),
    unit_price: String(item.unit_price),
    discount_percent: String(item.discount_percent),
    pricing_model: item.pricing_model_snapshot ?? null,
    line_note: item.line_note ?? "",
  };
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div><Label>{label}</Label>{children}{hint ? <FormHint>{hint}</FormHint> : null}</div>;
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
  const [countertopSummaries, setCountertopSummaries] = useState<CountertopLineSummary[]>([]);
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
  const [isCountertopOpen, setIsCountertopOpen] = useState(false);
  const [countertopEditItemId, setCountertopEditItemId] = useState<string | null>(null);
  const [countertopRemoveItemId, setCountertopRemoveItemId] = useState<string | null>(null);
  const [countertopRemoveReason, setCountertopRemoveReason] = useState("");
  const [isRemovingCountertop, setIsRemovingCountertop] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [serviceEditIndex, setServiceEditIndex] = useState<number | null>(null);
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
        setItems(context.items.map(mapDraftItem));
        setCountertopSummaries(context.countertopSummaries);
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
        if (active) setErrorMessage(operationErrorMessage(error, "Unable to load editable order."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [customerId, orderId]);

  useEffect(() => {
    if (!priceGroupId || !order) return;
    const orderCurrency = order.currency_code;
    let active = true;
    async function loadPrices() {
      setIsLoadingPrices(true);
      try {
        const data = await loadOrderPrices(priceGroupId, orderCurrency);
        if (active) setPrices(data);
      } catch (error) {
        if (active) setErrorMessage(operationErrorMessage(error, "Unable to load order prices."));
      } finally {
        if (active) setIsLoadingPrices(false);
      }
    }
    void loadPrices();
    return () => { active = false; };
  }, [priceGroupId, order]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const activeProducts = useMemo(() => products.filter((product) => product.status === "active"), [products]);
  const priceMap = useMemo(() => new Map(prices.map((price) => [price.product_id, Number(price.amount)])), [prices]);
  const summariesByItemId = useMemo(() => new Map(countertopSummaries.map((summary) => [summary.orderItemId, summary])), [countertopSummaries]);
  const selectedQuantities = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of items) values.set(item.product_id, (values.get(item.product_id) ?? 0) + Number(item.quantity || 0));
    return values;
  }, [items]);
  const selectedPriceGroup = useMemo(() => priceGroups.find((group) => group.id === priceGroupId) ?? null, [priceGroups, priceGroupId]);
  const selectedPaymentMethod = useMemo(() => paymentMethods.find((method) => method.id === paymentMethodId) ?? null, [paymentMethods, paymentMethodId]);
  const selectedTaxRule = useMemo(() => taxRules.find((rule) => rule.fulfillment_type === fulfillmentType) ?? null, [taxRules, fulfillmentType]);
  const revisionPolicy = useMemo(() => order && role ? getCustomerOrderRevisionPolicy(order.status, role) : null, [order, role]);
  const canManageCountertop = role !== null && hasPermission(role, "orders.manage");
  const serviceProduct = useMemo(
    () => activeProducts.find((product) => product.sku === "SERVICE" && product.product_type_code === "SERVICE" && product.pricing_model === "manual_service") ?? null,
    [activeProducts],
  );
  const currency = order?.currency_code || "USD";
  const countertopEditItem = countertopEditItemId ? items.find((item) => item.id === countertopEditItemId) ?? null : null;
  const countertopRemoveItem = countertopRemoveItemId ? items.find((item) => item.id === countertopRemoveItemId) ?? null : null;
  const countertopRemoveSummary = countertopRemoveItemId ? summariesByItemId.get(countertopRemoveItemId) ?? null : null;

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
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  function addProduct(product: Product) {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.product_id === product.id && pricingModelFor(item, product) === "price_group");
      if (existingIndex >= 0) return current.map((item, index) => index === existingIndex ? { ...item, quantity: String(Number(item.quantity || 0) + 1) } : item);
      const groupPrice = priceMap.get(product.id);
      return [...current, {
        product_id: product.id,
        quantity: "1",
        unit_price: groupPrice !== undefined ? String(groupPrice) : "0",
        discount_percent: "0",
        pricing_model: product.pricing_model,
        line_note: "",
      }];
    });
  }

  function openNewService() {
    setErrorMessage(null);
    if (!serviceProduct) {
      setErrorMessage("The canonical active SERVICE product is missing. Apply the reviewed Service reference-data migration before using this action.");
      return;
    }
    setServiceEditIndex(null);
    setIsServiceModalOpen(true);
  }

  function openExistingService(index: number) {
    setServiceEditIndex(index);
    setIsServiceModalOpen(true);
  }

  function saveServiceLine(value: { lineNote: string; unitPrice: number }) {
    if (serviceEditIndex !== null) {
      updateItem(serviceEditIndex, { line_note: value.lineNote, unit_price: String(value.unitPrice), quantity: "1", pricing_model: "manual_service" });
    } else if (serviceProduct) {
      setItems((current) => [...current, {
        product_id: serviceProduct.id,
        quantity: "1",
        unit_price: String(value.unitPrice),
        discount_percent: "0",
        pricing_model: "manual_service",
        line_note: value.lineNote,
      }]);
    }
    setIsServiceModalOpen(false);
    setServiceEditIndex(null);
  }

  async function handleCountertopAttached(createdItemId: string) {
    try {
      const context = await loadEditOrderContext(customerId, orderId);
      const createdItem = context.items.find((item) => item.id === createdItemId);
      if (!createdItem) throw new Error("The countertop line could not be reloaded.");
      setOrder(context.order);
      setProducts(context.products as Product[]);
      setCountertopSummaries(context.countertopSummaries);
      setItems((current) => current.some((item) => item.id === createdItemId)
        ? current.map((item) => item.id === createdItemId ? mapDraftItem(createdItem) : item)
        : [...current, mapDraftItem(createdItem)]);
      setIsCountertopOpen(false);
      setCountertopEditItemId(null);
    } catch (error) {
      setErrorMessage(operationErrorMessage(error, "Countertop was saved but the order line could not be refreshed."));
    }
  }

  function openCountertopReplacement(itemId: string) {
    setErrorMessage(null);
    setIsCountertopOpen(false);
    setCountertopEditItemId(itemId);
  }

  function openCountertopRemoval(itemId: string) {
    setErrorMessage(null);
    setCountertopRemoveReason("");
    setCountertopRemoveItemId(itemId);
  }

  function closeCountertopRemoval() {
    if (isRemovingCountertop) return;
    setCountertopRemoveItemId(null);
    setCountertopRemoveReason("");
  }

  async function confirmCountertopRemoval() {
    if (!countertopRemoveItemId || !order || order.status !== "draft") return;
    setIsRemovingCountertop(true);
    setErrorMessage(null);
    try {
      const removedFromOrderId = await removeCountertopOrderItem(countertopRemoveItemId, countertopRemoveReason);
      if (removedFromOrderId !== order.id) throw new Error("Countertop removal returned an unexpected order.");
      const context = await loadEditOrderContext(customerId, orderId);
      setOrder(context.order);
      setProducts(context.products as Product[]);
      setCountertopSummaries(context.countertopSummaries);
      setItems(context.items.map(mapDraftItem));
      setCountertopRemoveItemId(null);
      setCountertopRemoveReason("");
    } catch (error) {
      setErrorMessage(operationErrorMessage(error, "Unable to remove Countertop from this order."));
    } finally {
      setIsRemovingCountertop(false);
    }
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
    if (items.length === 0) return setErrorMessage("At least one order line is required.");
    if (Number(appliedCommission) < 0 || Number(appliedCommission) > 100) return setErrorMessage("Applied commission must be between 0 and 100%.");

    for (const item of items) {
      const product = productMap.get(item.product_id);
      const model = pricingModelFor(item, product);
      if (model === "countertop_material_band" && !item.id) return setErrorMessage("Countertop Material Band products must be configured through the Countertop action.");
      if (model === "none") return setErrorMessage("No Commercial Pricing products cannot be added to customer orders.");
      if (!item.product_id) return setErrorMessage("Select a product for every line.");
      if (Number(item.quantity) <= 0) return setErrorMessage("Quantity must be greater than zero.");
      if (model === "manual_service") {
        if (Number(item.quantity) !== 1) return setErrorMessage("Service quantity must remain fixed at 1.");
        if (!item.line_note.trim()) return setErrorMessage("Service detail is required.");
        const servicePrice = Number(item.unit_price);
        if (!Number.isFinite(servicePrice) || servicePrice < 0) return setErrorMessage("Service price must be a nonnegative number.");
      }
      if (model === "price_group" && !priceMap.has(item.product_id)) return setErrorMessage(`No current Price Group price exists for ${product?.sku ?? "selected product"}.`);
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
          pricingModel: pricingModelFor(item, productMap.get(item.product_id)),
          lineNote: item.line_note,
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
      setErrorMessage(operationErrorMessage(error, "Unable to save order revision."));
      setIsSaving(false);
    }
  }

  if (isLoading) return <ComponentCard title="Edit Order" desc="Loading the saved order and pricing context…"><FormHint>Loading editable order…</FormHint></ComponentCard>;
  if (!customer || !order) return <Alert variant="error" title="Unable to load order" message={errorMessage || "Order not found."} />;
  if (!revisionPolicy) return <Alert variant="error" title="Unable to edit order" message="Unable to resolve order revision policy." />;

  if (!revisionPolicy.canEdit) {
    return <div className="space-y-5"><ComponentCard title={`Revision Locked · ${order.order_number}`} desc={`${customer.name} · ${revisionPolicy.reason}`} headerAction={<Button variant="outline" onClick={() => router.push(`/customers/${customerId}/orders/${orderId}`)}>Back to Order</Button>}><Alert variant="warning" title="Commercial revision disabled" message={`Commercial revision is disabled for status ${order.status.replaceAll("_", " ")}. Order identity, snapshots and calculated totals remain immutable; status changes continue through the dedicated status workflow.`} /></ComponentCard></div>;
  }
  const defaultCommission = Number(selectedPaymentMethod?.commission_percent ?? 0);
  const commissionOverridden = Math.abs(Number(appliedCommission || 0) - defaultCommission) > 0.0001;
  const taxHint = selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%` : "No active tax rule configured.";
  const editingService = serviceEditIndex === null ? null : items[serviceEditIndex] ?? null;

  return (
    <div className="space-y-5">
      {errorMessage ? <Alert variant="error" title="Order revision failed" message={errorMessage} /> : null}
      {selectedPriceGroup?.requires_approval ? <Alert variant="warning" title="Approval required" message={`${selectedPriceGroup.name} is a restricted price group. Sales use requires approval.`} /> : null}

      <ComponentCard title={`Edit ${order.order_number}`} desc={`${customer.name} · ${revisionPolicy.reason}`} headerAction={<Button variant="outline" onClick={() => router.push(`/customers/${customerId}/orders/${orderId}`)}>Back to Order</Button>}>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Field label="Price Group" hint={isLoadingPrices ? "Loading group prices…" : undefined}><Select options={priceGroups.map((group) => ({ value: group.id, label: `${group.name}${group.requires_approval ? " · Approval" : ""}` }))} value={priceGroupId} onChange={handlePriceGroupChange} /></Field>
          <Field label="Fulfillment Type" hint={taxHint}><Select options={[{ value: "pickup", label: "Customer Pickup" }, { value: "delivery", label: "Delivery" }, { value: "delivery_installation", label: "Delivery + Installation" }]} value={fulfillmentType} onChange={(value) => handleFulfillmentChange(value as OrderFulfillmentType)} /></Field>
          <Field label="Payment Method"><Select options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))} value={paymentMethodId} onChange={(id) => { setPaymentMethodId(id); const method = paymentMethods.find((item) => item.id === id); setAppliedCommission(String(Number(method?.commission_percent ?? 0))); }} /></Field>
          <Field label="Applied Commission (%)" hint={`Default ${defaultCommission.toFixed(2)}%${commissionOverridden ? " · Sales override requires approval" : ""}`}><div className="flex gap-2"><div className="min-w-0 flex-1"><Input inputMode="decimal" value={appliedCommission} onChange={(event) => setAppliedCommission(event.target.value)} /></div><Button size="sm" variant="outline" onClick={() => setAppliedCommission(String(defaultCommission))}>Use Default</Button></div></Field>
          <Field label="Expected Delivery"><Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></Field>
          <Field label="Customer Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Field label="Billing Address"><Select options={addresses.filter((address) => ["billing", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={billingAddressId} placeholder="None" allowEmpty onChange={setBillingAddressId} /></Field>
          <Field label="Shipping Address"><Select options={addresses.filter((address) => ["shipping", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={shippingAddressId} placeholder="None" allowEmpty onChange={setShippingAddressId} /></Field>
          <Field label={`Order Discount (${currency})`} hint="Sales discounts are approval-controlled."><Input inputMode="decimal" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} /></Field>
          <Field label="Tax Rate (%)" hint="Tax overrides against an active fulfillment rule require approval."><Input inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Products"
        desc="Cabinet prices use the canonical Price Group route. Configured Countertops use dedicated Replace/Remove actions; Service lines keep their saved authoritative commercial values."
        headerAction={<div className="flex flex-wrap justify-end gap-2">{canManageCountertop && order.status === "draft" ? <Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} onClick={() => { setCountertopEditItemId(null); setIsCountertopOpen(true); }}>Countertop</Button> : null}<Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={() => setIsProductPickerOpen(true)}>Cabinet</Button><Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} onClick={openNewService}>Service</Button></div>}
      >
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin"><TableRow>{["Product", "Qty", "Server Price", "Discount %", "Line Total", ""].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={6}>No order lines. Choose Countertop, Cabinet, or Service.</TableStateRow> : items.map((item, index) => {
                const product = productMap.get(item.product_id);
                const model = pricingModelFor(item, product);
                const isService = model === "manual_service";
                const resolvedPrice = resolveOrderLineUnitPrice(item, product, priceMap);
                const total = Number(item.quantity || 0) * Number(resolvedPrice ?? 0) * (1 - Number(item.discount_percent || 0) / 100);
                const countertopSummary = item.id ? summariesByItemId.get(item.id) : null;
                const isConfiguredCountertop = Boolean(item.id && countertopSummary);
                const canMutateConfiguredCountertop = isConfiguredCountertop && canManageCountertop && order.status === "draft";
                return (
                  <TableRow key={item.id ?? `${item.product_id}-${index}`}>
                    <TableCell variant="admin" className="min-w-[360px]"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{product?.sku ?? "Historical product"}</span>{product?.status === "inactive" ? <Badge size="sm" color="warning">Inactive</Badge> : null}</div><FormHint>{product?.name ?? item.product_id}</FormHint><CountertopLineDetails summary={countertopSummary} /><ServiceLineDetails lineNote={item.line_note} /></TableCell>
                    <TableCell variant="admin" className="w-28">{isConfiguredCountertop ? <FormHint>{item.quantity} · configured</FormHint> : isService ? <FormHint>1 · fixed</FormHint> : <Input ariaLabel={`${product?.sku ?? "Product"} quantity`} inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />}</TableCell>
                    <TableCell variant="admin" className="min-w-[180px]"><span className="font-semibold">{resolvedPrice === undefined ? "Unavailable" : money(resolvedPrice, currency)}</span><FormHint>{model === "countertop_material_band" ? "Countertop · configured price" : model === "manual_service" ? "Service · explicit price" : "Price Group · server authoritative"}</FormHint></TableCell>
                    <TableCell variant="admin" className="w-32">{isConfiguredCountertop ? <FormHint>{Number(item.discount_percent || 0).toFixed(2)}% · configured</FormHint> : <Input ariaLabel={`${product?.sku ?? "Product"} discount percent`} inputMode="decimal" value={item.discount_percent} onChange={(event) => updateItem(index, { discount_percent: event.target.value })} />}</TableCell>
                    <TableCell variant="admin" className="font-semibold">{money(total, currency)}</TableCell>
                    <TableCell variant="admin" className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isConfiguredCountertop ? (
                          canMutateConfiguredCountertop && item.id ? <>
                            <Button size="sm" variant="outline" onClick={() => openCountertopReplacement(item.id!)}>Replace Countertop</Button>
                            <Button size="sm" variant="danger" onClick={() => openCountertopRemoval(item.id!)}>Remove Countertop</Button>
                          </> : <FormHint>Countertop changes are Draft-only.</FormHint>
                        ) : <>
                          {isService ? <Button size="sm" variant="outline" onClick={() => openExistingService(index)}>Edit Service</Button> : null}
                          <Button size="sm" variant="danger" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                        </>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      {isCountertopOpen ? <CountertopConfigurator orderId={order.id} orderContext={{ orderNumber: order.order_number }} onAttached={handleCountertopAttached} onClose={() => setIsCountertopOpen(false)} /> : null}
      {countertopEditItemId ? <CountertopConfigurator orderId={order.id} orderItemId={countertopEditItemId} orderContext={{ orderNumber: order.order_number, sku: productMap.get(countertopEditItem?.product_id ?? "")?.sku, productName: productMap.get(countertopEditItem?.product_id ?? "")?.name }} onAttached={handleCountertopAttached} onClose={() => setCountertopEditItemId(null)} /> : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8"><ComponentCard title="Notes" desc="Customer-facing and internal context for this revision."><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes"><TextArea rows={5} value={customerNotes} onChange={setCustomerNotes} /></Field><Field label="Internal Notes"><TextArea rows={5} value={internalNotes} onChange={setInternalNotes} /></Field></div></ComponentCard><ComponentCard title="Revision Reason" desc="Record why the commercial order changed."><Field label="Reason" hint="Recommended. Sales revisions from Confirmed through Ready for Shipment stay pending until Admin approval; Shipped and later orders are revision-locked."><Input value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} placeholder="e.g. Quantity changed after customer request" /></Field></ComponentCard></div>
        <div className="xl:col-span-4"><ComponentCard title="Revised Total" desc="Preview; the server remains authoritative when the revision is saved."><div className="space-y-3"><SummaryRow label="Lines after discount" value={money(preview.subtotal, currency)} /><SummaryRow label="Order discount" value={`-${money(Number(orderDiscount || 0), currency)}`} /><SummaryRow label="Tax" value={money(preview.tax, currency)} /><SummaryRow label="Order Total" value={money(preview.orderTotal, currency)} />{preview.commission > 0 ? <SummaryRow label={`Payment Commission (${Number(appliedCommission || 0).toFixed(2)}%)`} value={money(preview.commission, currency)} /> : null}<SummaryRow label="Grand Total" value={money(preview.grandTotal, currency)} strong divider />{commissionOverridden ? <Alert variant="warning" title="Commission override" message={`Payment commission differs from the default ${defaultCommission.toFixed(2)}% and may require approval.`} /> : null}<Button className="w-full" disabled={isSaving || isLoadingPrices || !revisionPolicy.canEdit} onClick={saveRevision}>{isSaving ? "Saving…" : revisionPolicy.mode === "approval" ? "Submit for Approval" : "Save Revision"}</Button></div></ComponentCard></div>
      </div>

      <OrderProductPicker isOpen={isProductPickerOpen} onClose={() => setIsProductPickerOpen(false)} products={activeProducts} selectedQuantities={selectedQuantities} priceMap={priceMap} onAdd={addProduct} currencyCode={currency} disableWithoutPrice excludedProductTypeCodes={["STONE", "SINK", "SERVICE"]} />

      <ManualServiceLineModal
        isOpen={isServiceModalOpen}
        currencyCode={currency}
        initialLineNote={editingService?.line_note}
        initialUnitPrice={editingService?.unit_price}
        onClose={() => { setIsServiceModalOpen(false); setServiceEditIndex(null); }}
        onSubmit={saveServiceLine}
      />

      <Modal
        isOpen={Boolean(countertopRemoveItemId)}
        onClose={closeCountertopRemoval}
        className="relative w-full max-w-xl p-6 sm:p-8"
        ariaLabel="Remove Countertop confirmation"
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-xl font-semibold">Remove Countertop</h3>
            <FormHint>This removes the configured Countertop immediately from this Draft order, releases its active reservation, and reloads the authoritative order lines. Unsaved line edits will be discarded.</FormHint>
          </div>
          {countertopRemoveItem ? <Alert variant="warning" title="Configured Countertop" message={`${countertopRemoveSummary?.stoneName ?? productMap.get(countertopRemoveItem.product_id)?.name ?? "Countertop"} will be removed from ${order.order_number}.`} /> : null}
          <Field label="Removal Reason" hint="Optional. The reason is stored with the internal customer activity audit."><Input value={countertopRemoveReason} onChange={(event) => setCountertopRemoveReason(event.target.value)} placeholder="e.g. Customer selected a different countertop" /></Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={isRemovingCountertop} onClick={closeCountertopRemoval}>Cancel</Button>
            <Button variant="danger" disabled={isRemovingCountertop || !countertopRemoveItemId} onClick={confirmCountertopRemoval}>{isRemovingCountertop ? "Removing…" : "Remove Countertop"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
