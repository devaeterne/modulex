"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import SummaryRow from "@/components/common/SummaryRow";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";
import CountertopLineDetails from "@/components/customers/CountertopLineDetails";
import OrderProductPicker, { type OrderPickerProduct } from "@/components/customers/OrderProductPicker";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getCustomerOrderRevisionPolicy,
  loadEditOrderContext,
  loadOrderPrices,
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
  OrderFulfillmentType,
  PaymentMethod,
  PriceGroupLookup,
} from "@/lib/customers/types";

type Product = OrderPickerProduct;
type PriceRow = OrderPriceRow;
type DraftItem = { id?: string; product_id: string; quantity: string; unit_price: string; discount_percent: string };
type TaxRule = OrderTaxRule;

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

function mapDraftItem(item: { id: string; product_id: string | null; quantity: string | number; unit_price: string | number; discount_percent: string | number }): DraftItem {
  return {
    id: item.id,
    product_id: item.product_id ?? "",
    quantity: String(item.quantity),
    unit_price: String(item.unit_price),
    discount_percent: String(item.discount_percent),
  };
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint ? <FormHint>{hint}</FormHint> : null}
    </div>
  );
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

  async function handleCountertopAttached(createdItemId: string) {
    try {
      const context = await loadEditOrderContext(customerId, orderId);
      const createdItem = context.items.find((item) => item.id === createdItemId);
      if (!createdItem) throw new Error("The new countertop line could not be reloaded.");
      setProducts(context.products as Product[]);
      setCountertopSummaries(context.countertopSummaries);
      setItems((current) => current.some((item) => item.id === createdItemId)
        ? current.map((item) => item.id === createdItemId ? mapDraftItem(createdItem) : item)
        : [...current, mapDraftItem(createdItem)]);
      setIsCountertopOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Countertop was attached but the order line could not be refreshed.");
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
    if (items.length === 0) return setErrorMessage("At least one product line is required.");
    if (Number(appliedCommission) < 0 || Number(appliedCommission) > 100) return setErrorMessage("Applied commission must be between 0 and 100%.");

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (product?.pricing_model === "countertop_material_band" && !item.id) return setErrorMessage("Countertop Material Band products must be configured with Add Countertop.");
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

  if (isLoading) {
    return <ComponentCard title="Edit Order" desc="Loading the saved order and pricing context…"><FormHint>Loading editable order…</FormHint></ComponentCard>;
  }
  if (!customer || !order) return <Alert variant="error" title="Unable to load order" message={errorMessage || "Order not found."} />;
  if (!revisionPolicy) return <Alert variant="error" title="Unable to edit order" message="Unable to resolve order revision policy." />;

  if (!revisionPolicy.canEdit) {
    return (
      <div className="space-y-5">
        <ComponentCard
          title={`Revision Locked · ${order.order_number}`}
          desc={`${customer.name} · ${revisionPolicy.reason}`}
          headerAction={<Button variant="outline" onClick={() => router.push(`/customers/${customerId}/orders/${orderId}`)}>Back to Order</Button>}
        >
          <Alert variant="warning" title="Commercial revision disabled" message={`Commercial revision is disabled for status ${order.status.replaceAll("_", " ")}. Order identity, snapshots and calculated totals remain immutable; status changes continue through the dedicated status workflow.`} />
        </ComponentCard>
      </div>
    );
  }

  const defaultCommission = Number(selectedPaymentMethod?.commission_percent ?? 0);
  const commissionOverridden = Math.abs(Number(appliedCommission || 0) - defaultCommission) > 0.0001;
  const taxHint = selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null
    ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%`
    : "No active tax rule configured.";

  return (
    <div className="space-y-5">
      {errorMessage ? <Alert variant="error" title="Order revision failed" message={errorMessage} /> : null}
      {selectedPriceGroup?.requires_approval ? <Alert variant="warning" title="Approval required" message={`${selectedPriceGroup.name} is a restricted price group. Sales use requires approval.`} /> : null}

      <ComponentCard
        title={`Edit ${order.order_number}`}
        desc={`${customer.name} · ${revisionPolicy.reason}`}
        headerAction={<Button variant="outline" onClick={() => router.push(`/customers/${customerId}/orders/${orderId}`)}>Back to Order</Button>}
      >
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Field label="Price Group" hint={isLoadingPrices ? "Loading group prices…" : undefined}>
            <Select options={priceGroups.map((group) => ({ value: group.id, label: `${group.name}${group.requires_approval ? " · Approval" : ""}` }))} value={priceGroupId} onChange={handlePriceGroupChange} />
          </Field>
          <Field label="Fulfillment Type" hint={taxHint}>
            <Select
              options={[
                { value: "pickup", label: "Customer Pickup" },
                { value: "delivery", label: "Delivery" },
                { value: "delivery_installation", label: "Delivery + Installation" },
              ]}
              value={fulfillmentType}
              onChange={(value) => handleFulfillmentChange(value as OrderFulfillmentType)}
            />
          </Field>
          <Field label="Payment Method">
            <Select
              options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))}
              value={paymentMethodId}
              onChange={(id) => {
                setPaymentMethodId(id);
                const method = paymentMethods.find((item) => item.id === id);
                setAppliedCommission(String(Number(method?.commission_percent ?? 0)));
              }}
            />
          </Field>
          <Field label="Applied Commission (%)" hint={`Default ${defaultCommission.toFixed(2)}%${commissionOverridden ? " · Sales override requires approval" : ""}`}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><Input inputMode="decimal" value={appliedCommission} onChange={(event) => setAppliedCommission(event.target.value)} /></div>
              <Button size="sm" variant="outline" onClick={() => setAppliedCommission(String(defaultCommission))}>Use Default</Button>
            </div>
          </Field>
          <Field label="Expected Delivery"><Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></Field>
          <Field label="Customer Reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Field label="Billing Address">
            <Select options={addresses.filter((address) => ["billing", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={billingAddressId} placeholder="None" allowEmpty onChange={setBillingAddressId} />
          </Field>
          <Field label="Shipping Address">
            <Select options={addresses.filter((address) => ["shipping", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={shippingAddressId} placeholder="None" allowEmpty onChange={setShippingAddressId} />
          </Field>
          <Field label="Order Discount ($)" hint="Sales discounts are approval-controlled."><Input inputMode="decimal" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} /></Field>
          <Field label="Tax Rate (%)" hint="Tax overrides against an active fulfillment rule require approval."><Input inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Products"
        desc="Prices are resolved by the canonical pricing route. Countertop selections are shown from the saved historical pricing snapshot."
        headerAction={(
          <div className="flex flex-wrap justify-end gap-2">
            {canManageCountertop ? <Button size="sm" variant="outline" onClick={() => setIsCountertopOpen(true)}>Add Countertop</Button> : null}
            <Button size="sm" onClick={() => setIsProductPickerOpen(true)}>Add Products</Button>
          </div>
        )}
      >
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                {["Product", "Qty", "Server Price", "Discount %", "Line Total", ""].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? (
                <TableStateRow colSpan={6}>No products added. Use Add Products for standard products or Add Countertop for Stone.</TableStateRow>
              ) : items.map((item, index) => {
                const product = productMap.get(item.product_id);
                const resolvedPrice = resolveOrderLineUnitPrice(item, product, priceMap);
                const total = Number(item.quantity || 0) * Number(resolvedPrice ?? 0) * (1 - Number(item.discount_percent || 0) / 100);
                const countertopSummary = item.id ? summariesByItemId.get(item.id) : null;
                return (
                  <TableRow key={item.id ?? `${item.product_id}-${index}`}>
                    <TableCell variant="admin" className="min-w-[360px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{product?.sku ?? "Unknown product"}</span>
                        {product?.status === "inactive" ? <Badge size="sm" color="warning">Inactive</Badge> : null}
                      </div>
                      <FormHint>{product?.name ?? item.product_id}</FormHint>
                      <CountertopLineDetails summary={countertopSummary} />
                    </TableCell>
                    <TableCell variant="admin" className="w-28"><Input ariaLabel={`${product?.sku ?? "Product"} quantity`} inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} /></TableCell>
                    <TableCell variant="admin" className="min-w-[180px]">
                      <span className="font-semibold">{resolvedPrice === undefined ? "Unavailable" : money(resolvedPrice)}</span>
                      <FormHint>{product?.pricing_model === "countertop_material_band" ? "Countertop · configured price" : "Price Group · server authoritative"}</FormHint>
                    </TableCell>
                    <TableCell variant="admin" className="w-32"><Input ariaLabel={`${product?.sku ?? "Product"} discount percent`} inputMode="decimal" value={item.discount_percent} onChange={(event) => updateItem(index, { discount_percent: event.target.value })} /></TableCell>
                    <TableCell variant="admin" className="font-semibold">{money(total)}</TableCell>
                    <TableCell variant="admin" className="text-right"><Button size="sm" variant="danger" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      {isCountertopOpen ? (
        <CountertopConfigurator
          orderId={order.id}
          orderContext={{ orderNumber: order.order_number }}
          onAttached={handleCountertopAttached}
          onClose={() => setIsCountertopOpen(false)}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <ComponentCard title="Notes" desc="Customer-facing and internal context for this revision.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer Notes"><TextArea rows={5} value={customerNotes} onChange={setCustomerNotes} /></Field>
              <Field label="Internal Notes"><TextArea rows={5} value={internalNotes} onChange={setInternalNotes} /></Field>
            </div>
          </ComponentCard>
          <ComponentCard title="Revision Reason" desc="Record why the commercial order changed.">
            <Field label="Reason" hint="Recommended. Sales revisions from Confirmed through Ready for Shipment stay pending until Admin approval; Shipped and later orders are revision-locked.">
              <Input value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} placeholder="e.g. Quantity changed after customer request" />
            </Field>
          </ComponentCard>
        </div>
        <div className="xl:col-span-4">
          <ComponentCard title="Revised Total" desc="Preview; the server remains authoritative when the revision is saved.">
            <div className="space-y-3">
              <SummaryRow label="Lines after discount" value={money(preview.subtotal)} />
              <SummaryRow label="Order discount" value={`-${money(Number(orderDiscount || 0))}`} />
              <SummaryRow label="Tax" value={money(preview.tax)} />
              <SummaryRow label="Order Total" value={money(preview.orderTotal)} />
              {preview.commission > 0 ? <SummaryRow label={`Payment Commission (${Number(appliedCommission || 0).toFixed(2)}%)`} value={money(preview.commission)} /> : null}
              <SummaryRow label="Grand Total" value={money(preview.grandTotal)} strong divider />
              {commissionOverridden ? <Alert variant="warning" title="Commission override" message={`Payment commission differs from the default ${defaultCommission.toFixed(2)}% and may require approval.`} /> : null}
              <Button className="w-full" disabled={isSaving || isLoadingPrices || !revisionPolicy.canEdit} onClick={saveRevision}>{isSaving ? "Saving…" : revisionPolicy.mode === "approval" ? "Submit for Approval" : "Save Revision"}</Button>
            </div>
          </ComponentCard>
        </div>
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
    </div>
  );
}
