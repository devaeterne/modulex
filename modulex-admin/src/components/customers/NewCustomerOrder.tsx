"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import SummaryRow from "@/components/common/SummaryRow";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";
import ManualServiceLineModal from "@/components/customers/ManualServiceLineModal";
import OrderProductPicker, { type OrderPickerProduct } from "@/components/customers/OrderProductPicker";
import ServiceLineDetails from "@/components/customers/ServiceLineDetails";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { PlusIcon } from "@/icons";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createCustomerOrder,
  loadCreateOrderContext,
  loadOrderPrices,
  type OrderPriceRow,
  type OrderTaxRule,
} from "@/lib/customers/order-domain";
import type { Customer, CustomerAddress, OrderFulfillmentType, OrderPricingModel, PaymentMethod, PriceGroupLookup } from "@/lib/customers/types";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";

type Product = OrderPickerProduct;
type PriceRow = OrderPriceRow;
type DraftItem = {
  product_id: string;
  quantity: string;
  discount_percent: string;
  pricing_model: OrderPricingModel;
  unit_price?: string;
  line_note?: string;
};
type TaxRule = OrderTaxRule;

type ValidatedOrderItem = {
  productId: string;
  quantity: string;
  discountPercent: string;
  pricingModel: OrderPricingModel;
  unitPrice?: string;
  lineNote?: string;
};

function money(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint ? <FormHint>{hint}</FormHint> : null}
    </div>
  );
}

export default function NewCustomerOrder() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
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
  const [countertopDraftOrderId, setCountertopDraftOrderId] = useState<string | null>(null);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingCountertop, setIsStartingCountertop] = useState(false);
  const [errorMessageState, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [context, profileResult] = await Promise.all([loadCreateOrderContext(customerId), getCurrentProfile()]);
        if (!active) return;
        if (profileResult.error) throw profileResult.error;
        if (!profileResult.profile) throw new Error("User profile could not be loaded.");

        const loadedCustomer = context.customer;
        const loadedAddresses = context.addresses;
        const loadedGroups = context.priceGroups;
        const loadedMethods = context.paymentMethods;
        const defaultMethod = loadedMethods.find((method) => method.system_key === "cash") ?? loadedMethods[0] ?? null;
        const defaultGroup = loadedGroups.find((group) => group.id === loadedCustomer.price_group_id) ?? loadedGroups.find((group) => group.is_base_price) ?? loadedGroups[0] ?? null;

        setCustomer(loadedCustomer);
        setRole(profileResult.profile.role);
        setAddresses(loadedAddresses);
        setPriceGroups(loadedGroups);
        setPaymentMethods(loadedMethods);
        setProducts(context.products as Product[]);
        setTaxRules(context.taxRules);
        setPriceGroupId(defaultGroup?.id || "");
        setFulfillmentType(defaultGroup?.system_key === "pickup_level" ? "pickup" : "delivery");
        setPaymentMethodId(defaultMethod?.id || "");
        setPaymentCommissionPercent(String(Number(defaultMethod?.commission_percent ?? 0)));
        setBillingAddressId(loadedAddresses.find((address) => address.is_default_billing)?.id || "");
        setShippingAddressId(loadedAddresses.find((address) => address.is_default_shipping)?.id || "");
      } catch (error) {
        if (active) setErrorMessage(errorMessage(error, "Unable to prepare order."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => { active = false; };
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
      try {
        const data = await loadOrderPrices(priceGroupId, customer?.currency_code || "USD");
        if (active) setPrices(data);
      } catch (error) {
        if (active) {
          setErrorMessage(errorMessage(error, "Unable to load order prices."));
          setPrices([]);
        }
      } finally {
        if (active) setIsLoadingPrices(false);
      }
    }
    void loadGroupPrices();
    return () => { active = false; };
  }, [priceGroupId, customer?.currency_code]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const priceMap = useMemo(() => new Map(prices.map((price) => [price.product_id, Number(price.amount)])), [prices]);
  const selectedQuantities = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of items) values.set(item.product_id, (values.get(item.product_id) ?? 0) + Number(item.quantity || 0));
    return values;
  }, [items]);
  const selectedPriceGroup = useMemo(() => priceGroups.find((group) => group.id === priceGroupId) ?? null, [priceGroups, priceGroupId]);
  const selectedPaymentMethod = useMemo(() => paymentMethods.find((method) => method.id === paymentMethodId) ?? null, [paymentMethods, paymentMethodId]);
  const selectedTaxRule = useMemo(() => taxRules.find((rule) => rule.fulfillment_type === fulfillmentType) ?? null, [taxRules, fulfillmentType]);
  const serviceProduct = useMemo(
    () => products.find((product) => product.status === "active" && product.sku === "SERVICE" && product.product_type_code === "SERVICE" && product.pricing_model === "manual_service") ?? null,
    [products],
  );
  const defaultCommissionPercent = Number(selectedPaymentMethod?.commission_percent ?? 0);
  const appliedCommissionPercent = Math.min(100, Math.max(0, Number(paymentCommissionPercent || 0)));
  const commissionOverridden = Math.abs(appliedCommissionPercent - defaultCommissionPercent) > 0.0001;
  const canManageCountertop = role !== null && hasPermission(role, "orders.manage");
  const isMutating = isSaving || isStartingCountertop;
  const currency = customer?.currency_code || "USD";

  const preview = useMemo(() => {
    let subtotal = 0;
    for (const item of items) {
      const quantity = Number(item.quantity || 0);
      const discount = Number(item.discount_percent || 0);
      const price = item.pricing_model === "manual_service" ? Number(item.unit_price ?? 0) : priceMap.get(item.product_id) ?? 0;
      subtotal += quantity * price * (1 - discount / 100);
    }
    const orderDiscountNumber = Math.max(0, Number(orderDiscount || 0));
    const taxable = Math.max(0, subtotal - orderDiscountNumber);
    const tax = taxable * Math.max(0, Number(taxRate || 0)) / 100;
    const orderTotal = taxable + tax;
    const paymentCommission = orderTotal * appliedCommissionPercent / 100;
    return { subtotal, tax, orderTotal, paymentCommission, grandTotal: orderTotal + paymentCommission };
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
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  function addProduct(product: Product) {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.product_id === product.id && item.pricing_model === "price_group");
      if (existingIndex >= 0) {
        return current.map((item, index) => index === existingIndex ? { ...item, quantity: String(Number(item.quantity || 0) + 1) } : item);
      }
      return [...current, { product_id: product.id, quantity: "1", discount_percent: "0", pricing_model: product.pricing_model }];
    });
  }

  function openService() {
    setErrorMessage(null);
    if (!serviceProduct) {
      setErrorMessage("The canonical active SERVICE product is missing. Apply the reviewed Service reference-data migration before using this action.");
      return;
    }
    setIsServiceModalOpen(true);
  }

  function addServiceLine(value: { lineNote: string; unitPrice: number }) {
    if (!serviceProduct) return;
    setItems((current) => [...current, {
      product_id: serviceProduct.id,
      quantity: "1",
      discount_percent: "0",
      pricing_model: "manual_service",
      unit_price: String(value.unitPrice),
      line_note: value.lineNote,
    }]);
    setIsServiceModalOpen(false);
  }

  function validateHeader() {
    setErrorMessage(null);
    if (!customer || !priceGroupId) return setErrorMessage("Customer and price group are required."), false;
    if (!paymentMethodId) return setErrorMessage("Payment method is required."), false;
    if (appliedCommissionPercent < 0 || appliedCommissionPercent > 100) return setErrorMessage("Payment commission must be between 0 and 100%."), false;
    if (isLoadingPrices) return setErrorMessage("Prices are still loading."), false;
    return true;
  }

  function validateItems(allowEmpty: boolean): ValidatedOrderItem[] | null {
    const validItems = items.filter((item) => item.product_id && Number(item.quantity) > 0);
    if (!allowEmpty && validItems.length === 0) return setErrorMessage("Choose at least one valid product or service line."), null;
    if (validItems.length !== items.length) return setErrorMessage("Every selected line needs a valid quantity."), null;

    for (const item of validItems) {
      const product = productMap.get(item.product_id);
      if (!product) return setErrorMessage("A selected product could not be resolved."), null;
      if (product.pricing_model === "countertop_material_band") return setErrorMessage("Stone products must be configured through the Countertop action."), null;
      if (product.pricing_model === "none") return setErrorMessage("No Commercial Pricing products cannot be added to customer orders."), null;
      if (product.pricing_model === "manual_service") {
        const servicePrice = Number(item.unit_price);
        if (item.quantity !== "1") return setErrorMessage("Service quantity must remain fixed at 1."), null;
        if (!item.line_note?.trim()) return setErrorMessage("Service detail is required."), null;
        if (!Number.isFinite(servicePrice) || servicePrice < 0) return setErrorMessage("Service price must be a nonnegative number."), null;
      } else if (!priceMap.has(item.product_id)) {
        return setErrorMessage(`No current price exists for ${product.sku} in this price group.`), null;
      }
      const discount = Number(item.discount_percent || 0);
      if (discount < 0 || discount > 100) return setErrorMessage("Line discount must be between 0 and 100%."), null;
    }

    return validItems.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
      discountPercent: item.discount_percent,
      pricingModel: item.pricing_model,
      ...(item.pricing_model === "manual_service" ? { unitPrice: item.unit_price, lineNote: item.line_note } : {}),
    }));
  }

  async function createOrder(validItems: ValidatedOrderItem[], status: "draft" | "confirmed") {
    if (!customer) throw new Error("Customer is required.");
    return createCustomerOrder({
      customerId: customer.id,
      items: validItems,
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
      paymentCommissionPercent: appliedCommissionPercent,
      initialStatus: status,
      fulfillmentType,
    });
  }

  async function saveOrder() {
    if (!validateHeader()) return;
    const validItems = validateItems(false);
    if (!validItems) return;
    setIsSaving(true);
    try {
      const orderId = await createOrder(validItems, initialStatus);
      router.push(`/customers/${customer?.id}/orders/${orderId}`);
    } catch (error) {
      setErrorMessage(errorMessage(error, "Unable to create order."));
      setIsSaving(false);
    }
  }

  async function startCountertop() {
    if (!canManageCountertop) return setErrorMessage("You do not have permission to manage customer orders.");
    if (!validateHeader()) return;
    const validItems = validateItems(true);
    if (!validItems) return;
    if (validItems.length === 0 && Number(orderDiscount || 0) > 0) return setErrorMessage("Configure the Countertop first, then apply an order discount from the saved Draft.");

    setIsStartingCountertop(true);
    try {
      const orderId = await createOrder(validItems, "draft");
      setCountertopDraftOrderId(orderId);
      setIsStartingCountertop(false);
    } catch (error) {
      setErrorMessage(errorMessage(error, "Unable to prepare a Draft order for Countertop configuration."));
      setIsStartingCountertop(false);
    }
  }

  if (isLoading) return <ComponentCard title="New Order" desc="Preparing customer order context…"><FormHint>Preparing order…</FormHint></ComponentCard>;
  if (!customer) return <Alert variant="error" title="Unable to prepare order" message={errorMessageState || "Customer not found."} />;

  if (countertopDraftOrderId) {
    const editHref = `/customers/${customer.id}/orders/${countertopDraftOrderId}/edit`;
    return (
      <div className="space-y-5">
        <Alert variant="info" title="Draft saved" message="Order information is saved. Configure the Countertop below; closing or completing this step returns to the saved Draft." />
        <CountertopConfigurator orderId={countertopDraftOrderId} onAttached={() => router.push(editHref)} onClose={() => router.push(editHref)} />
      </div>
    );
  }

  const fulfillmentHint = selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null
    ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%`
    : "No active tax rule configured for this fulfillment type.";
  const commissionHint = `Default: ${defaultCommissionPercent.toFixed(2)}%${commissionOverridden ? ` · Override: ${appliedCommissionPercent.toFixed(2)}%` : ""}`;

  return (
    <div className="space-y-5">
      {errorMessageState ? <Alert variant="error" title="Order action failed" message={errorMessageState} /> : null}
      {selectedPriceGroup?.requires_approval ? <Alert variant="warning" title="Approval required" message={`${selectedPriceGroup.name} is a restricted price level. Sales orders using it require Admin approval before confirmation.`} /> : null}

      <ComponentCard
        title="Order Information"
        desc={`${customer.name} · ${customer.customer_code} — choose the commercial, fulfillment and payment context for this order.`}
        headerAction={<Button variant="outline" onClick={() => router.push(`/customers/${customer.id}/orders`)}>Back to Orders</Button>}
      >
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Field label="Price Group" hint={isLoadingPrices ? "Loading prices…" : undefined}><Select options={priceGroups.map((group) => ({ value: group.id, label: `${group.name}${group.requires_approval ? " · Approval" : ""}` }))} value={priceGroupId} onChange={handlePriceGroupChange} /></Field>
          <Field label="Fulfillment Type" hint={fulfillmentHint}><Select options={[{ value: "pickup", label: "Customer Pickup" }, { value: "delivery", label: "Delivery" }, { value: "delivery_installation", label: "Delivery + Installation" }]} value={fulfillmentType} onChange={(value) => setFulfillmentType(value as OrderFulfillmentType)} /></Field>
          <Field label="Payment Method"><Select options={paymentMethods.map((method) => ({ value: method.id, label: `${method.name}${Number(method.commission_percent) > 0 ? ` (+${Number(method.commission_percent).toFixed(2)}%)` : ""}` }))} value={paymentMethodId} onChange={handlePaymentMethodChange} /></Field>
          <Field label="Applied Commission (%)" hint={commissionHint}><div className="flex gap-2"><div className="min-w-0 flex-1"><Input type="number" min="0" max="100" step="0.01" value={paymentCommissionPercent} onChange={(event) => setPaymentCommissionPercent(event.target.value)} /></div><Button size="sm" variant="outline" onClick={() => setPaymentCommissionPercent(String(defaultCommissionPercent))}>Use Default</Button></div></Field>
          <Field label="Initial Status"><Select options={[{ value: "draft", label: "Draft" }, { value: "confirmed", label: "Confirmed" }]} value={initialStatus} onChange={(value) => setInitialStatus(value as "draft" | "confirmed")} /></Field>
          <Field label="Expected Delivery"><Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></Field>
          <Field label="Customer Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PO / reference" /></Field>
          <Field label="Billing Address"><Select options={addresses.filter((address) => ["billing", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={billingAddressId} placeholder="None" allowEmpty onChange={setBillingAddressId} /></Field>
          <Field label="Shipping Address"><Select options={addresses.filter((address) => ["shipping", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={shippingAddressId} placeholder="None" allowEmpty onChange={setShippingAddressId} /></Field>
          <Field label={`Order Discount (${currency})`}><Input inputMode="decimal" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} /></Field>
          <Field label="Tax Rate (%)"><Input inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Products"
        desc="Cabinet products use server Price Group pricing. Countertop and Service use their dedicated order-entry routes."
        headerAction={(
          <div className="flex flex-wrap justify-end gap-2">
            {canManageCountertop ? <Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} disabled={isMutating || isLoadingPrices} onClick={startCountertop}>{isStartingCountertop ? "Preparing Draft…" : "Countertop"}</Button> : null}
            <Button size="sm" startIcon={<PlusIcon className="size-4" />} disabled={isMutating} onClick={() => setIsProductPickerOpen(true)}>Cabinet</Button>
            <Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} disabled={isMutating} onClick={openService}>Service</Button>
          </div>
        )}
      >
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin"><TableRow>{["Product", "Qty", "Unit Price", "Discount %", "Line Total", ""].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={6}>No lines yet. Choose Countertop, Cabinet, or Service.</TableStateRow> : items.map((item, index) => {
                const product = productMap.get(item.product_id);
                const isService = item.pricing_model === "manual_service";
                const price = isService ? Number(item.unit_price ?? 0) : priceMap.get(item.product_id) ?? 0;
                const total = Number(item.quantity || 0) * price * (1 - Number(item.discount_percent || 0) / 100);
                return (
                  <TableRow key={`${item.product_id}-${index}`}>
                    <TableCell variant="admin" className="min-w-[320px]"><div className="font-semibold">{product?.sku ?? "Unknown product"}</div><FormHint>{product?.name ?? item.product_id}</FormHint><ServiceLineDetails lineNote={item.line_note} /></TableCell>
                    <TableCell variant="admin" className="w-28">{isService ? <FormHint>1 · fixed</FormHint> : <Input ariaLabel={`${product?.sku ?? "Product"} quantity`} inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />}</TableCell>
                    <TableCell variant="admin">{isService || priceMap.has(item.product_id) ? money(price, currency) : "No price"}</TableCell>
                    <TableCell variant="admin" className="w-32"><Input ariaLabel={`${product?.sku ?? "Product"} discount percent`} inputMode="decimal" value={item.discount_percent} onChange={(event) => updateItem(index, { discount_percent: event.target.value })} /></TableCell>
                    <TableCell variant="admin" className="font-semibold">{money(total, currency)}</TableCell>
                    <TableCell variant="admin" className="text-right"><Button size="sm" variant="danger" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8"><ComponentCard title="Notes" desc="Customer-facing and internal context for this order."><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes"><TextArea rows={5} value={customerNotes} onChange={setCustomerNotes} /></Field><Field label="Internal Notes"><TextArea rows={5} value={internalNotes} onChange={setInternalNotes} /></Field></div></ComponentCard></div>
        <div className="xl:col-span-4"><ComponentCard title="Order Total" desc="Preview; the server remains authoritative when the order is saved."><div className="space-y-3"><SummaryRow label="Lines after discount" value={money(preview.subtotal, currency)} /><SummaryRow label="Order discount" value={`-${money(Number(orderDiscount || 0), currency)}`} /><SummaryRow label="Tax" value={money(preview.tax, currency)} /><SummaryRow label="Order Total" value={money(preview.orderTotal, currency)} />{preview.paymentCommission > 0 ? <SummaryRow label={`${selectedPaymentMethod?.name || "Payment"} Commission (${appliedCommissionPercent.toFixed(2)}%)`} value={money(preview.paymentCommission, currency)} /> : null}<SummaryRow label="Grand Total" value={money(preview.grandTotal, currency)} strong divider />{commissionOverridden ? <Alert variant="warning" title="Commission override" message={`Payment commission is overridden from ${defaultCommissionPercent.toFixed(2)}% to ${appliedCommissionPercent.toFixed(2)}% for this order only.`} /> : null}<Button className="w-full" disabled={isMutating || isLoadingPrices || !paymentMethodId} onClick={saveOrder}>{isSaving ? "Creating…" : initialStatus === "confirmed" ? "Create & Confirm" : "Create Draft"}</Button></div></ComponentCard></div>
      </div>

      <OrderProductPicker
        isOpen={isProductPickerOpen}
        onClose={() => setIsProductPickerOpen(false)}
        products={products}
        selectedQuantities={selectedQuantities}
        priceMap={priceMap}
        onAdd={addProduct}
        currencyCode={currency}
        disableWithoutPrice
        excludedProductTypeCodes={["STONE", "SINK", "SERVICE"]}
      />

      <ManualServiceLineModal
        isOpen={isServiceModalOpen}
        currencyCode={currency}
        onClose={() => setIsServiceModalOpen(false)}
        onSubmit={addServiceLine}
      />
    </div>
  );
}