import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import type {
  CountertopLineSummary,
  CountertopOrderContext,
  Customer,
  CustomerAddress,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderStatus,
  CustomerOrderStatusHistory,
  OrderFulfillmentType,
  PaymentMethod,
  PriceGroupLookup,
} from "@/lib/customers/types";

export type OrderDomainProduct = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  status: string;
  brand: string | null;
  category: string | null;
  brand_id: string | null;
  category_id: string | null;
  product_type_name: string;
  pricing_model: "price_group" | "countertop_material_band" | "none";
  uom_code: string;
  uom_name: string;
};

export function pricingModelLabel(model: OrderDomainProduct["pricing_model"] | string | null | undefined) {
  if (model === "price_group") return "Price Group";
  if (model === "countertop_material_band") return "Countertop Material Band";
  if (model === "none") return "No Commercial Pricing";
  return "Historical Snapshot";
}

export type OrderPriceRow = {
  product_id: string;
  amount: string | number;
};

export type OrderTaxRule = {
  fulfillment_type: OrderFulfillmentType;
  tax_rate: string | number | null;
  is_active: boolean;
};

export type CreateOrderContext = {
  customer: Customer;
  addresses: CustomerAddress[];
  priceGroups: PriceGroupLookup[];
  paymentMethods: PaymentMethod[];
  products: OrderDomainProduct[];
  taxRules: OrderTaxRule[];
};

export type EditOrderContext = CreateOrderContext & {
  order: CustomerOrder;
  items: CustomerOrderItem[];
  countertopSummaries: CountertopLineSummary[];
  role: UserRole;
};

export type OrderDetailContext = {
  customer: Customer;
  order: CustomerOrder;
  items: CustomerOrderItem[];
  history: CustomerOrderStatusHistory[];
  pendingApprovals: number;
  canManage: boolean;
  canManageCountertop: boolean;
  countertopItems: CountertopOrderContext[];
  countertopSummaries: CountertopLineSummary[];
};

type CreateOrderItemInput = {
  productId: string;
  quantity: string | number;
  discountPercent: string | number;
};

export type CreateCustomerOrderInput = {
  customerId: string;
  items: CreateOrderItemInput[];
  priceGroupId: string;
  billingAddressId?: string | null;
  shippingAddressId?: string | null;
  expectedDeliveryDate?: string | null;
  customerReference?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  taxRate: string | number;
  orderDiscountAmount: string | number;
  paymentMethodId: string;
  paymentCommissionPercent: string | number;
  initialStatus: "draft" | "confirmed";
  fulfillmentType: OrderFulfillmentType;
};

type UpdateOrderItemInput = {
  id?: string;
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPercent: string | number;
};

export type UpdateCustomerOrderInput = {
  orderId: string;
  items: UpdateOrderItemInput[];
  priceGroupId: string;
  billingAddressId?: string | null;
  shippingAddressId?: string | null;
  expectedDeliveryDate?: string | null;
  customerReference?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  taxRate: string | number;
  orderDiscountAmount: string | number;
  paymentMethodId: string;
  paymentCommissionPercent: string | number;
  revisionReason?: string | null;
  fulfillmentType: OrderFulfillmentType;
};

export type SetCustomerOrderStatusInput = {
  orderId: string;
  status: CustomerOrderStatus;
  note?: string | null;
};

export type CustomerOrderRevisionMode = "direct" | "approval" | "locked";

export type CustomerOrderRevisionPolicy = {
  mode: CustomerOrderRevisionMode;
  canEdit: boolean;
  editableFields: readonly string[];
  immutableFields: readonly string[];
  reason: string;
};

const ORDER_EDITOR_ROLES: UserRole[] = ["super_admin", "admin", "sales"];
const ORDER_REVISION_EDITABLE_STATUSES: CustomerOrderStatus[] = ["draft", "confirmed", "in_preparation", "ready_for_shipment"];
const ORDER_REVISION_LOCKED_STATUSES: CustomerOrderStatus[] = ["shipped", "delivered", "installation_scheduled", "installation_in_progress", "completed", "cancelled"];
const ORDER_REVISION_EDITABLE_FIELDS = [
  "items.product_id",
  "items.quantity",
  "items.unit_price",
  "items.discount_percent",
  "price_group_id",
  "fulfillment_type",
  "payment_method_id",
  "payment_commission_percent",
  "billing_address_id",
  "shipping_address_id",
  "expected_delivery_date",
  "customer_reference",
  "customer_notes",
  "internal_notes",
  "tax_rate",
  "discount_amount",
  "revision_reason",
] as const;
const ORDER_REVISION_IMMUTABLE_FIELDS = [
  "id",
  "order_number",
  "customer_id",
  "status",
  "order_date",
  "currency_code",
  "price_group_name_snapshot",
  "payment_method_name_snapshot",
  "payment_commission_default_percent",
  "payment_commission_amount",
  "billing_address_snapshot",
  "shipping_address_snapshot",
  "item_count",
  "subtotal",
  "tax_amount",
  "total_amount",
  "grand_total",
  "confirmed_at",
  "completed_at",
  "cancelled_at",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "items.id",
  "items.order_id",
  "items.line_no",
  "items.sku_snapshot",
  "items.product_name_snapshot",
  "items.discount_amount",
  "items.line_subtotal",
  "items.line_total",
  "items.price_source",
  "items.created_by",
  "items.created_at",
] as const;
const PRICE_GROUP_COLUMNS = "id, name, system_key, sort_order, is_base_price, is_active, available_for_orders, requires_approval, internal_only";
const PAYMENT_METHOD_COLUMNS = "id, system_key, name, commission_percent, sort_order, is_active";
const PRODUCT_COLUMNS = "id, sku, name, barcode, status, brand, category, brand_id, category_id, product_types(name, pricing_model), units_of_measure(code, name)";

type ProductQueryRow = Omit<OrderDomainProduct, "product_type_name" | "pricing_model" | "uom_code" | "uom_name"> & {
  product_types: { name: string; pricing_model: OrderDomainProduct["pricing_model"] } | null;
  units_of_measure: { code: string; name: string } | null;
};

type CountertopConfigurationRow = {
  order_item_id: string;
  pricing_snapshot: unknown;
};

function mapOrderProducts(rows: ProductQueryRow[]): OrderDomainProduct[] {
  return rows.map(({ product_types, units_of_measure, ...product }) => ({
    ...product,
    product_type_name: product_types?.name ?? "Unknown Product Type",
    pricing_model: product_types?.pricing_model ?? "none",
    uom_code: units_of_measure?.code ?? "UNKNOWN",
    uom_name: units_of_measure?.name ?? "Unknown UOM",
  }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCountertopLineSummary(row: CountertopConfigurationRow): CountertopLineSummary {
  const snapshot = asRecord(row.pricing_snapshot);
  const stone = asRecord(snapshot.stone);
  const edge = asRecord(snapshot.edge);
  const sink = asRecord(snapshot.sink);
  const manualOverride = asRecord(snapshot.manual_override);
  const serviceRows = Array.isArray(snapshot.services) ? snapshot.services : [];

  return {
    orderItemId: row.order_item_id,
    stoneName: textValue(stone.name),
    stoneSku: textValue(stone.sku),
    stoneType: textValue(stone.stone_type),
    sqft: numberValue(stone.sqft),
    materialPriceBand: textValue(stone.material_price_band),
    pricePerSqft: numberValue(stone.price_per_sqft),
    edgeName: textValue(edge.name),
    edgeLinearFt: numberValue(edge.linear_ft),
    sinkName: textValue(sink.name),
    sinkSku: textValue(sink.sku),
    services: serviceRows.flatMap((entry) => {
      const service = asRecord(entry);
      const name = textValue(service.name);
      const quantity = numberValue(service.quantity);
      return name && quantity !== null ? [{ name, quantity }] : [];
    }),
    manualOverrideApplied: manualOverride.applied === true,
    manualOverridePricePerSqft: numberValue(manualOverride.price_per_sqft),
    manualOverrideReason: textValue(manualOverride.reason),
  };
}

async function loadCountertopLineSummaries(orderItemIds: string[]): Promise<CountertopLineSummary[]> {
  if (orderItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("countertop_configurations")
    .select("order_item_id, pricing_snapshot")
    .in("order_item_id", orderItemIds);

  if (error) throw error;
  return ((data ?? []) as CountertopConfigurationRow[]).map(parseCountertopLineSummary);
}

export function getCustomerOrderRevisionPolicy(status: CustomerOrderStatus, role: UserRole): CustomerOrderRevisionPolicy {
  if (!ORDER_EDITOR_ROLES.includes(role)) {
    return {
      mode: "locked",
      canEdit: false,
      editableFields: [],
      immutableFields: ORDER_REVISION_IMMUTABLE_FIELDS,
      reason: "You do not have permission to revise customer orders.",
    };
  }

  if (ORDER_REVISION_LOCKED_STATUSES.includes(status)) {
    return {
      mode: "locked",
      canEdit: false,
      editableFields: [],
      immutableFields: ORDER_REVISION_IMMUTABLE_FIELDS,
      reason: "Order revisions are locked once fulfillment has started or the order is finalized.",
    };
  }

  if (!ORDER_REVISION_EDITABLE_STATUSES.includes(status)) {
    return {
      mode: "locked",
      canEdit: false,
      editableFields: [],
      immutableFields: ORDER_REVISION_IMMUTABLE_FIELDS,
      reason: "This order status does not allow commercial revisions.",
    };
  }

  if (status !== "draft" && role === "sales") {
    return {
      mode: "approval",
      canEdit: true,
      editableFields: ORDER_REVISION_EDITABLE_FIELDS,
      immutableFields: ORDER_REVISION_IMMUTABLE_FIELDS,
      reason: "Sales revisions to confirmed pre-fulfillment orders require Admin approval.",
    };
  }

  return {
    mode: "direct",
    canEdit: true,
    editableFields: ORDER_REVISION_EDITABLE_FIELDS,
    immutableFields: ORDER_REVISION_IMMUTABLE_FIELDS,
    reason: status === "draft" ? "Draft orders can be revised directly." : "Pre-fulfillment orders can be revised directly by Admin.",
  };
}

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function nullableId(value: string | null | undefined) {
  return value || null;
}

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function requireEditorProfile(action: "create" | "edit") {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !ORDER_EDITOR_ROLES.includes(profile.role)) {
    throw new Error(`You do not have permission to ${action} orders.`);
  }
  return profile;
}

async function requireViewerProfile() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile) throw new Error("User profile could not be loaded.");
  if (!hasPermission(profile.role, "orders.view")) {
    throw new Error("You do not have permission to view customer orders.");
  }
  return profile;
}

export async function loadCustomerOrderRevisionPolicy(customerId: string, orderId: string): Promise<CustomerOrderRevisionPolicy> {
  const profile = await requireEditorProfile("edit");
  const { data, error } = await supabase
    .from("customer_orders")
    .select("status")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .single();

  if (error) throw error;
  return getCustomerOrderRevisionPolicy(data.status as CustomerOrderStatus, profile.role);
}

export async function loadCreateOrderContext(customerId: string): Promise<CreateOrderContext> {
  await requireEditorProfile("create");

  const [customerResult, addressesResult, groupsResult, methodsResult, productsResult, taxRulesResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).single(),
    supabase.from("customer_addresses").select("*").eq("customer_id", customerId).eq("is_active", true).order("address_name"),
    supabase.from("price_groups").select(PRICE_GROUP_COLUMNS).eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
    supabase.from("payment_methods").select(PAYMENT_METHOD_COLUMNS).eq("is_active", true).order("sort_order"),
    supabase.from("products").select(PRODUCT_COLUMNS).eq("status", "active").order("sku"),
    supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),
  ]);

  const firstError = customerResult.error || addressesResult.error || groupsResult.error || methodsResult.error || productsResult.error || taxRulesResult.error;
  if (firstError) throw firstError;

  return {
    customer: customerResult.data as Customer,
    addresses: (addressesResult.data ?? []) as CustomerAddress[],
    priceGroups: (groupsResult.data ?? []) as PriceGroupLookup[],
    paymentMethods: (methodsResult.data ?? []) as PaymentMethod[],
    products: mapOrderProducts((productsResult.data ?? []) as unknown as ProductQueryRow[]),
    taxRules: (taxRulesResult.data ?? []) as OrderTaxRule[],
  };
}

export async function loadEditOrderContext(customerId: string, orderId: string): Promise<EditOrderContext> {
  const profile = await requireEditorProfile("edit");

  const [customerResult, orderResult, itemsResult, addressesResult, groupsResult, methodsResult, productsResult, taxRulesResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).single(),
    supabase.from("customer_orders").select("*").eq("id", orderId).eq("customer_id", customerId).single(),
    supabase.from("customer_order_items").select("*").eq("order_id", orderId).order("line_no"),
    supabase.from("customer_addresses").select("*").eq("customer_id", customerId).eq("is_active", true).order("address_name"),
    supabase.from("price_groups").select(PRICE_GROUP_COLUMNS).eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
    supabase.from("payment_methods").select(PAYMENT_METHOD_COLUMNS).eq("is_active", true).order("sort_order"),
    supabase.from("products").select(PRODUCT_COLUMNS).in("status", ["active", "inactive"]).order("sku"),
    supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),
  ]);

  const firstError = customerResult.error || orderResult.error || itemsResult.error || addressesResult.error || groupsResult.error || methodsResult.error || productsResult.error || taxRulesResult.error;
  if (firstError) throw firstError;

  const itemRows = (itemsResult.data ?? []) as CustomerOrderItem[];
  const countertopSummaries = await loadCountertopLineSummaries(itemRows.map((item) => item.id));

  return {
    customer: customerResult.data as Customer,
    order: orderResult.data as CustomerOrder,
    items: itemRows,
    countertopSummaries,
    addresses: (addressesResult.data ?? []) as CustomerAddress[],
    priceGroups: (groupsResult.data ?? []) as PriceGroupLookup[],
    paymentMethods: (methodsResult.data ?? []) as PaymentMethod[],
    products: mapOrderProducts((productsResult.data ?? []) as unknown as ProductQueryRow[]),
    taxRules: (taxRulesResult.data ?? []) as OrderTaxRule[],
    role: profile.role,
  };
}

export async function loadOrderDetail(customerId: string, orderId: string): Promise<OrderDetailContext> {
  const profile = await requireViewerProfile();

  const [customerResult, orderResult, itemsResult, historyResult, approvalsResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).single(),
    supabase.from("customer_orders").select("*").eq("id", orderId).eq("customer_id", customerId).single(),
    supabase.from("customer_order_items").select("*").eq("order_id", orderId).order("line_no"),
    supabase.from("customer_order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("entity_type", "order").eq("entity_id", orderId).eq("status", "pending"),
  ]);

  const firstError = customerResult.error || orderResult.error || itemsResult.error || historyResult.error;
  if (firstError) throw firstError;

  const itemRows = (itemsResult.data ?? []) as CustomerOrderItem[];
  const countertopSummaries = await loadCountertopLineSummaries(itemRows.map((item) => item.id));
  const summariesByItemId = new Map(countertopSummaries.map((summary) => [summary.orderItemId, summary]));
  const canManageCountertop = hasPermission(profile.role, "orders.manage");

  return {
    customer: customerResult.data as Customer,
    order: orderResult.data as CustomerOrder,
    items: itemRows,
    history: (historyResult.data ?? []) as CustomerOrderStatusHistory[],
    pendingApprovals: approvalsResult.error ? 0 : approvalsResult.count ?? 0,
    canManage: hasPermission(profile.role, "orders.manage"),
    canManageCountertop,
    countertopSummaries,
    countertopItems: canManageCountertop
      ? itemRows.filter((item) => summariesByItemId.has(item.id)).map((item) => ({
          orderItemId: item.id,
          orderNumber: orderResult.data.order_number,
          lineNo: item.line_no,
          sku: item.sku_snapshot,
          productName: item.product_name_snapshot,
          summary: summariesByItemId.get(item.id),
        }))
      : [],
  };
}

export async function loadOrderPrices(priceGroupId: string, currencyCode: string): Promise<OrderPriceRow[]> {
  const { data, error } = await supabase
    .from("product_prices")
    .select("product_id, amount")
    .eq("price_group_id", priceGroupId)
    .eq("is_active", true)
    .is("valid_to", null)
    .eq("currency_code", currencyCode || "USD");

  if (error) throw error;
  return (data ?? []) as OrderPriceRow[];
}

export async function createCustomerOrder(input: CreateCustomerOrderInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_customer_order", {
    p_customer_id: input.customerId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: numeric(item.quantity),
      discount_percent: numeric(item.discountPercent),
    })),
    p_price_group_id: input.priceGroupId,
    p_billing_address_id: nullableId(input.billingAddressId),
    p_shipping_address_id: nullableId(input.shippingAddressId),
    p_expected_delivery_date: nullableId(input.expectedDeliveryDate),
    p_customer_reference: nullableText(input.customerReference),
    p_customer_notes: nullableText(input.customerNotes),
    p_internal_notes: nullableText(input.internalNotes),
    p_tax_rate: numeric(input.taxRate),
    p_order_discount_amount: numeric(input.orderDiscountAmount),
    p_payment_method_id: input.paymentMethodId,
    p_payment_commission_percent: numeric(input.paymentCommissionPercent),
    p_initial_status: input.initialStatus,
    p_fulfillment_type: input.fulfillmentType,
  });

  if (error) throw error;
  return String(data);
}

export async function updateCustomerOrder(input: UpdateCustomerOrderInput): Promise<number> {
  const { data, error } = await supabase.rpc("update_customer_order", {
    p_order_id: input.orderId,
    p_items: input.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      product_id: item.productId,
      quantity: numeric(item.quantity),
      unit_price: numeric(item.unitPrice),
      discount_percent: numeric(item.discountPercent),
    })),
    p_price_group_id: input.priceGroupId,
    p_billing_address_id: nullableId(input.billingAddressId),
    p_shipping_address_id: nullableId(input.shippingAddressId),
    p_expected_delivery_date: nullableId(input.expectedDeliveryDate),
    p_customer_reference: nullableText(input.customerReference),
    p_customer_notes: nullableText(input.customerNotes),
    p_internal_notes: nullableText(input.internalNotes),
    p_tax_rate: numeric(input.taxRate),
    p_order_discount_amount: numeric(input.orderDiscountAmount),
    p_payment_method_id: input.paymentMethodId,
    p_payment_commission_percent: numeric(input.paymentCommissionPercent),
    p_revision_reason: nullableText(input.revisionReason),
    p_fulfillment_type: input.fulfillmentType,
  });

  if (error) throw error;
  return Number(data);
}

export async function setCustomerOrderStatus(input: SetCustomerOrderStatusInput): Promise<string | null> {
  const { data, error } = await supabase.rpc("set_customer_order_status", {
    p_order_id: input.orderId,
    p_status: input.status,
    p_note: nullableText(input.note),
  });

  if (error) throw error;
  return data === null ? null : String(data);
}
