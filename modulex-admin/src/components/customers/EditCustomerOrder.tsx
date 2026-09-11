"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import SummaryRow from "@/components/common/SummaryRow";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";
import CountertopLineDetails from "@/components/customers/CountertopLineDetails";
import CustomVendorCabinetLineModal from "@/components/customers/CustomVendorCabinetLineModal";
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
  cleanupCustomVendorCabinetDocument,
  createCustomVendorCabinetOrderLine,
  getCustomVendorCabinetDocument,
  getCustomVendorCabinetDocumentUrl,
  removeCustomVendorCabinetDocument,
  updateCustomVendorCabinetOrderLine,
  uploadCustomVendorCabinetDocument,
  type CustomVendorCabinetDocument,
  type CustomVendorCabinetDraft,
  type CustomVendorCabinetEditDraft,
} from "@/lib/customers/custom-vendor-cabinet";
import {
  getCustomerOrderRevisionPolicy,
  loadEditOrderContext,
  loadOrderPrices,
  removeCountertopOrderItem,
  type OrderPriceRow,
  type OrderTaxRule,
} from "@/lib/customers/order-domain";
import { updateCustomerOrderWithAdministrativeFee } from "@/lib/customers/order-administrative-fee-domain";
import {
  ORDER_QUANTITY_DECIMAL,
  parseOrderMoney,
  parseOrderPercent,
  parseOrderQuantity,
} from "@/lib/customers/order-validation";
import { supabase } from "@/lib/supabase/client";
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
import { calculateDbDecimalBulk, compareDbDecimal } from "@/lib/validation";
import DateInput from "@/components/form/DateInput";

type Product = OrderPickerProduct;
type PriceRow = OrderPriceRow;
type OrderLinePricingModel = OrderPricingModel | "manual_vendor_cabinet";
type DraftItem = {
  id?: string;
  product_id: string;
  sku_snapshot: string;
  product_name_snapshot: string;
  display_name_override: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  pricing_model: OrderLinePricingModel | null;
  line_note: string;
  vendor_id: string;
  vendor_name_snapshot: string;
  manual_cost_amount: string;
  manual_markup_percent: string;
  source_document_id: string;
};
type TaxRule = OrderTaxRule;
type ValidatedRevisionItem = {
  id?: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  pricingModel: OrderPricingModel | null;
  lineNote: string;
};
type ItemFieldErrors = Partial<Record<"quantity" | "unit_price" | "discount_percent" | "line_note", string>>;
type FieldErrors = {
  priceGroupId?: string;
  paymentMethodId?: string;
  administrativeFeePercent?: string;
  shippingAddressId?: string;
  orderDiscount?: string;
  taxRate?: string;
  items?: Record<number, ItemFieldErrors>;
};

type VendorCabinetItemSnapshot = CustomerOrderItem & {
  vendor_id?: string | null;
  vendor_name_snapshot?: string | null;
  manual_cost_amount?: string | number | null;
  manual_markup_percent?: string | number | null;
  source_document_id?: string | null;
};

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

function pricingModelFor(item: DraftItem, product: Product | undefined): OrderLinePricingModel | null {
  return item.pricing_model ?? product?.pricing_model ?? null;
}

function resolveOrderLineUnitPriceValue(item: DraftItem, product: Product | undefined, priceValueMap: Map<string, string>) {
  const model = pricingModelFor(item, product);
  if (model === "price_group") return priceValueMap.get(item.product_id);
  if (model === "manual_vendor_cabinet") return item.unit_price;
  if ((model === "countertop_material_band" || model === "manual_service") && (item.id || model === "manual_service")) {
    return item.unit_price;
  }
  return undefined;
}

function mapDraftItem(item: CustomerOrderItem): DraftItem {
  const vendorSnapshot = item as VendorCabinetItemSnapshot;
  return {
    id: item.id,
    product_id: item.product_id ?? "",
    sku_snapshot: item.sku_snapshot ?? "",
    product_name_snapshot: item.product_name_snapshot ?? "",
    display_name_override: item.display_name_override ?? "",
    quantity: String(item.quantity),
    unit_price: String(item.unit_price),
    discount_percent: String(item.discount_percent),
    pricing_model: (item.pricing_model_snapshot as OrderLinePricingModel | null | undefined) ?? null,
    line_note: item.line_note ?? "",
    vendor_id: vendorSnapshot.vendor_id ?? "",
    vendor_name_snapshot: vendorSnapshot.vendor_name_snapshot ?? "",
    manual_cost_amount: vendorSnapshot.manual_cost_amount == null ? "" : String(vendorSnapshot.manual_cost_amount),
    manual_markup_percent: vendorSnapshot.manual_markup_percent == null ? "" : String(vendorSnapshot.manual_markup_percent),
    source_document_id: vendorSnapshot.source_document_id ?? "",
  };
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return <div><Label htmlFor={htmlFor}>{label}</Label>{children}{hint ? <FormHint>{hint}</FormHint> : null}</div>;
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
  const [administrativeFeePercent, setAdministrativeFeePercent] = useState("0");
  const [billingAddressId, setBillingAddressId] = useState("");
  const [shippingAddressId, setShippingAddressId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [reference, setReference] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [revisionReason, setRevisionReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isCabinetSourceModalOpen, setIsCabinetSourceModalOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isVendorCabinetModalOpen, setIsVendorCabinetModalOpen] = useState(false);
  const [isAddingVendorCabinet, setIsAddingVendorCabinet] = useState(false);
  const [isUpdatingVendorCabinet, setIsUpdatingVendorCabinet] = useState(false);
  const [editingVendorCabinetItemId, setEditingVendorCabinetItemId] = useState<string | null>(null);
  const [editingVendorCabinetDocument, setEditingVendorCabinetDocument] = useState<CustomVendorCabinetDocument | null>(null);
  const [isCountertopOpen, setIsCountertopOpen] = useState(false);
  const [countertopEditItemId, setCountertopEditItemId] = useState<string | null>(null);
  const [countertopRemoveItemId, setCountertopRemoveItemId] = useState<string | null>(null);
  const [countertopRemoveReason, setCountertopRemoveReason] = useState("");
  const [isRemovingCountertop, setIsRemovingCountertop] = useState(false);
  const [savingCountertopTitleItemId, setSavingCountertopTitleItemId] = useState<string | null>(null);
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
        setAdministrativeFeePercent(String(loadedOrder.administrative_fee_percent ?? 0));
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
  const priceValueMap = useMemo(() => new Map(prices.map((price) => [price.product_id, String(price.amount)])), [prices]);
  const summariesByItemId = useMemo(() => new Map(countertopSummaries.map((summary) => [summary.orderItemId, summary])), [countertopSummaries]);
  const selectedQuantities = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of items) {
      if (!item.product_id) continue;
      values.set(item.product_id, (values.get(item.product_id) ?? 0) + Number(item.quantity || 0));
    }
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
  const editingVendorCabinetItem = editingVendorCabinetItemId ? items.find((item) => item.id === editingVendorCabinetItemId) ?? null : null;

  const preview = useMemo(() => {
    let subtotal = 0;
    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity || 0));
      const price = Math.max(0, Number(resolveOrderLineUnitPriceValue(item, productMap.get(item.product_id), priceValueMap) ?? 0));
      const discount = Math.min(100, Math.max(0, Number(item.discount_percent || 0)));
      subtotal += qty * price * (1 - discount / 100);
    }
    const discountAmount = Math.max(0, Number(orderDiscount || 0));
    const baseSell = Math.max(0, subtotal - discountAmount);
    const administrativeFee = Math.round(baseSell * Math.min(100, Math.max(0, Number(administrativeFeePercent || 0))) / 100 * 100) / 100;
    const customerVisibleSell = baseSell + administrativeFee;
    const tax = customerVisibleSell * Math.max(0, Number(taxRate || 0)) / 100;
    return { subtotal, baseSell, administrativeFee, customerVisibleSell, tax, grandTotal: customerVisibleSell + tax };
  }, [items, productMap, priceValueMap, orderDiscount, taxRate, administrativeFeePercent]);

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
      errors.priceGroupId ? "edit-order-price-group" : null,
      errors.paymentMethodId ? "edit-order-payment-method" : null,
      errors.administrativeFeePercent ? "edit-order-administrative-fee" : null,
      errors.shippingAddressId ? "edit-order-shipping-address" : null,
      errors.orderDiscount ? "edit-order-discount" : null,
      errors.taxRate ? "edit-order-tax-rate" : null,
      ...Object.entries(errors.items ?? {}).flatMap(([index, itemErrors]) => [
        itemErrors.quantity ? `edit-order-item-${index}-quantity` : null,
        itemErrors.discount_percent ? `edit-order-item-${index}-discount` : null,
      ]),
    ].find((value): value is string => Boolean(value));
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  }

  function updateItem(index: number, values: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  function addProduct(product: Product) {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.product_id === product.id && pricingModelFor(item, product) === "price_group");
      if (existingIndex >= 0) {
        return current.map((item, index) => {
          if (index !== existingIndex) return item;
          const nextQuantity = calculateDbDecimalBulk(item.quantity, "1", "current_amount", ORDER_QUANTITY_DECIMAL);
          return nextQuantity.error || nextQuantity.value === null ? item : { ...item, quantity: nextQuantity.value };
        });
      }
      const groupPrice = priceValueMap.get(product.id);
      return [...current, {
        product_id: product.id,
        sku_snapshot: product.sku,
        product_name_snapshot: product.name,
        display_name_override: "",
        quantity: "1",
        unit_price: groupPrice ?? "0",
        discount_percent: "0",
        pricing_model: product.pricing_model,
        line_note: "",
        vendor_id: "",
        vendor_name_snapshot: "",
        manual_cost_amount: "",
        manual_markup_percent: "",
        source_document_id: "",
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
    const parsedPrice = parseOrderMoney(String(value.unitPrice));
    if (parsedPrice.error || parsedPrice.value === null) {
      setErrorMessage(parsedPrice.error ?? "Service price is invalid.");
      return;
    }
    if (serviceEditIndex !== null) {
      clearItemError(serviceEditIndex, "unit_price");
      clearItemError(serviceEditIndex, "line_note");
      updateItem(serviceEditIndex, { line_note: value.lineNote, unit_price: parsedPrice.value, quantity: "1", pricing_model: "manual_service" });
    } else if (serviceProduct) {
      setItems((current) => [...current, {
        product_id: serviceProduct.id,
        sku_snapshot: serviceProduct.sku,
        product_name_snapshot: serviceProduct.name,
        display_name_override: "",
        quantity: "1",
        unit_price: parsedPrice.value!,
        discount_percent: "0",
        pricing_model: "manual_service",
        line_note: value.lineNote,
        vendor_id: "",
        vendor_name_snapshot: "",
        manual_cost_amount: "",
        manual_markup_percent: "",
        source_document_id: "",
      }]);
    }
    setIsServiceModalOpen(false);
    setServiceEditIndex(null);
  }

  async function reloadAuthoritativeOrder() {
    const context = await loadEditOrderContext(customerId, orderId);
    setOrder(context.order);
    setProducts(context.products as Product[]);
    setCountertopSummaries(context.countertopSummaries);
    setItems(context.items.map(mapDraftItem));
    setOrderDiscount(String(context.order.discount_amount ?? 0));
    return context;
  }

  function closeVendorCabinetModal() {
    if (isAddingVendorCabinet || isUpdatingVendorCabinet) return;
    setIsVendorCabinetModalOpen(false);
    setEditingVendorCabinetItemId(null);
    setEditingVendorCabinetDocument(null);
  }

  async function addVendorCabinet(value: CustomVendorCabinetDraft) {
    if (!order || order.status !== "draft") {
      setErrorMessage("Vendor Cabinet lines can only be added while the Order is Draft.");
      return;
    }
    if (isAddingVendorCabinet) return;
    setIsAddingVendorCabinet(true);
    setErrorMessage(null);
    let uploaded: Awaited<ReturnType<typeof uploadCustomVendorCabinetDocument>> | null = null;
    let lineCreated = false;
    try {
      uploaded = await uploadCustomVendorCabinetDocument({
        orderId: order.id,
        vendorName: value.vendorName,
        lineName: value.lineName,
        file: value.file,
      });
      await createCustomVendorCabinetOrderLine({
        orderId: order.id,
        vendorId: value.vendorId,
        lineName: value.lineName,
        totalCost: value.totalCost,
        markupPercent: value.markupPercent,
        documentId: uploaded.documentId,
        orderDiscountAmount: orderDiscount,
      });
      lineCreated = true;
      await reloadAuthoritativeOrder();
      setIsVendorCabinetModalOpen(false);
      setIsCabinetSourceModalOpen(false);
    } catch (error) {
      if (uploaded && !lineCreated) await cleanupCustomVendorCabinetDocument(uploaded);
      setErrorMessage(operationErrorMessage(error, lineCreated ? "Vendor Cabinet was added, but the Order could not be refreshed." : "Unable to add Vendor Cabinet to this Order."));
    } finally {
      setIsAddingVendorCabinet(false);
    }
  }

  async function openVendorCabinetEditor(item: DraftItem) {
    if (!order || order.status !== "draft") {
      setErrorMessage("Vendor Cabinet packages can only be edited while the Order is Draft.");
      return;
    }
    if (!item.id || !item.vendor_id || !item.source_document_id) {
      setErrorMessage("This Vendor Cabinet package is missing its Vendor or source PDF reference.");
      return;
    }
    setIsUpdatingVendorCabinet(true);
    setErrorMessage(null);
    try {
      const document = await getCustomVendorCabinetDocument(item.source_document_id);
      setEditingVendorCabinetItemId(item.id);
      setEditingVendorCabinetDocument(document);
      setIsVendorCabinetModalOpen(true);
    } catch (error) {
      setErrorMessage(operationErrorMessage(error, "Unable to open Vendor Cabinet editor."));
    } finally {
      setIsUpdatingVendorCabinet(false);
    }
  }

  async function viewVendorCabinetPdf(item: DraftItem) {
    if (!item.source_document_id) {
      setErrorMessage("This Vendor Cabinet package has no source PDF reference.");
      return;
    }
    setErrorMessage(null);
    try {
      const document = editingVendorCabinetDocument?.documentId === item.source_document_id
        ? editingVendorCabinetDocument
        : await getCustomVendorCabinetDocument(item.source_document_id);
      const signedUrl = await getCustomVendorCabinetDocumentUrl(document);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(operationErrorMessage(error, "Unable to open Vendor Cabinet PDF."));
    }
  }

  async function updateVendorCabinet(value: CustomVendorCabinetEditDraft) {
    const itemId = editingVendorCabinetItemId;
    const currentDocument = editingVendorCabinetDocument;
    const currentItem = itemId ? items.find((item) => item.id === itemId) ?? null : null;
    if (!order || order.status !== "draft" || !itemId || !currentDocument || !currentItem) {
      setErrorMessage("Vendor Cabinet package context is no longer available. Reload the Order and try again.");
      return;
    }
    if (isUpdatingVendorCabinet) return;

    setIsUpdatingVendorCabinet(true);
    setErrorMessage(null);
    let replacement: Awaited<ReturnType<typeof uploadCustomVendorCabinetDocument>> | null = null;
    let lineUpdated = false;
    try {
      if (value.replacementFile) {
        replacement = await uploadCustomVendorCabinetDocument({
          orderId: order.id,
          vendorName: value.vendorName,
          lineName: value.lineName,
          file: value.replacementFile,
        });
      }

      await updateCustomVendorCabinetOrderLine({
        orderItemId: itemId,
        vendorId: value.vendorId,
        lineName: value.lineName,
        totalCost: value.totalCost,
        markupPercent: value.markupPercent,
        documentId: replacement?.documentId ?? currentDocument.documentId,
        orderDiscountAmount: orderDiscount,
      });
      lineUpdated = true;
      await reloadAuthoritativeOrder();
      setIsVendorCabinetModalOpen(false);
      setEditingVendorCabinetItemId(null);
      setEditingVendorCabinetDocument(null);

      if (replacement) {
        try {
          await removeCustomVendorCabinetDocument(currentDocument);
        } catch (cleanupError) {
          setErrorMessage(operationErrorMessage(cleanupError, "Vendor Cabinet was updated, but the previous PDF could not be removed. Retry document cleanup before closing this Order."));
        }
      }
    } catch (error) {
      if (replacement && !lineUpdated) await cleanupCustomVendorCabinetDocument(replacement);
      setErrorMessage(operationErrorMessage(error, lineUpdated ? "Vendor Cabinet was updated, but the Order could not be refreshed." : "Unable to update Vendor Cabinet package."));
    } finally {
      setIsUpdatingVendorCabinet(false);
    }
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

  async function saveCountertopLineTitle(index: number) {
    const item = items[index];
    if (!item?.id || !order || order.status !== "draft" || !summariesByItemId.has(item.id)) return;

    const normalizedTitle = item.display_name_override.trim();
    setSavingCountertopTitleItemId(item.id);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc("set_countertop_order_item_title", {
        p_order_item_id: item.id,
        p_title: item.display_name_override,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("Countertop line title mutation returned an invalid response.");
      updateItem(index, { display_name_override: normalizedTitle === item.product_name_snapshot ? "" : normalizedTitle });
    } catch (error) {
      setErrorMessage(operationErrorMessage(error, "Unable to save Countertop line title."));
    } finally {
      setSavingCountertopTitleItemId(null);
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
    clearHeaderError("priceGroupId");
    setPriceGroupId(groupId);
    const group = priceGroups.find((item) => item.id === groupId);
    if (group?.system_key === "pickup_level") handleFulfillmentChange("pickup");
    else if (fulfillmentType === "pickup") handleFulfillmentChange("delivery");
  }

  function handleFulfillmentChange(next: OrderFulfillmentType) {
    setFulfillmentType(next);
    if (next === "pickup") clearHeaderError("shippingAddressId");
    const rule = taxRules.find((item) => item.fulfillment_type === next && item.is_active && item.tax_rate !== null);
    if (rule) {
      clearHeaderError("taxRate");
      setTaxRate(String(rule.tax_rate));
    }
  }

  function validateRevision(): { items: ValidatedRevisionItem[]; taxRate: string; orderDiscount: string; administrativeFeePercent: string } | null {
    setErrorMessage(null);
    if (!order || !revisionPolicy?.canEdit) {
      setErrorMessage(revisionPolicy?.reason ?? "This order cannot be revised.");
      return null;
    }
    if (items.length === 0) {
      setErrorMessage("At least one order line is required.");
      return null;
    }

    const errors: FieldErrors = {};
    if (!priceGroupId) errors.priceGroupId = "Price group is required.";
    if (!paymentMethodId) errors.paymentMethodId = "Payment method is required.";
    if (fulfillmentType !== "pickup" && !shippingAddressId) errors.shippingAddressId = "Shipping address is required for delivery.";

    const administrativeFee = parseOrderPercent(administrativeFeePercent);
    const discount = parseOrderMoney(orderDiscount);
    const tax = parseOrderPercent(taxRate);
    if (administrativeFee.error || administrativeFee.value === null) errors.administrativeFeePercent = administrativeFee.error ?? "Enter a valid Administrative Fee.";
    if (discount.error || discount.value === null) errors.orderDiscount = discount.error ?? "Enter a valid order discount.";
    if (tax.error || tax.value === null) errors.taxRate = tax.error ?? "Enter a valid tax rate.";

    const itemErrors: Record<number, ItemFieldErrors> = {};
    const validatedItems: ValidatedRevisionItem[] = [];
    let blockingMessage: string | null = null;

    items.forEach((item, index) => {
      const product = productMap.get(item.product_id);
      const model = pricingModelFor(item, product);
      const itemError: ItemFieldErrors = {};
      const quantity = parseOrderQuantity(item.quantity);
      const lineDiscount = parseOrderPercent(item.discount_percent);
      if (quantity.error || quantity.value === null) itemError.quantity = quantity.error ?? "Enter a valid quantity.";
      if (lineDiscount.error || lineDiscount.value === null) itemError.discount_percent = lineDiscount.error ?? "Enter a valid line discount.";

      if (model === "manual_vendor_cabinet") {
        const unitPrice = parseOrderMoney(item.unit_price);
        if (!item.id || item.product_id) blockingMessage ??= "Vendor Cabinet lines must be managed through the dedicated Vendor Cabinet workflow.";
        if (quantity.value !== null && compareDbDecimal(quantity.value, "1", ORDER_QUANTITY_DECIMAL) !== 0) itemError.quantity = "Vendor Cabinet quantity is fixed at 1.";
        if (lineDiscount.value !== null && Number(lineDiscount.value) !== 0) itemError.discount_percent = "Vendor Cabinet line discount is fixed at 0; use the Order discount.";
        if (unitPrice.error || unitPrice.value === null) itemError.unit_price = unitPrice.error ?? "Vendor Cabinet sell price is invalid.";
        if (Object.keys(itemError).length) itemErrors[index] = itemError;
        return;
      }

      if (model === "countertop_material_band" && !item.id) blockingMessage ??= "Countertop Material Band products must be configured through the Countertop action.";
      if (model === "none") blockingMessage ??= "No Commercial Pricing products cannot be added to customer orders.";
      if (!item.product_id) blockingMessage ??= "Select a product for every line.";

      const unitPriceValue = resolveOrderLineUnitPriceValue(item, product, priceValueMap);
      const unitPrice = parseOrderMoney(unitPriceValue);
      if (model === "manual_service") {
        if (quantity.value !== null && compareDbDecimal(quantity.value, "1", ORDER_QUANTITY_DECIMAL) !== 0) itemError.quantity = "Service quantity must remain fixed at 1.";
        if (!item.line_note.trim()) itemError.line_note = "Service detail is required.";
        if (unitPrice.error || unitPrice.value === null) itemError.unit_price = unitPrice.error ?? "Enter a valid service price.";
      } else if (model === "price_group" && !priceValueMap.has(item.product_id)) {
        blockingMessage ??= `No current Price Group price exists for ${product?.sku ?? item.sku_snapshot ?? "selected product"}.`;
      } else if (unitPrice.error || unitPrice.value === null) {
        blockingMessage ??= "The selected product does not have a valid commercial price for this order.";
      }

      if (Object.keys(itemError).length) itemErrors[index] = itemError;
      if (!blockingMessage && Object.keys(itemError).length === 0 && quantity.value !== null && lineDiscount.value !== null && unitPrice.value !== null) {
        validatedItems.push({
          id: item.id,
          productId: item.product_id,
          quantity: quantity.value,
          unitPrice: unitPrice.value,
          discountPercent: lineDiscount.value,
          pricingModel: model as OrderPricingModel | null,
          lineNote: item.line_note,
        });
      }
    });

    if (Object.keys(itemErrors).length) errors.items = itemErrors;
    if (blockingMessage || Object.keys(errors).length) {
      setFieldErrors(errors);
      setErrorMessage(blockingMessage ?? "Correct the highlighted order fields.");
      focusFirstInvalid(errors);
      return null;
    }

    if (validatedItems.length === 0 && items.some((item) => pricingModelFor(item, productMap.get(item.product_id)) === "manual_vendor_cabinet")) {
      setErrorMessage("This Draft contains only Vendor Cabinet lines. Vendor Cabinet package data is already saved; add a Stock/Service line before using the generic revision action.");
      return null;
    }

    setFieldErrors({});
    return { items: validatedItems, taxRate: tax.value!, orderDiscount: discount.value!, administrativeFeePercent: administrativeFee.value! };
  }

  async function saveRevision() {
    const validated = validateRevision();
    if (!validated || !order) return;

    setIsSaving(true);
    try {
      const revision = await updateCustomerOrderWithAdministrativeFee({
        orderId: order.id,
        items: validated.items,
        priceGroupId,
        billingAddressId,
        shippingAddressId,
        expectedDeliveryDate: expectedDate,
        customerReference: reference,
        customerNotes,
        internalNotes,
        taxRate: validated.taxRate,
        orderDiscountAmount: validated.orderDiscount,
        paymentMethodId,
        paymentCommissionPercent: order.payment_commission_percent ?? 0,
        administrativeFeePercent: validated.administrativeFeePercent,
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
  const taxHint = selectedTaxRule?.is_active && selectedTaxRule.tax_rate !== null ? `Configured tax rule: ${Number(selectedTaxRule.tax_rate).toFixed(3)}%` : "No active tax rule configured.";
  const editingService = serviceEditIndex === null ? null : items[serviceEditIndex] ?? null;

  return (
    <div className="space-y-5">
      {errorMessage ? <Alert variant="error" title="Order revision failed" message={errorMessage} /> : null}
      {isAddingVendorCabinet ? <Alert variant="info" title="Adding Vendor Cabinet" message="Uploading the private PDF and adding the quoted Cabinet package to this Draft…" /> : null}
      {isUpdatingVendorCabinet ? <Alert variant="info" title="Updating Vendor Cabinet" message="Saving the quoted Cabinet package and private PDF state…" /> : null}
      {selectedPriceGroup?.requires_approval ? <Alert variant="warning" title="Approval required" message={`${selectedPriceGroup.name} is a restricted price group. Sales use requires approval.`} /> : null}

      <ComponentCard title={`Edit ${order.order_number}`} desc={`${customer.name} · ${revisionPolicy.reason}`} headerAction={<Button variant="outline" onClick={() => router.push(`/customers/${customerId}/orders/${orderId}`)}>Back to Order</Button>}>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Field label="Price Group" htmlFor="edit-order-price-group" hint={fieldErrors.priceGroupId ?? (isLoadingPrices ? "Loading group prices…" : undefined)}><Select id="edit-order-price-group" error={Boolean(fieldErrors.priceGroupId)} options={priceGroups.map((group) => ({ value: group.id, label: `${group.name}${group.requires_approval ? " · Approval" : ""}` }))} value={priceGroupId} onChange={handlePriceGroupChange} /></Field>
          <Field label="Fulfillment Type" htmlFor="edit-order-fulfillment-type" hint={taxHint}><Select id="edit-order-fulfillment-type" options={[{ value: "pickup", label: "Customer Pickup" }, { value: "delivery", label: "Delivery" }, { value: "delivery_installation", label: "Delivery + Installation" }]} value={fulfillmentType} onChange={(value) => handleFulfillmentChange(value as OrderFulfillmentType)} /></Field>
          <Field label="Payment Method" htmlFor="edit-order-payment-method" hint={fieldErrors.paymentMethodId}><Select id="edit-order-payment-method" error={Boolean(fieldErrors.paymentMethodId)} options={paymentMethods.map((method) => ({ value: method.id, label: method.name }))} value={paymentMethodId} onChange={(id) => { clearHeaderError("paymentMethodId"); setPaymentMethodId(id); }} /></Field>
          <Field label="Administrative Fee (%)" htmlFor="edit-order-administrative-fee" hint="Order snapshot. Changing it follows the existing revision/approval rules."><Input id="edit-order-administrative-fee" type="number" min="0" max="100" step="0.001" inputMode="decimal" value={administrativeFeePercent} error={Boolean(fieldErrors.administrativeFeePercent)} hint={fieldErrors.administrativeFeePercent} onChange={(event) => { clearHeaderError("administrativeFeePercent"); setAdministrativeFeePercent(event.target.value); }} /></Field>
          <Field label="Expected Delivery" htmlFor="edit-order-expected-delivery"><DateInput id="edit-order-expected-delivery" value={expectedDate} onChange={(event) => setExpectedDate(event)} /></Field>
          <Field label="Customer Reference" htmlFor="edit-order-customer-reference"><Input id="edit-order-customer-reference" value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Field label="Billing Address" htmlFor="edit-order-billing-address"><Select id="edit-order-billing-address" options={addresses.filter((address) => ["billing", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={billingAddressId} placeholder="None" allowEmpty onChange={setBillingAddressId} /></Field>
          <Field label="Shipping Address" htmlFor="edit-order-shipping-address" hint={fieldErrors.shippingAddressId}><Select id="edit-order-shipping-address" error={Boolean(fieldErrors.shippingAddressId)} options={addresses.filter((address) => ["shipping", "both"].includes(address.address_type)).map((address) => ({ value: address.id, label: `${address.address_name} — ${address.city}` }))} value={shippingAddressId} placeholder="None" allowEmpty onChange={(value) => { clearHeaderError("shippingAddressId"); setShippingAddressId(value); }} /></Field>
          <Field label={`Order Discount (${currency})`} htmlFor="edit-order-discount" hint="Sales discounts are approval-controlled."><Input id="edit-order-discount" inputMode="decimal" value={orderDiscount} error={Boolean(fieldErrors.orderDiscount)} hint={fieldErrors.orderDiscount} onChange={(event) => { clearHeaderError("orderDiscount"); setOrderDiscount(event.target.value); }} /></Field>
          <Field label="Tax Rate (%)" htmlFor="edit-order-tax-rate" hint="Tax overrides against an active fulfillment rule require approval."><Input id="edit-order-tax-rate" inputMode="decimal" value={taxRate} error={Boolean(fieldErrors.taxRate)} hint={fieldErrors.taxRate} onChange={(event) => { clearHeaderError("taxRate"); setTaxRate(event.target.value); }} /></Field>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Products"
        desc="Cabinet starts with a Stock/Vendor source choice. Stock uses canonical Price Group products; Vendor Cabinet uses one productless quoted package with private PDF, cost and markup."
        headerAction={<div className="flex flex-wrap justify-end gap-2">{canManageCountertop && order.status === "draft" ? <Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} onClick={() => { setCountertopEditItemId(null); setIsCountertopOpen(true); }}>Countertop</Button> : null}<Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={() => setIsCabinetSourceModalOpen(true)}>Cabinet</Button><Button size="sm" variant="outline" startIcon={<PlusIcon className="size-4" />} onClick={openNewService}>Service</Button></div>}
      >
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin"><TableRow>{["Product", "Qty", "Server Price", "Discount %", "Line Total", ""].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={6}>No order lines. Choose Countertop, Cabinet, or Service.</TableStateRow> : items.map((item, index) => {
                const product = productMap.get(item.product_id);
                const model = pricingModelFor(item, product);
                const isService = model === "manual_service";
                const isVendorCabinet = model === "manual_vendor_cabinet";
                const resolvedPriceValue = resolveOrderLineUnitPriceValue(item, product, priceValueMap);
                const resolvedPrice = Number(resolvedPriceValue ?? 0);
                const total = Number(item.quantity || 0) * resolvedPrice * (1 - Number(item.discount_percent || 0) / 100);
                const countertopSummary = item.id ? summariesByItemId.get(item.id) : null;
                const isConfiguredCountertop = Boolean(item.id && countertopSummary);
                const canMutateConfiguredCountertop = isConfiguredCountertop && canManageCountertop && order.status === "draft";
                const itemError = fieldErrors.items?.[index];
                const displaySku = item.sku_snapshot || product?.sku || (isVendorCabinet ? "VENDOR-CABINET" : "Historical product");
                const displayName = item.display_name_override.trim() || item.product_name_snapshot || product?.name || (isVendorCabinet ? "Vendor Cabinet" : item.product_id);
                return (
                  <TableRow key={item.id ?? `${item.product_id}-${index}`}>
                    <TableCell variant="admin" className="min-w-[360px]">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{displaySku}</span>{isVendorCabinet ? <Badge size="sm" color="info">Vendor Cabinet</Badge> : null}{product?.status === "inactive" ? <Badge size="sm" color="warning">Inactive</Badge> : null}</div>
                      <FormHint>{displayName}</FormHint>
                      {isVendorCabinet ? <FormHint>{item.vendor_name_snapshot || "Vendor"}{item.manual_cost_amount ? ` · Cost ${money(Number(item.manual_cost_amount), currency)}` : ""}{item.manual_markup_percent ? ` · Markup ${Number(item.manual_markup_percent).toFixed(3)}%` : ""} · private PDF attached</FormHint> : null}
                      {canMutateConfiguredCountertop && item.id ? (
                        <div className="mt-3 max-w-xl">
                          <Field label="Line Title" htmlFor={`edit-order-countertop-title-${index}`} hint="Order-only display name. Leave blank and save to use the historical Stone name. Maximum 160 characters.">
                            <div className="flex flex-wrap gap-2">
                              <div className="min-w-[220px] flex-1"><Input id={`edit-order-countertop-title-${index}`} ariaLabel="Countertop line title" value={item.display_name_override} onChange={(event) => updateItem(index, { display_name_override: event.target.value })} /></div>
                              <Button size="sm" variant="outline" disabled={savingCountertopTitleItemId === item.id} onClick={() => void saveCountertopLineTitle(index)}>{savingCountertopTitleItemId === item.id ? "Saving…" : "Save title"}</Button>
                            </div>
                          </Field>
                        </div>
                      ) : null}
                      <CountertopLineDetails summary={countertopSummary} />
                      {!isVendorCabinet ? <ServiceLineDetails lineNote={item.line_note} /> : null}
                      {itemError?.unit_price ? <FormHint>{itemError.unit_price}</FormHint> : null}
                      {itemError?.line_note ? <FormHint>{itemError.line_note}</FormHint> : null}
                    </TableCell>
                    <TableCell variant="admin" className="w-28">{isVendorCabinet ? <FormHint>1 · package</FormHint> : isConfiguredCountertop ? <FormHint>{item.quantity} · configured{itemError?.quantity ? ` · ${itemError.quantity}` : ""}</FormHint> : isService ? <FormHint>1 · fixed{itemError?.quantity ? ` · ${itemError.quantity}` : ""}</FormHint> : <Input id={`edit-order-item-${index}-quantity`} ariaLabel={`${displaySku} quantity`} inputMode="decimal" value={item.quantity} error={Boolean(itemError?.quantity)} hint={itemError?.quantity} onChange={(event) => { clearItemError(index, "quantity"); updateItem(index, { quantity: event.target.value }); }} />}</TableCell>
                    <TableCell variant="admin" className="min-w-[180px]"><span className="font-semibold">{resolvedPriceValue === undefined ? "Unavailable" : money(resolvedPrice, currency)}</span><FormHint>{isVendorCabinet ? "Vendor Cabinet · cost + markup" : model === "countertop_material_band" ? "Countertop · configured price" : model === "manual_service" ? "Service · explicit price" : "Price Group · server authoritative"}</FormHint></TableCell>
                    <TableCell variant="admin" className="w-32">{isVendorCabinet ? <FormHint>0.00% · package</FormHint> : isConfiguredCountertop ? <FormHint>{Number(item.discount_percent || 0).toFixed(2)}% · configured{itemError?.discount_percent ? ` · ${itemError.discount_percent}` : ""}</FormHint> : <Input id={`edit-order-item-${index}-discount`} ariaLabel={`${displaySku} discount percent`} inputMode="decimal" value={item.discount_percent} error={Boolean(itemError?.discount_percent)} hint={itemError?.discount_percent} onChange={(event) => { clearItemError(index, "discount_percent"); updateItem(index, { discount_percent: event.target.value }); }} />}</TableCell>
                    <TableCell variant="admin" className="font-semibold">{money(total, currency)}</TableCell>
                    <TableCell variant="admin" className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isVendorCabinet ? (
                          item.id ? <>
                            {order.status === "draft" ? <Button size="sm" variant="outline" disabled={isUpdatingVendorCabinet} onClick={() => void openVendorCabinetEditor(item)}>Edit Vendor Cabinet</Button> : null}
                            <Button size="sm" variant="outline" onClick={() => void viewVendorCabinetPdf(item)}>View PDF</Button>
                          </> : <FormHint>Vendor Cabinet package is not saved yet.</FormHint>
                        ) : isConfiguredCountertop ? (
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
      {countertopEditItemId ? <CountertopConfigurator orderId={order.id} orderItemId={countertopEditItemId} orderContext={{ orderNumber: order.order_number, sku: countertopEditItem?.sku_snapshot || productMap.get(countertopEditItem?.product_id ?? "")?.sku, productName: countertopEditItem?.display_name_override.trim() || countertopEditItem?.product_name_snapshot || productMap.get(countertopEditItem?.product_id ?? "")?.name }} onAttached={handleCountertopAttached} onClose={() => setCountertopEditItemId(null)} /> : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8"><ComponentCard title="Notes" desc="Customer-facing and internal context for this revision."><div className="grid gap-4 md:grid-cols-2"><Field label="Customer Notes" htmlFor="edit-order-customer-notes"><TextArea id="edit-order-customer-notes" rows={5} value={customerNotes} onChange={setCustomerNotes} /></Field><Field label="Internal Notes" htmlFor="edit-order-internal-notes"><TextArea id="edit-order-internal-notes" rows={5} value={internalNotes} onChange={setInternalNotes} /></Field></div></ComponentCard><ComponentCard title="Revision Reason" desc="Record why the commercial order changed."><Field label="Reason" htmlFor="edit-order-revision-reason" hint="Recommended. Sales revisions from Confirmed through Ready for Shipment stay pending until Admin approval; Shipped and later orders are revision-locked."><Input id="edit-order-revision-reason" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} placeholder="e.g. Quantity changed after customer request" /></Field></ComponentCard></div>
        <div className="xl:col-span-4"><ComponentCard title="Revised Total" desc="Internal preview; the server remains authoritative when the revision is saved."><div className="space-y-3"><SummaryRow label="Lines after discount" value={money(preview.subtotal, currency)} /><SummaryRow label="Order discount" value={`-${money(Number(orderDiscount || 0), currency)}`} /><SummaryRow label="Base Sell" value={money(preview.baseSell, currency)} /><SummaryRow label={`Administrative Fee (${Number(administrativeFeePercent || 0).toFixed(3)}%)`} value={money(preview.administrativeFee, currency)} /><SummaryRow label="Customer-visible Sell" value={money(preview.customerVisibleSell, currency)} /><SummaryRow label="Tax" value={money(preview.tax, currency)} /><SummaryRow label="Customer Total" value={money(preview.grandTotal, currency)} strong divider /><Button className="w-full" disabled={isSaving || isLoadingPrices || !revisionPolicy.canEdit} onClick={saveRevision}>{isSaving ? "Saving…" : revisionPolicy.mode === "approval" ? "Submit for Approval" : "Save Revision"}</Button></div></ComponentCard></div>
      </div>

      <Modal isOpen={isCabinetSourceModalOpen} onClose={() => setIsCabinetSourceModalOpen(false)} className="mx-4 w-full max-w-xl p-6" ariaLabel="Choose Cabinet Source">
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">Choose Cabinet Source</h3>
            <FormHint>Choose Stock for catalog/inventory Cabinets, or Vendor for one quoted custom Cabinet package with private PDF, cost and markup.</FormHint>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" onClick={() => { setIsCabinetSourceModalOpen(false); setIsProductPickerOpen(true); }}>Stock Cabinet</Button>
            <Button disabled={order.status !== "draft" || isAddingVendorCabinet} onClick={() => { setEditingVendorCabinetItemId(null); setEditingVendorCabinetDocument(null); setIsCabinetSourceModalOpen(false); setIsVendorCabinetModalOpen(true); }}>Vendor Cabinet</Button>
          </div>
          {order.status !== "draft" ? <Alert variant="warning" title="Draft required" message="Vendor Cabinet packages are added through a dedicated workflow and can only be attached while the Order is Draft." /> : <FormHint>Vendor Cabinet is saved immediately to this Draft and reloads authoritative Order lines. Save unrelated edits first.</FormHint>}
        </div>
      </Modal>

      <OrderProductPicker isOpen={isProductPickerOpen} onClose={() => setIsProductPickerOpen(false)} products={activeProducts} selectedQuantities={selectedQuantities} priceMap={priceMap} onAdd={addProduct} currencyCode={currency} disableWithoutPrice excludedProductTypeCodes={["STONE", "SINK", "SERVICE"]} />

      {editingVendorCabinetItem && editingVendorCabinetDocument ? (
        <CustomVendorCabinetLineModal
          isOpen={isVendorCabinetModalOpen}
          mode="edit"
          currencyCode={currency}
          initialValue={{
            vendorId: editingVendorCabinetItem.vendor_id,
            lineName: editingVendorCabinetItem.display_name_override || editingVendorCabinetItem.product_name_snapshot,
            totalCost: Number(editingVendorCabinetItem.manual_cost_amount || 0),
            markupPercent: Number(editingVendorCabinetItem.manual_markup_percent || 0),
            currentFileName: editingVendorCabinetDocument.fileName,
          }}
          onClose={closeVendorCabinetModal}
          onViewCurrentPdf={() => { void viewVendorCabinetPdf(editingVendorCabinetItem); }}
          onSubmit={(value) => { void updateVendorCabinet(value); }}
        />
      ) : (
        <CustomVendorCabinetLineModal
          isOpen={isVendorCabinetModalOpen}
          currencyCode={currency}
          onClose={closeVendorCabinetModal}
          onSubmit={(value) => { void addVendorCabinet(value); }}
        />
      )}

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
          <Field label="Removal Reason" htmlFor="edit-order-countertop-remove-reason" hint="Optional. The reason is stored with the internal customer activity audit."><Input id="edit-order-countertop-remove-reason" value={countertopRemoveReason} onChange={(event) => setCountertopRemoveReason(event.target.value)} placeholder="e.g. Customer selected a different countertop" /></Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={isRemovingCountertop} onClick={closeCountertopRemoval}>Cancel</Button>
            <Button variant="danger" disabled={isRemovingCountertop || !countertopRemoveItemId} onClick={confirmCountertopRemoval}>{isRemovingCountertop ? "Removing…" : "Remove Countertop"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
