import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type ProjectProcurementAttentionState =
  | "ready"
  | "vendor_required"
  | "cost_required"
  | "quantity_required"
  | "open_to_purchase"
  | "excess_ordered"
  | "retired";

export type ProjectProcurementDeliveryState = "not_delivered" | "partially_delivered" | "delivered";
export type ProjectProcurementInvoiceState = "not_invoiced" | "partially_invoiced" | "invoiced";
export type ProjectProcurementCommitmentStatus = "ordered" | "confirmed" | "cancelled";
export type ProjectProcurementSourceKind = "order_item" | "countertop_stone" | "countertop_sink";

export type ProjectProcurementInvoiceLink = {
  allocationId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoicedQuantity: number;
  projectInvoiceCost: number;
};

export type ProjectProcurementCommitment = {
  id: string;
  status: ProjectProcurementCommitmentStatus;
  orderedQuantity: number;
  agreedUnitCost: number;
  currencyCode: string;
  vendorOrderNo: string;
  orderedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  deliveredQuantity: number;
  deliveryState: ProjectProcurementDeliveryState;
  invoicedQuantity: number;
  invoiceState: ProjectProcurementInvoiceState;
  invoiceCost: number;
  invoices: ProjectProcurementInvoiceLink[];
};

export type ProjectProcurementRequirement = {
  id: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  sourceKind: ProjectProcurementSourceKind;
  productId: string;
  sku: string;
  productName: string;
  requiredQuantity: number | null;
  vendorCode: string | null;
  vendorName: string | null;
  vendorSource: "catalog" | "metadata" | "manual" | "unresolved";
  expectedUnitCost: number | null;
  expectedCostCurrency: string | null;
  isCurrent: boolean;
  retiredReason: string | null;
  activeCommittedQuantity: number;
  openQuantity: number | null;
  excessOrderedQuantity: number;
  attentionState: ProjectProcurementAttentionState;
  commitments: ProjectProcurementCommitment[];
};

export type ProjectProcurementLedger = {
  projectId: string;
  requirements: ProjectProcurementRequirement[];
};

export type ProjectProcurementStatusRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  sourceKind: ProjectProcurementSourceKind;
  productId: string;
  sku: string;
  productName: string;
  requiredQuantity: number | null;
  orderedQuantity: number;
  openQuantity: number | null;
  orderState: "attention_required" | "not_ordered" | "partially_ordered" | "ordered" | "excess_ordered";
  deliveredQuantity: number;
  deliveryState: ProjectProcurementDeliveryState;
  invoicedQuantity: number;
  invoiceState: ProjectProcurementInvoiceState;
};

export type ProjectProcurementStatus = {
  projectId: string;
  requirements: ProjectProcurementStatusRow[];
};

type RawInvoiceLink = {
  allocation_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  invoiced_quantity?: number | string | null;
  project_invoice_cost?: number | string | null;
};

type RawCommitment = {
  id?: string | null;
  status?: string | null;
  ordered_quantity?: number | string | null;
  agreed_unit_cost?: number | string | null;
  currency_code?: string | null;
  vendor_order_no?: string | null;
  ordered_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  delivered_quantity?: number | string | null;
  delivery_state?: string | null;
  invoiced_quantity?: number | string | null;
  invoice_state?: string | null;
  invoice_cost?: number | string | null;
  invoices?: RawInvoiceLink[] | null;
};

type RawRequirement = {
  id?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  order_item_id?: string | null;
  source_kind?: string | null;
  product_id?: string | null;
  sku?: string | null;
  product_name?: string | null;
  required_quantity?: number | string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  vendor_source?: string | null;
  expected_unit_cost?: number | string | null;
  expected_cost_currency?: string | null;
  is_current?: boolean | null;
  retired_reason?: string | null;
  active_committed_quantity?: number | string | null;
  open_quantity?: number | string | null;
  excess_ordered_quantity?: number | string | null;
  attention_state?: string | null;
  commitments?: RawCommitment[] | null;
};

type RawLedger = {
  project_id?: string | null;
  requirements?: RawRequirement[] | null;
};

type RawStatusRow = {
  id?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  source_kind?: string | null;
  product_id?: string | null;
  sku?: string | null;
  product_name?: string | null;
  required_quantity?: number | string | null;
  ordered_quantity?: number | string | null;
  open_quantity?: number | string | null;
  order_state?: string | null;
  delivered_quantity?: number | string | null;
  delivery_state?: string | null;
  invoiced_quantity?: number | string | null;
  invoice_state?: string | null;
};

type RawStatus = {
  project_id?: string | null;
  requirements?: RawStatusRow[] | null;
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function positiveNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`);
  return value;
}

function nonNegativeNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} cannot be negative.`);
  return value;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter code.");
  return normalized;
}

function normalizeIsoDate(value: string, field: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${field} is invalid.`);
  return normalized;
}

async function currentProfileOrThrow() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile) throw new Error("Profile could not be loaded.");
  return profile;
}

async function requireProcurementView() {
  const profile = await currentProfileOrThrow();
  if (!hasPermission(profile.roles, "project_procurement.view")) {
    throw new Error("You do not have permission to view Project procurement.");
  }
  return profile;
}

async function requireProcurementDetailedView() {
  const profile = await requireProcurementView();
  if (!hasPermission(profile.roles, "pricing.cost.view")) {
    throw new Error("You do not have permission to view Project procurement cost data.");
  }
  return profile;
}

async function requireProcurementManage() {
  const profile = await currentProfileOrThrow();
  if (!hasPermission(profile.roles, "project_procurement.manage")) {
    throw new Error("You do not have permission to manage Project procurement.");
  }
  return profile;
}

async function requireProcurementInvoiceManage() {
  const profile = await currentProfileOrThrow();
  if (
    !hasPermission(profile.roles, "project_procurement.manage") &&
    !hasPermission(profile.roles, "finance.manage")
  ) {
    throw new Error("You do not have permission to manage Project vendor invoices.");
  }
  return profile;
}

function mapInvoiceLink(row: RawInvoiceLink): ProjectProcurementInvoiceLink {
  return {
    allocationId: row.allocation_id ?? "",
    invoiceId: row.invoice_id ?? "",
    invoiceNumber: row.invoice_number ?? "",
    invoiceDate: row.invoice_date ?? "",
    invoicedQuantity: numberValue(row.invoiced_quantity),
    projectInvoiceCost: numberValue(row.project_invoice_cost),
  };
}

function mapCommitment(row: RawCommitment): ProjectProcurementCommitment {
  return {
    id: row.id ?? "",
    status: (row.status ?? "ordered") as ProjectProcurementCommitmentStatus,
    orderedQuantity: numberValue(row.ordered_quantity),
    agreedUnitCost: numberValue(row.agreed_unit_cost),
    currencyCode: row.currency_code ?? "USD",
    vendorOrderNo: row.vendor_order_no ?? "",
    orderedAt: row.ordered_at ?? "",
    confirmedAt: row.confirmed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    deliveredQuantity: numberValue(row.delivered_quantity),
    deliveryState: (row.delivery_state ?? "not_delivered") as ProjectProcurementDeliveryState,
    invoicedQuantity: numberValue(row.invoiced_quantity),
    invoiceState: (row.invoice_state ?? "not_invoiced") as ProjectProcurementInvoiceState,
    invoiceCost: numberValue(row.invoice_cost),
    invoices: (row.invoices ?? []).map(mapInvoiceLink),
  };
}

function mapRequirement(row: RawRequirement): ProjectProcurementRequirement {
  return {
    id: row.id ?? "",
    orderId: row.order_id ?? "",
    orderNumber: row.order_number ?? "",
    orderItemId: row.order_item_id ?? "",
    sourceKind: (row.source_kind ?? "order_item") as ProjectProcurementSourceKind,
    productId: row.product_id ?? "",
    sku: row.sku ?? "",
    productName: row.product_name ?? "",
    requiredQuantity: nullableNumber(row.required_quantity),
    vendorCode: row.vendor_code ?? null,
    vendorName: row.vendor_name ?? null,
    vendorSource: (row.vendor_source ?? "unresolved") as ProjectProcurementRequirement["vendorSource"],
    expectedUnitCost: nullableNumber(row.expected_unit_cost),
    expectedCostCurrency: row.expected_cost_currency ?? null,
    isCurrent: Boolean(row.is_current),
    retiredReason: row.retired_reason ?? null,
    activeCommittedQuantity: numberValue(row.active_committed_quantity),
    openQuantity: nullableNumber(row.open_quantity),
    excessOrderedQuantity: numberValue(row.excess_ordered_quantity),
    attentionState: (row.attention_state ?? "ready") as ProjectProcurementAttentionState,
    commitments: (row.commitments ?? []).map(mapCommitment),
  };
}

export async function loadProjectProcurement(projectId: string): Promise<ProjectProcurementLedger> {
  await requireProcurementDetailedView();
  const { data, error } = await supabase.rpc("get_customer_project_procurement", { p_project_id: projectId });
  if (error) throw error;
  const raw = (data ?? {}) as RawLedger;
  return {
    projectId: raw.project_id ?? projectId,
    requirements: (raw.requirements ?? []).map(mapRequirement),
  };
}

export async function loadProjectProcurementStatus(projectId: string): Promise<ProjectProcurementStatus> {
  await requireProcurementView();
  const { data, error } = await supabase.rpc("get_customer_project_procurement_status", { p_project_id: projectId });
  if (error) throw error;
  const raw = (data ?? {}) as RawStatus;
  return {
    projectId: raw.project_id ?? projectId,
    requirements: (raw.requirements ?? []).map((row) => ({
      id: row.id ?? "",
      orderId: row.order_id ?? "",
      orderNumber: row.order_number ?? "",
      sourceKind: (row.source_kind ?? "order_item") as ProjectProcurementSourceKind,
      productId: row.product_id ?? "",
      sku: row.sku ?? "",
      productName: row.product_name ?? "",
      requiredQuantity: nullableNumber(row.required_quantity),
      orderedQuantity: numberValue(row.ordered_quantity),
      openQuantity: nullableNumber(row.open_quantity),
      orderState: (row.order_state ?? "not_ordered") as ProjectProcurementStatusRow["orderState"],
      deliveredQuantity: numberValue(row.delivered_quantity),
      deliveryState: (row.delivery_state ?? "not_delivered") as ProjectProcurementDeliveryState,
      invoicedQuantity: numberValue(row.invoiced_quantity),
      invoiceState: (row.invoice_state ?? "not_invoiced") as ProjectProcurementInvoiceState,
    })),
  };
}

export async function resolveProjectProcurementVendor(input: {
  requirementId: string;
  vendorCode: string;
  vendorName: string;
}) {
  await requireProcurementManage();
  const { data, error } = await supabase.rpc("set_customer_project_procurement_vendor", {
    p_requirement_id: input.requirementId,
    p_vendor_code: requiredText(input.vendorCode, "Vendor code").toLowerCase(),
    p_vendor_name: requiredText(input.vendorName, "Vendor name"),
  });
  if (error) throw error;
  return data as string;
}

export async function createProjectProcurementCommitment(input: {
  requirementId: string;
  orderedQuantity: number;
  agreedUnitCost: number;
  currencyCode: string;
  vendorOrderNo: string;
}) {
  await requireProcurementManage();
  const { data, error } = await supabase.rpc("create_customer_project_procurement_commitment", {
    p_requirement_id: input.requirementId,
    p_ordered_quantity: positiveNumber(input.orderedQuantity, "Ordered quantity"),
    p_agreed_unit_cost: nonNegativeNumber(input.agreedUnitCost, "Agreed vendor cost"),
    p_currency_code: normalizeCurrency(input.currencyCode),
    p_vendor_order_no: requiredText(input.vendorOrderNo, "PO / Vendor Order No"),
  });
  if (error) throw error;
  return data as string;
}

export async function confirmProjectProcurementCommitment(commitmentId: string) {
  await requireProcurementManage();
  const { data, error } = await supabase.rpc("confirm_customer_project_procurement_commitment", {
    p_commitment_id: commitmentId,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelProjectProcurementCommitment(input: { commitmentId: string; reason: string }) {
  await requireProcurementManage();
  const { data, error } = await supabase.rpc("cancel_customer_project_procurement_commitment", {
    p_commitment_id: input.commitmentId,
    p_reason: requiredText(input.reason, "Cancellation reason"),
  });
  if (error) throw error;
  return data as string;
}

export async function recordProjectProcurementDelivery(input: {
  commitmentId: string;
  quantity: number;
  deliveredDate: string;
  notes?: string | null;
}) {
  await requireProcurementManage();
  const { data, error } = await supabase.rpc("record_customer_project_procurement_delivery", {
    p_commitment_id: input.commitmentId,
    p_quantity: positiveNumber(input.quantity, "Received quantity"),
    p_delivered_date: normalizeIsoDate(input.deliveredDate, "Delivery date"),
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function correctProjectProcurementDelivery(input: {
  deliveryEventId: string;
  quantity: number;
  reason: string;
}) {
  await requireProcurementManage();
  const { data, error } = await supabase.rpc("correct_customer_project_procurement_delivery", {
    p_delivery_event_id: input.deliveryEventId,
    p_quantity: positiveNumber(input.quantity, "Correction quantity"),
    p_reason: requiredText(input.reason, "Correction reason"),
  });
  if (error) throw error;
  return data as string;
}

export async function recordProjectProcurementInvoice(input: {
  commitmentId: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotal: number;
  currencyCode: string;
  invoicedQuantity: number;
  projectInvoiceCost: number;
}) {
  await requireProcurementInvoiceManage();
  const { data, error } = await supabase.rpc("record_customer_project_procurement_invoice", {
    p_commitment_id: input.commitmentId,
    p_invoice_number: requiredText(input.invoiceNumber, "Invoice No"),
    p_invoice_date: normalizeIsoDate(input.invoiceDate, "Invoice date"),
    p_invoice_total: positiveNumber(input.invoiceTotal, "Vendor invoice total"),
    p_currency_code: normalizeCurrency(input.currencyCode),
    p_invoiced_quantity: positiveNumber(input.invoicedQuantity, "Invoiced quantity"),
    p_project_invoice_cost: positiveNumber(input.projectInvoiceCost, "Project invoice cost"),
  });
  if (error) throw error;
  return data as string;
}

export async function reverseProjectProcurementInvoiceAllocation(input: {
  allocationId: string;
  reason: string;
}) {
  await requireProcurementInvoiceManage();
  const { data, error } = await supabase.rpc("reverse_customer_project_procurement_invoice_allocation", {
    p_allocation_id: input.allocationId,
    p_reason: requiredText(input.reason, "Allocation reversal reason"),
  });
  if (error) throw error;
  return data as string;
}
