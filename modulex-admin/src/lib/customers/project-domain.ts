import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { OrderFulfillmentType, OrderPricingModel } from "@/lib/customers/types";

export type ProjectStatus = "draft" | "quoted" | "approved" | "ordered" | "in_progress" | "completed" | "cancelled";

export type CustomerProjectOrder = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  item_count: number;
  currency_code: string;
  grand_total: number | string;
  fulfillment_type: OrderFulfillmentType;
};

export type CustomerProject = {
  id: string;
  project_number: string;
  customer_id: string;
  customer_name: string;
  name: string;
  status: ProjectStatus;
  sales_rep_id: string | null;
  sales_rep_name: string | null;
  project_address_id: string | null;
  project_address_snapshot: Record<string, unknown> | null;
  start_date: string | null;
  target_date: string | null;
  planned_delivery_date: string | null;
  primary_installation_id: string | null;
  completed_at: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  orders?: CustomerProjectOrder[];
};

export type ProjectPageResult = {
  items: CustomerProject[];
  total_count: number;
  limit: number;
  offset: number;
};

export type ProjectListInput = {
  search?: string | null;
  status?: ProjectStatus | null;
  customerId?: string | null;
  salesRepId?: string | null;
  limit?: number;
  offset?: number;
};

export type ProjectMutationInput = {
  name: string;
  salesRepId?: string | null;
  projectAddressId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  status?: ProjectStatus | null;
};

export type ProjectScheduleMutationInput = {
  projectId: string;
  startDate?: string | null;
  targetDate?: string | null;
  plannedDeliveryDate?: string | null;
  primaryInstallationId?: string | null;
};

export type CreateProjectInput = ProjectMutationInput & { customerId: string };
export type UpdateProjectInput = ProjectMutationInput & { projectId: string };

export type ProjectOrderItemInput = {
  productId: string;
  quantity: string | number;
  discountPercent: string | number;
  pricingModel?: OrderPricingModel | null;
  unitPrice?: string | number | null;
  lineNote?: string | null;
};

export type CreateProjectOrderInput = {
  projectId: string;
  items: ProjectOrderItemInput[];
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

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function nullableId(value: string | null | undefined) {
  return value || null;
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("A numeric Project/Order value is invalid.");
  return parsed;
}

async function requireProjectViewer() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !hasPermission(profile.role, "projects.view")) throw new Error("You do not have permission to view projects.");
  return profile;
}

async function requireProjectManager() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !hasPermission(profile.role, "projects.manage")) throw new Error("You do not have permission to manage projects.");
  return profile;
}

export async function listCustomerProjects(input: ProjectListInput = {}): Promise<ProjectPageResult> {
  await requireProjectViewer();
  const { data, error } = await supabase.rpc("get_customer_projects_page", {
    p_search: nullableText(input.search),
    p_status: input.status ?? null,
    p_customer_id: nullableId(input.customerId),
    p_sales_rep_id: nullableId(input.salesRepId),
    p_limit: input.limit ?? 25,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  const result = (data ?? {}) as unknown as Partial<ProjectPageResult>;
  return {
    items: result.items ?? [],
    total_count: Number(result.total_count ?? 0),
    limit: Number(result.limit ?? input.limit ?? 25),
    offset: Number(result.offset ?? input.offset ?? 0),
  };
}

export async function getCustomerProject(projectId: string): Promise<CustomerProject> {
  await requireProjectViewer();
  const { data, error } = await supabase.rpc("get_customer_project", { p_project_id: projectId });
  if (error) throw error;
  if (!data) throw new Error("Project not found.");
  return data as unknown as CustomerProject;
}

export async function createCustomerProject(input: CreateProjectInput): Promise<string> {
  await requireProjectManager();
  const { data, error } = await supabase.rpc("create_customer_project", {
    p_customer_id: input.customerId,
    p_name: input.name.trim(),
    p_sales_rep_id: nullableId(input.salesRepId),
    p_project_address_id: nullableId(input.projectAddressId),
    p_start_date: nullableText(input.startDate),
    p_target_date: nullableText(input.targetDate),
    p_customer_notes: nullableText(input.customerNotes),
    p_internal_notes: nullableText(input.internalNotes),
    p_status: input.status ?? "draft",
  });
  if (error) throw error;
  return data as string;
}

export async function updateCustomerProject(input: UpdateProjectInput): Promise<string> {
  await requireProjectManager();
  const { data, error } = await supabase.rpc("update_customer_project", {
    p_project_id: input.projectId,
    p_name: input.name.trim(),
    p_sales_rep_id: nullableId(input.salesRepId),
    p_project_address_id: nullableId(input.projectAddressId),
    p_start_date: nullableText(input.startDate),
    p_target_date: nullableText(input.targetDate),
    p_customer_notes: nullableText(input.customerNotes),
    p_internal_notes: nullableText(input.internalNotes),
    p_status: input.status ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateCustomerProjectSchedule(input: ProjectScheduleMutationInput): Promise<string> {
  await requireProjectManager();
  const { data, error } = await supabase.rpc("set_customer_project_schedule", {
    p_project_id: input.projectId,
    p_start_date: nullableText(input.startDate),
    p_target_date: nullableText(input.targetDate),
    p_planned_delivery_date: nullableText(input.plannedDeliveryDate),
    p_primary_installation_id: nullableId(input.primaryInstallationId),
  });
  if (error) throw error;
  return data as string;
}

export async function createProjectCustomerOrder(input: CreateProjectOrderInput): Promise<string> {
  const { profile, error: profileError } = await getCurrentProfile();
  if (profileError) throw profileError;
  if (!profile || !hasPermission(profile.role, "orders.manage")) throw new Error("You do not have permission to create orders.");

  const { data, error } = await supabase.rpc("create_project_customer_order", {
    p_project_id: input.projectId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: numberValue(item.quantity),
      discount_percent: numberValue(item.discountPercent),
      ...(item.pricingModel === "manual_service" ? { unit_price: numberValue(item.unitPrice), line_note: nullableText(item.lineNote) } : {}),
    })),
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
    p_payment_commission_percent: numberValue(input.paymentCommissionPercent),
    p_initial_status: input.initialStatus,
    p_fulfillment_type: input.fulfillmentType,
  });
  if (error) throw error;
  return data as string;
}
