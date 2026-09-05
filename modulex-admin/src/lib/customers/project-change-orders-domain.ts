import { supabase } from "@/lib/supabase/client";

export type ProjectChangeOrderStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
export type ProjectChangeOrderApplicationStatus = "not_applicable" | "pending" | "partial" | "applied";
export type ProjectChangeOrderEffectType =
  | "add_scope"
  | "remove_scope"
  | "quantity_change"
  | "price_adjustment"
  | "customer_credit"
  | "vendor_credit"
  | "other";

export type ProjectChangeOrderLineInput = {
  effectType: ProjectChangeOrderEffectType;
  targetOrderId: string | null;
  targetOrderItemId: string | null;
  productId: string | null;
  description: string;
  quantityDelta: number | null;
  sellAmountDelta: number;
  sellCurrencyCode: string;
  expectedCostDelta: number | null;
  costCurrencyCode: string | null;
  vendorCode: string | null;
};

export type ProjectChangeOrderLine = ProjectChangeOrderLineInput & {
  id: string;
  lineNo: number;
};

export type ProjectChangeOrderEvent = {
  id: string;
  eventType: string;
  statusAfter: ProjectChangeOrderStatus;
  note: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

export type ProjectChangeOrderApplication = {
  id: string;
  orderId: string;
  orderRevisionId: string;
  canonicalSellDelta: number;
  currencyCode: string;
  linkedAt: string;
};

export type ProjectChangeOrderRevisionCandidate = {
  id: string;
  orderId: string;
  orderNumber: string;
  revisionNumber: number;
  reason: string | null;
  createdAt: string;
};

export type ProjectChangeOrderListItem = {
  id: string;
  projectId: string;
  changeOrderNumber: number;
  title: string;
  reason: string | null;
  status: ProjectChangeOrderStatus;
  correctionOfChangeOrderId: string | null;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  cancelledAt: string | null;
  applicationStatus: ProjectChangeOrderApplicationStatus;
  reconciliationState: string;
  approvedSellDelta: number | null;
  sellCurrencyCode: string | null;
  linkedSellDelta: number | null;
  applicationCount: number;
  expectedCostDelta: number | null;
  costCurrencyCode: string | null;
  vendorCode: string | null;
};

export type ProjectChangeOrderDetail = ProjectChangeOrderListItem & {
  reviewNote: string | null;
  lines: ProjectChangeOrderLine[];
  events: ProjectChangeOrderEvent[];
  applications: ProjectChangeOrderApplication[];
  candidateRevisions: ProjectChangeOrderRevisionCandidate[];
};

export type ProjectChangeOrderSummary = {
  projectId: string;
  counts: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    cancelled: number;
    applied: number;
    approvedPending: number;
  };
  canonicalMixedCurrency: boolean;
  canonicalCurrencyCode: string | null;
  canonicalSales: number | null;
  canonicalFinancialSummary: Record<string, unknown> | null;
  pendingSellMixedCurrency: boolean;
  approvedPendingSellImpact: number | null;
  pendingSellCurrencyCode: string | null;
  pendingExpectedCostComplete: boolean | null;
  pendingCostMixedCurrency: boolean | null;
  pendingExpectedCostImpact: number | null;
  pendingCostCurrencyCode: string | null;
  mixedCurrency: boolean;
};

type RawJson = Record<string, unknown>;

function objectValue(value: unknown): RawJson {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawJson) : {};
}

function arrayValue(value: unknown): RawJson[] {
  return Array.isArray(value) ? value.map(objectValue) : [];
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter code.");
  return normalized;
}

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function mapListItem(row: RawJson): ProjectChangeOrderListItem {
  return {
    id: textValue(row.id),
    projectId: textValue(row.project_id),
    changeOrderNumber: numberValue(row.change_order_number),
    title: textValue(row.title, "Untitled Change Order"),
    reason: nullableText(row.reason),
    status: textValue(row.status, "draft") as ProjectChangeOrderStatus,
    correctionOfChangeOrderId: nullableText(row.correction_of_change_order_id),
    createdAt: textValue(row.created_at),
    submittedAt: nullableText(row.submitted_at),
    reviewedAt: nullableText(row.reviewed_at),
    cancelledAt: nullableText(row.cancelled_at),
    applicationStatus: textValue(row.application_status, "not_applicable") as ProjectChangeOrderApplicationStatus,
    reconciliationState: textValue(row.reconciliation_state, "not_applicable"),
    approvedSellDelta: nullableNumber(row.approved_sell_delta),
    sellCurrencyCode: nullableText(row.sell_currency_code),
    linkedSellDelta: nullableNumber(row.linked_sell_delta),
    applicationCount: numberValue(row.application_count),
    expectedCostDelta: nullableNumber(row.expected_cost_delta),
    costCurrencyCode: nullableText(row.cost_currency_code),
    vendorCode: nullableText(row.vendor_code),
  };
}

function mapLine(row: RawJson): ProjectChangeOrderLine {
  return {
    id: textValue(row.id),
    lineNo: numberValue(row.line_no),
    effectType: textValue(row.effect_type, "other") as ProjectChangeOrderEffectType,
    targetOrderId: nullableText(row.target_order_id),
    targetOrderItemId: nullableText(row.target_order_item_id),
    productId: nullableText(row.product_id),
    description: textValue(row.description),
    quantityDelta: nullableNumber(row.quantity_delta),
    sellAmountDelta: numberValue(row.sell_amount_delta),
    sellCurrencyCode: textValue(row.sell_currency_code, "USD"),
    expectedCostDelta: nullableNumber(row.expected_cost_delta),
    costCurrencyCode: nullableText(row.cost_currency_code),
    vendorCode: nullableText(row.vendor_code),
  };
}

function mapDetail(row: RawJson): ProjectChangeOrderDetail {
  return {
    ...mapListItem(row),
    reviewNote: nullableText(row.review_note),
    lines: arrayValue(row.lines).map(mapLine),
    events: arrayValue(row.events).map((event) => ({
      id: textValue(event.id),
      eventType: textValue(event.event_type),
      statusAfter: textValue(event.status_after, "draft") as ProjectChangeOrderStatus,
      note: nullableText(event.note),
      metadata: objectValue(event.metadata),
      createdBy: nullableText(event.created_by),
      createdAt: textValue(event.created_at),
    })),
    applications: arrayValue(row.applications).map((application) => ({
      id: textValue(application.id),
      orderId: textValue(application.order_id),
      orderRevisionId: textValue(application.order_revision_id),
      canonicalSellDelta: numberValue(application.canonical_sell_delta),
      currencyCode: textValue(application.currency_code, "USD"),
      linkedAt: textValue(application.linked_at),
    })),
    candidateRevisions: arrayValue(row.candidate_revisions).map((revision) => ({
      id: textValue(revision.id),
      orderId: textValue(revision.order_id),
      orderNumber: textValue(revision.order_number, "Order"),
      revisionNumber: numberValue(revision.revision_number),
      reason: nullableText(revision.reason),
      createdAt: textValue(revision.created_at),
    })),
  };
}

export async function getCustomerProjectChangeOrders(projectId: string): Promise<ProjectChangeOrderListItem[]> {
  const { data, error } = await supabase.rpc("get_customer_project_change_orders", { p_project_id: projectId });
  if (error) throw error;
  return arrayValue(data).map(mapListItem);
}

export async function getCustomerProjectChangeOrder(changeOrderId: string): Promise<ProjectChangeOrderDetail> {
  const { data, error } = await supabase.rpc("get_customer_project_change_order", { p_change_order_id: changeOrderId });
  if (error) throw error;
  return mapDetail(objectValue(data));
}

export async function getCustomerProjectChangeOrderSummary(projectId: string): Promise<ProjectChangeOrderSummary> {
  const { data, error } = await supabase.rpc("get_customer_project_change_order_summary", { p_project_id: projectId });
  if (error) throw error;
  const row = objectValue(data);
  const counts = objectValue(row.counts);
  return {
    projectId: textValue(row.project_id, projectId),
    counts: {
      draft: numberValue(counts.draft),
      submitted: numberValue(counts.submitted),
      approved: numberValue(counts.approved),
      rejected: numberValue(counts.rejected),
      cancelled: numberValue(counts.cancelled),
      applied: numberValue(counts.applied),
      approvedPending: numberValue(counts.approved_pending),
    },
    canonicalMixedCurrency: booleanValue(row.canonical_mixed_currency),
    canonicalCurrencyCode: nullableText(row.canonical_currency_code),
    canonicalSales: nullableNumber(row.canonical_sales),
    canonicalFinancialSummary: row.canonical_financial_summary ? objectValue(row.canonical_financial_summary) : null,
    pendingSellMixedCurrency: booleanValue(row.pending_sell_mixed_currency),
    approvedPendingSellImpact: nullableNumber(row.approved_pending_sell_impact),
    pendingSellCurrencyCode: nullableText(row.pending_sell_currency_code),
    pendingExpectedCostComplete: row.pending_expected_cost_complete === null ? null : booleanValue(row.pending_expected_cost_complete),
    pendingCostMixedCurrency: row.pending_cost_mixed_currency === null ? null : booleanValue(row.pending_cost_mixed_currency),
    pendingExpectedCostImpact: nullableNumber(row.pending_expected_cost_impact),
    pendingCostCurrencyCode: nullableText(row.pending_cost_currency_code),
    mixedCurrency: booleanValue(row.mixed_currency),
  };
}

export async function createCustomerProjectChangeOrder(input: {
  projectId: string;
  title: string;
  reason?: string | null;
  correctionOfChangeOrderId?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_customer_project_change_order", {
    p_project_id: input.projectId,
    p_title: requiredText(input.title, "Change Order title"),
    p_reason: input.reason?.trim() || null,
    p_correction_of_change_order_id: input.correctionOfChangeOrderId || null,
  });
  if (error) throw error;
  return String(data);
}

export async function updateCustomerProjectChangeOrderDraft(input: {
  changeOrderId: string;
  title: string;
  reason?: string | null;
  correctionOfChangeOrderId?: string | null;
}) {
  const { error } = await supabase.rpc("update_customer_project_change_order_draft", {
    p_change_order_id: input.changeOrderId,
    p_title: requiredText(input.title, "Change Order title"),
    p_reason: input.reason?.trim() || null,
    p_correction_of_change_order_id: input.correctionOfChangeOrderId || null,
  });
  if (error) throw error;
}

export async function setCustomerProjectChangeOrderLines(changeOrderId: string, lines: ProjectChangeOrderLineInput[]) {
  const payload = lines.map((line) => ({
    effect_type: line.effectType,
    target_order_id: line.targetOrderId || null,
    target_order_item_id: line.targetOrderItemId || null,
    product_id: line.productId || null,
    description: requiredText(line.description, "Line description"),
    quantity_delta: line.quantityDelta,
    sell_amount_delta: line.sellAmountDelta,
    sell_currency_code: normalizeCurrency(line.sellCurrencyCode),
    expected_cost_delta: line.expectedCostDelta,
    cost_currency_code: line.expectedCostDelta === null ? null : normalizeCurrency(line.costCurrencyCode || ""),
    vendor_code: line.vendorCode?.trim() || null,
  }));
  const { data, error } = await supabase.rpc("set_customer_project_change_order_lines", {
    p_change_order_id: changeOrderId,
    p_lines: payload,
  });
  if (error) throw error;
  return numberValue(data);
}

export async function submitCustomerProjectChangeOrder(changeOrderId: string) {
  const { data, error } = await supabase.rpc("submit_customer_project_change_order", { p_change_order_id: changeOrderId });
  if (error) throw error;
  return String(data);
}

export async function reviewCustomerProjectChangeOrder(changeOrderId: string, decision: "approved" | "rejected", note?: string | null) {
  const { data, error } = await supabase.rpc("review_customer_project_change_order", {
    p_change_order_id: changeOrderId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return String(data);
}

export async function cancelCustomerProjectChangeOrder(changeOrderId: string, reason: string) {
  const { data, error } = await supabase.rpc("cancel_customer_project_change_order", {
    p_change_order_id: changeOrderId,
    p_reason: requiredText(reason, "Cancellation reason"),
  });
  if (error) throw error;
  return String(data);
}

export async function linkCustomerProjectChangeOrderRevision(changeOrderId: string, orderRevisionId: string) {
  const { data, error } = await supabase.rpc("link_customer_project_change_order_revision", {
    p_change_order_id: changeOrderId,
    p_order_revision_id: orderRevisionId,
  });
  if (error) throw error;
  return String(data);
}
