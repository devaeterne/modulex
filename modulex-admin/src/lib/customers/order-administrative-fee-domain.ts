import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { OrderFulfillmentType, OrderPricingModel } from "@/lib/customers/types";

export type AdministrativeFeeOrderItemInput = {
  id?: string;
  productId: string;
  quantity: string | number;
  unitPrice?: string | number | null;
  discountPercent: string | number;
  pricingModel?: OrderPricingModel | null;
  lineNote?: string | null;
};

export type CreateAdministrativeFeeOrderInput = {
  customerId: string;
  projectId?: string | null;
  items: AdministrativeFeeOrderItemInput[];
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
  administrativeFeePercent: string | number;
  initialStatus: "draft" | "confirmed";
  fulfillmentType: OrderFulfillmentType;
};

export type UpdateAdministrativeFeeOrderInput = Omit<CreateAdministrativeFeeOrderInput, "customerId" | "projectId" | "initialStatus"> & {
  orderId: string;
  paymentCommissionPercent: string | number;
  revisionReason?: string | null;
};

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function nullableId(value: string | null | undefined) {
  return value || null;
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("A numeric Order value is invalid.");
  return parsed;
}

function rpcItems(items: AdministrativeFeeOrderItemInput[]) {
  return items.map((item) => ({
    ...(item.id ? { id: item.id } : {}),
    product_id: item.productId,
    quantity: numberValue(item.quantity),
    discount_percent: numberValue(item.discountPercent),
    ...(item.unitPrice !== undefined && item.unitPrice !== null ? { unit_price: numberValue(item.unitPrice) } : {}),
    ...(item.pricingModel === "manual_service" ? { line_note: nullableText(item.lineNote) } : {}),
  }));
}

async function requireOrderManager() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !hasPermission(profile.role, "orders.manage")) {
    throw new Error("You do not have permission to manage customer orders.");
  }
}

export async function loadAdministrativeFeeDefault(): Promise<number> {
  const { data, error } = await supabase
    .from("general_settings")
    .select("administrative_fee_default_percent")
    .eq("id", 1)
    .single();
  if (error) throw error;
  const value = Number(data?.administrative_fee_default_percent ?? 3);
  return Number.isFinite(value) ? value : 3;
}

export async function createCustomerOrderWithAdministrativeFee(input: CreateAdministrativeFeeOrderInput): Promise<string> {
  await requireOrderManager();
  const args = {
    p_items: rpcItems(input.items),
    p_price_group_id: input.priceGroupId,
    p_billing_address_id: nullableId(input.billingAddressId),
    p_shipping_address_id: nullableId(input.shippingAddressId),
    p_expected_delivery_date: nullableText(input.expectedDeliveryDate),
    p_customer_reference: nullableText(input.customerReference),
    p_customer_notes: nullableText(input.customerNotes),
    p_internal_notes: nullableText(input.internalNotes),
    p_tax_rate: numberValue(input.taxRate),
    p_order_discount_amount: numberValue(input.orderDiscountAmount),
    p_payment_method_id: input.paymentMethodId,
    // New Orders never reinterpret the historical payment-method surcharge as Administrative Fee.
    p_payment_commission_percent: 0,
    p_initial_status: input.initialStatus,
    p_fulfillment_type: input.fulfillmentType,
    p_administrative_fee_percent: numberValue(input.administrativeFeePercent),
  };

  const result = input.projectId
    ? await supabase.rpc("create_project_customer_order", { p_project_id: input.projectId, ...args })
    : await supabase.rpc("create_customer_order", { p_customer_id: input.customerId, ...args });
  if (result.error) throw result.error;
  return result.data as string;
}

export async function updateCustomerOrderWithAdministrativeFee(input: UpdateAdministrativeFeeOrderInput): Promise<number> {
  await requireOrderManager();
  const { data, error } = await supabase.rpc("update_customer_order", {
    p_order_id: input.orderId,
    p_items: rpcItems(input.items),
    p_price_group_id: input.priceGroupId,
    p_billing_address_id: nullableId(input.billingAddressId),
    p_shipping_address_id: nullableId(input.shippingAddressId),
    p_expected_delivery_date: nullableText(input.expectedDeliveryDate),
    p_customer_reference: nullableText(input.customerReference),
    p_customer_notes: nullableText(input.customerNotes),
    p_internal_notes: nullableText(input.internalNotes),
    p_tax_rate: numberValue(input.taxRate),
    p_order_discount_amount: numberValue(input.orderDiscountAmount),
    p_payment_method_id: input.paymentMethodId,
    // Existing historical surcharge snapshots are preserved, but are not user-editable as Administrative Fee.
    p_payment_commission_percent: numberValue(input.paymentCommissionPercent),
    p_revision_reason: nullableText(input.revisionReason),
    p_fulfillment_type: input.fulfillmentType,
    p_administrative_fee_percent: numberValue(input.administrativeFeePercent),
  });
  if (error) throw error;
  return Number(data ?? 0);
}
