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
  loadCreateOrderContext,
  loadOrderPrices,
  type OrderPriceRow,
  type OrderTaxRule,
} from "@/lib/customers/order-domain";
import { createCustomerOrderWithAdministrativeFee, loadAdministrativeFeeDefault } from "@/lib/customers/order-administrative-fee-domain";
import {
  ORDER_MONEY_DECIMAL,
  ORDER_QUANTITY_DECIMAL,
  parseOrderMoney,
  parseOrderPercent,
  parseOrderQuantity,
} from "@/lib/customers/order-validation";
import type { Customer, CustomerAddress, OrderFulfillmentType, OrderPricingModel, PaymentMethod, PriceGroupLookup } from "@/lib/customers/types";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import { calculateDbDecimalBulk, compareDbDecimal } from "@/lib/validation";
import DateInput from "@/components/form/DateInput";

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

type ValidatedHeader = {
  taxRate: string;
  orderDiscountAmount: string;
  administrativeFeePercent: string;
};

type ItemFieldErrors = Partial<Record<"quantity" | "discount_percent" | "unit_price" | "line_note", string>>;
type FieldErrors = {
  priceGroupId?: string;
  paymentMethodId?: string;
  administrativeFeePercent?: string;
  shippingAddressId?: string;
  orderDiscount?: string;
  taxRate?: string;
  items?: Record<number, ItemFieldErrors>;
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

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return <div><Label htmlFor={htmlFor}>{label}</Label>{children}{hint ? <FormHint>{hint}</FormHint> : null}</div>;
}

export default function NewCustomerOrder({ projectId = null }: { projectId?: string | null }) {
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
  const [administrativeFeeDefaultPercent, setAdministrativeFeeDefaultPercent] = useState("3.000");
  const [administrativeFeePercent, setAdministrativeFeePercent] = useState("3.000");
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
        const [context, profileResult, administrativeFeeDefault] = await Promise.all([loadCreateOrderContext(customerId), getCurrentProfile(), loadAdministrativeFeeDefault()]);
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
        setAdministrativeFeeDefaultPercent(administrativeFeeDefault.toFixed(3));
        setAdministrativeFeePercent(administrativeFeeDefault.toFixed(3));
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
    if (rule) setTaxRate(String(rule.tax_rate));
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
  const selectedTaxRule = useMemo(() => taxRules.find((rule) => rule.fulfillment_type === fulfillmentType) ?? null, [taxRules, fulfillmentType]);
  const serviceProduct = useMemo(
    () => products.find((product) => product.status === "active" && product.sku === "SERVICE" && product.product_type_code === "SERVICE" && product.pricing_model === "manual_service") ?? null,
    [products],
  );
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
    const baseSell = Math.max(0, subtotal - orderDiscountNumber);
    const administrativeFee = Math.round(baseSell * Math.min(100, Math.max(0, Number(administrativeFeePercent || 0))) / 100 * 100) / 100;
    const customerVisibleSell = baseSell + administrativeFee;
    const tax = customerVisibleSell * Math.max(0, Number(taxRate || 0)) / 100;
    return { subtotal, baseSell, administrativeFee, customerVisibleSell, tax, grandTotal: customerVisibleSell + tax };
  }, [items, priceMap, orderDiscount, taxRate, administrativeFeePercent]);

  function clearHeaderError(field: Exclude<keyof FieldErrors, "items">) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearItemError(index: number, field: keyof ItemFieldErrors) {
    setFieldErrors((current) => ({
      ...current,
      items: current.items ? { ...current.items, [index]: { ...current.items[index], [field]: undefined } } : undefined,
    }));
  }

  function focusFirstInvalid(errors: FieldErrors) {
    const firstInvalid = [
      errors.priceGroupId ? "new-order-price-group" : null,
      errors.paymentMethodId ? "new-order-payment-method" : null,
      errors.administrativeFeePercent ? "new-order-administrative-fee" : null,
      errors.shippingAddressId ? "new-order-shipping-address" : null,
      errors.orderDiscount ? "new-order-discount" : null,
      errors.taxRate ? "new-order-tax-rate" : null,
      ...Object.entries(errors.items ?? {}).flatMap(([index, itemErrors]) => [
        itemErrors.quantity ? `new-order-item-${index}-quantity` : null,
        itemErrors.discount_percent ? `new-order-item-${index}-discount` : null,
      ]),
    ].find((value): value is string => Boolean(value));
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  }

  function handlePriceGroupChange(groupId: string) {
    clearHeaderError("priceGroupId");
    setPriceGroupId(groupId);
    const group = priceGroups.find((item) => item.id === groupId);
    if (group?.system_key === "pickup_level") setFulfillmentType("pickup");
    else if (fulfillmentType === "pickup") setFulfillmentType("delivery");
  }

  function handlePaymentMethodChange(methodId: string) {
    clearHeaderError("paymentMethodId");
    setPaymentMethodId(methodId);
  }

  function updateItem(index: number, values: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  function addProduct(product: Product) {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.product_id === product.id && item.pricing_model === "price_group");
      if (existingIndex >= 0) {
        return current.map((item, index) => {
          if (index !== existingIndex) return item;
          const nextQuantity = calculateDbDecimalBulk(item.quantity, "1", "current_amount", ORDER_QUANTITY_DECIMAL);
          return nextQuantity.error || nextQuantity.value === null ? item : { ...item, quantity: nextQuantity.value };
        });
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
    const parsedPrice = parseOrderMoney(String(value.unitPrice));
    if (parsedPrice.error || parsedPrice.value === null) {
      setErrorMessage(parsedPrice.error ?? "Service price is invalid.");
      return;
    }
    setItems((current) => [...current, {
      product_id: serviceProduct.id,
      quantity: "1",
      discount_percent: "0",
      pricing_model: "manual_service",
      unit_price: parsedPrice.value,
      line_note: value.lineNote,
    }]);
    setIsServiceModalOpen(false);
  }

  function validateHeader(): ValidatedHeader | null {
    setErrorMessage(null);
    const errors: FieldErrors = {};
    if (!customer || !priceGroupId) errors.priceGroupId = "Customer and price group are required.";
    if (!paymentMethodId) errors.paymentMethodId = "Payment method is required.";
    if (fulfillmentType !== "pickup" && !shippingAddressId) errors.shippingAddressId = "Shipping address is required for delivery.";

    const administrativeFee = parseOrderPercent(administrativeFeePercent);
    const discount = parseOrderMoney(orderDiscount);
    const tax = parseOrderPercent(taxRate);
    if (administrativeFee.error || administrativeFee.value === null) errors.administrativeFeePercent = administrativeFee.error ?? "Enter a valid Administrative Fee.";
    if (discount.error || discount.value === null) errors.orderDiscount = discount.error ?? "Enter a valid order discount.";
    if (tax.error || tax.value === null) errors.taxRate = tax.error ?? "Enter a valid tax rate.";
    if (isLoadingPrices) {
      setErrorMessage("Prices are still loading.");
      return null;
    }
    if (Object.keys(errors).length) {
      setFieldErrors((current) => ({ ...current, ...errors }));
      setErrorMessage("Correct the highlighted order fields.");
      focusFirstInvalid(errors);
      return null;
    }
    setFieldErrors((current) => ({ ...current, priceGroupId: undefined, paymentMethodId: undefined, administrativeFeePercent: undefined, shippingAddressId: undefined, orderDiscount: undefined, taxRate: undefined }));
    return {
      taxRate: tax.value!,
      orderDiscountAmount: discount.value!,
      administrativeFeePercent: administrativeFee.value!,
    };
  }

  function validateItems(allowEmpty: boolean): ValidatedOrderItem[] | null {
    if (!allowEmpty && items.length === 0) {
      setErrorMessage("Choose at least one valid product or service line.");
      return null;
    }

    const itemErrors: Record<number, ItemFieldErrors> = {};
    const validated: ValidatedOrderItem[] = [];
    let blockingMessage: string | null = null;

    items.forEach((item, index) => {
      const errors: ItemFieldErrors = {};
      const product = productMap.get(item.product_id);
      const quantity = parseOrderQuantity(item.quantity);
      const discount = parseOrderPercent(item.discount_percent);
      if (quantity.error || quantity.value === null) errors.quantity = quantity.error ?? "Enter a valid quantity.";
      if (discount.error || discount.value === null) errors.discount_percent = discount.error ?? "Enter a valid line discount.";
      if (!product) blockingMessage ??= "A selected product could not be resolved.";
      else if (product.pricing_model === "countertop_material_band") blockingMessage ??= "Stone products must be configured through the Countertop action.";
      else if (product.pricing_model === "none") blockingMessage ??= "No Commercial Pricing products cannot be added to customer orders.";
      else if (product.pricing_model === "price_group" && !priceMap.has(item.product_id)) blockingMessage ??= `No current price exists for ${product.sku} in this price group.`;

      let unitPrice: string | undefined;
      if (product?.pricing_model === "manual_service") {
        if (quantity.value !== null && compareDbDecimal(quantity.value, "1", ORDER_QUANTITY_DECIMAL) !== 0) errors.quantity = "Service quantity must remain fixed at 1.";
        if (!item.line_note?.trim()) errors.line_note = "Service detail is required.";
        const parsedPrice = parseOrderMoney(item.unit_price);
        if (parsedPrice.error || parsedPrice.value === null) errors.unit_price = parsedPrice.error ?? "Enter a valid service price.";
        else unitPrice = parsedPrice.value;
      }

      if (Object.keys(errors).length) itemErrors[index] = errors;
      if (!blockingMessage && Object.keys(errors).length === 0 && product && quantity.value !== null && discount.value !== null) {
        validated.push({
          productId: item.product_id,
          quantity: quantity.value,
          discountPercent: discount.value,
          pricingModel: item.pricing_model,
          ...(product.pricing_model === "manual_service" ? { unitPrice, lineNote: item.line_note?.trim() } : {}),
        });
      }
    });

    if (blockingMessage || Object.keys(itemErrors).length) {
      const errors: FieldErrors = { items: itemErrors };
      setFieldErrors((current) => ({ ...current, items: itemErrors }));
      setErrorMessage(blockingMessage ?? "Correct the highlighted order lines.");
      focusFirstInvalid(errors);
      return null;
    }
    setFieldErrors((current) => ({ ...current, items: {} }));
    return validated;
  }

  async function createOrder(validItems: ValidatedOrderItem[], header: ValidatedHeader, status: "draft" | "confirmed") {
    if (!customer) throw new Error("Customer is required.");

    const sharedInput = {
      items: validItems,
      priceGroupId,
      billingAddressId,
      shippingAddressId,
      expectedDeliveryDate: expectedDate,
      customerReference: reference,
      customerNotes,
      internalNotes,
      taxRate: header.taxRate,
      orderDiscountAmount: header.orderDiscountAmount,
      paymentMethodId,
      administrativeFeePercent: header.administrativeFeePercent,
      initialStatus: status,
      fulfillmentType,
    };

    return createCustomerOrderWithAdministrativeFee({ customerId: customer.id, projectId, ...sharedInput });
  }

  async function saveOrder() {
    const header = validateHeader();
    if (!header) return;
    const validItems = validateItems(false);
    if (!validItems) return;
    setIsSaving(true);
    try {
      const orderId = await createOrder(validItems, header, initialStatus);
      router.push(`/customers/${customer?.id}/orders/${orderId}`);
    } catch (error) {
      setErrorMessage(errorMessage(error, "Unable to create order."));
      setIsSaving(false);
    }
  }

  async function startCountertop() {
    if (!canManageCountertop) return setErrorMessage("You do not have permission to manage customer orders.");
    const header = validateHeader();
    if (!header) return;
    const validItems = validateItems(true);
    if (!validItems) return;
    if (validItems.length === 0 && compareDbDecimal(header.orderDiscountAmount, "0", ORDER_MONEY_DECIMAL) === 1) {
      setErrorMessage("Configure the Countertop first, then apply an order discount from the saved Draft.");
      return;
    }

    setIsStartingCountertop(true);
    try {
      const orderId = await createOrder(validItems, header, "draft");
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
    return <div className="space-y-5"><Alert variant="info" title="Draft saved" message="Order information is saved. Configure the Countertop below; closing or completing this step returns to the saved Draft." /><CountertopConfigurator orderId={countertopDraftOrderId} onAttached={() => router.push(editHref)} onClose={() => router.push(editHref)} /></div>;
  }

  const fulfillmentHint = selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null
    ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%`
    : "No active tax rule configured for this fulfillment type.";
  const administrativeFeeHint = `Company default: ${Number(administrativeFeeDefaultPercent).toFixed(3)}% · Internal revenue adjustment; customer documents absorb it into line prices.`;

  return (
    <div className="space-y-5">
      {errorMessageState ? <Alert variant="error" title="Order action failed" message={errorMessageState} /> : null}
      {projectId ? <Alert variant="info" title="Project Order" message="This Order will be created inside the selected Project." /> : null}
      {selectedPriceGroup?.requires_approval ? <Alert variant="warning" title="Approval required" message={`${selectedPriceGroup.name} is a restricted price level. Sales orders using it require Admin approval before confirmation.`} /> : null}

      <ComponentCard title="Order Information" desc={`${customer.name} · ${customer.customer_code} — choose the commercial, fulfillment and payment context for this order.`} headerAction={<Button variant="outline" onClick={() => router.push(projectId ? `/projects/${projectId}` : `/customers/${customer.id}/orders`)}>{projectId ? "Back to Project" : "Back to Orders"}</Button>}>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Field label="Price Group" htmlFor="new-order-price-group" hint={fieldErrors.priceGroupId ?? (isLoadingPrices ? "Loading prices…" : undefined)}><Select id="new-order-price-group" error={Boolean(fieldErrors.priceGroupId)} options={priceGroups.map((group) => ({ value: group.id, label: `${group.name}${group.requires_approval ? " · Approval" : ""}` }))} value={priceGroupId} onChange={handlePriceGroupChange} /></Field>
          <Field label="Fulfillment Type" htmlFor="new-order-fulfillment-type" hint={fulfillmentHint}><Select id="new-order-fulfillment-type" options={[{ value: "pickup", label: "Customer Pickup" }, { value: "delivery", label: "Delivery" }, { value: "delivery_installation", label: "Delivery + Installation" }]} value={fulfillmentType} onChange={(value) => { setFulfillmentType(value as OrderFulfillmentType); if (value === "pickup") clearHeaderError("shippingAddressId"); }} /></Field>
          <Field label="Payment Method" htmlFor="new-order-payment-method" hint={fieldErrors.paymentMethodId}><Select id="new-order-payment-method" error={Boolean(fieldErrors.paymentMethodId)} options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))} value={paymentMethodId} onChange={handlePaymentMethodChange} /></Field>
          <Field label="Administrative Fee (%)" htmlFor="new-order-administrative-fee" hint={administrativeFeeHint}><div className="flex gap-2"><div className="min-w-0 flex-1"><Input id="new-order-administrative-fee" type="number" min="0" max="100" step="0.001" value={administrativeFeePercent} error={Boolean(fieldErrors.administrativeFeePercent)} hint={fieldErrors.administrativeFeePercent} onChange={(event) => { clearHeaderError("administrativeFeePercent"); setAdministrativeFeePercent(event.target.value); }} /></div><Button size="sm" variant="outline" onClick={() => { clearHeaderError("administrativeFeePercent"); setAdministrativeFeePercent(administrativeFeeDefaultPercent); }}>Use Company Default</Button></div></Field>
          <Field label="Initial Status" htmlFor="new-order-initial-status"><Select id="new-order-initial-status" options={[{ value: "draft", label: "Draft" }, { value: "confirmed", label: "Confirmed" }]} value={initialStatus} onChange={(value) => setInitialStatus(value as "draft" | "confirmed")} /></Field>
          <Field label="Expected Delivery" htmlFor="new-order-expected-delivery"><DateInput id="new-order-expected-delivery" value={expectedDate} onChange={(event) => setExpectedDate(event)} /></Field>
          <Field label="Customer Reference" htmlFor="new-order-customer-reference"><Input id="new-order-customer-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PO / reference" /></Field>
          <Field label="Billing Address" htmlFor="new-order-billing-address"><Select id="new-order-billing-address" options={addresses.filter((address) => ["billing", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={billingAddressId} placeholder="None" allowEmpty onChange={setBillingAddressId} /></Field>
          <Field label="Shipping Address" htmlFor="new-order-shipping-address" hint={fieldErrors.shippingAddressId}><Select id="new-order-shipping-address" error={Boolean(fieldErrors.shippingAddressId)} options={addresses.filter((address) => ["shipping", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={shippingAddressId} placeholder="None" allowEmpty onChange={(value) => { clearHeaderError("shippingAddressId"); setShippingAddressId(value); }} /></Field>
          <Field label={`Order Discount (${currency})`} htmlFor="new-order-discount"><Input id="new-order-discount" inputMode="decimal" value={orderDiscount} error={Boolean(fieldErrors.orderDiscount)} hint={fieldErrors.orderDiscount} onChange={(event) => { clearHeaderError("orderDiscount"); setOrderDiscount(event.target.value); }} /></Field>
          <Field label="Tax Rate (%)" htmlFor="new-order-tax-rate"><Input id="new-order-tax-rate" inputMode="decimal" value={taxRate} error={Boolean(fieldErrors.taxRate)} hint={fieldErrors.taxRate} onChange={(event) => { clearHeaderError("taxRate"); setTaxRate(event.target.value); }} /></Field>
        </div>
      </ComponentCard>

      <ComponentCard title="Products" desc="Cabinet products use server Price Group pricing. Countertop and Service use their dedicated order-entry routes." headerAction={<div className="flex flex-wrap justify-end gap-2">{canManageCountertop ? <Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} disabled={isMutating || isLoadingPrices} onClick={startCountertop}>{isStartingCountertop ? "Preparing Draft…" : "Countertop"}</Button> : null}<Button size="sm" startIcon={<PlusIcon className="size-4" />} disabled={isMutating} onClick={() => setIsProductPickerOpen(true)}>Cabinet</Button><Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} disabled={isMutating} onClick={openService}>Service</Button></div>}>
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin"><TableRow>{["Product", "Qty", "Unit Price", "Discount %", "Line Total", ""].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={6}>No lines yet. Choose Countertop, Cabinet, or Service.</TableStateRow> : items.map((item, index) => {
                const product = productMap.get(item.product_id);
                const isService = item.pricing_model === "manual_service";
                const price = isService ? Number(item.unit_price ?? 0) : priceMap.get(item.product_id) ?? 0;
                const total = Number(item.quantity || 0) * price * (1 - Number(item.discount_percent || 0) / 100);
                const itemError = fieldErrors.items?.[index];
                return (
                  <TableRow key={`${item.product_id}-${index}`}>
                    <TableCell variant="admin" className="min-w-[320px]"><div className="font-semibold">{product?.sku ?? "Unknown product"}</div><FormHint>{product?.name ?? item.product_id}</FormHint><ServiceLineDetails lineNote={item.line_note} />{itemError?.unit_price ? <FormHint>{itemError.unit_price}</FormHint> : null}{itemError?.line_note ? <FormHint>{itemError.line_note}</FormHint> : null}</TableCell>
                    <TableCell variant="admin" className="w-28">{isService ? <FormHint>1 · fixed</FormHint> : <Input id={`new-order-item-${index}-quantity`} ariaLabel={`${product?.sku ?? "Product"} quantity`} inputMode="decimal" value={item.quantity} error={Boolean(itemError?.quantity)} hint={itemError?.quantity} onChange={(event) => { clearItemError(index, "quantity"); updateItem(index, { quantity: event.target.value }); }} />}</TableCell>
                    <TableCell variant="admin">{isService || priceMap.has(item.product_id) ? money(price, currency) : "No price"}</TableCell>
                    <TableCell variant="admin" className="w-32"><Input id={`new-order-item-${index}-discount`} ariaLabel={`${product?.sku ?? "Product"} discount percent`} inputMode="decimal" value={item.discount_percent} error={Boolean(itemError?.discount_percent)} hint={itemError?.discount_percent} onChange={(event) => { clearItemError(index, "discount_percent"); updateItem(index, { discount_percent: event.target.value }); }} /></TableCell>
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
        <div className="xl:col-span-8"><ComponentCard title="Notes" desc="Customer-facing and internal context for this order."><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes" htmlFor="new-order-customer-notes"><TextArea id="new-order-customer-notes" rows={5} value={customerNotes} onChange={setCustomerNotes} /></Field><Field label="Internal Notes" htmlFor="new-order-internal-notes"><TextArea id="new-order-internal-notes" rows={5} value={internalNotes} onChange={setInternalNotes} /></Field></div></ComponentCard></div>
        <div className="xl:col-span-4"><ComponentCard title="Order Total" desc="Internal preview; customer-facing documents absorb Administrative Fee into line prices."><div className="space-y-3"><SummaryRow label="Lines after discount" value={money(preview.subtotal, currency)} /><SummaryRow label="Order discount" value={`-${money(Number(orderDiscount || 0), currency)}`} /><SummaryRow label="Base Sell" value={money(preview.baseSell, currency)} /><SummaryRow label={`Administrative Fee (${Number(administrativeFeePercent || 0).toFixed(3)}%)`} value={money(preview.administrativeFee, currency)} /><SummaryRow label="Customer-visible Sell" value={money(preview.customerVisibleSell, currency)} /><SummaryRow label="Tax" value={money(preview.tax, currency)} /><SummaryRow label="Customer Total" value={money(preview.grandTotal, currency)} strong divider /><Button className="w-full" disabled={isMutating || isLoadingPrices || !paymentMethodId} onClick={saveOrder}>{isSaving ? "Creating…" : initialStatus === "confirmed" ? "Create & Confirm" : "Create Draft"}</Button></div></ComponentCard></div>
      </div>

      <OrderProductPicker isOpen={isProductPickerOpen} onClose={() => setIsProductPickerOpen(false)} products={products} selectedQuantities={selectedQuantities} priceMap={priceMap} onAdd={addProduct} currencyCode={currency} disableWithoutPrice excludedProductTypeCodes={["STONE", "SINK", "SERVICE"]} />
      <ManualServiceLineModal isOpen={isServiceModalOpen} currencyCode={currency} onClose={() => setIsServiceModalOpen(false)} onSubmit={addServiceLine} />
    </div>
  );
}