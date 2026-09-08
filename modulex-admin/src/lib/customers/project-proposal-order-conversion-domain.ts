import { supabase } from "@/lib/supabase/client";

export type ProposalOrderConversionArea = {
  id: string;
  areaName: string;
};

export type ProposalOrderConversionUnit = {
  kind: "direct_area" | "pricing_group";
  unitId: string;
  label: string;
  acceptedSellAmount: number;
  areas: ProposalOrderConversionArea[];
  convertedOrderId: string | null;
  convertedOrderNumber: string | null;
};

export type ProposalOrderConversionPreview = {
  projectId: string;
  customerId: string;
  proposalId: string;
  proposalNumber: string;
  revisionId: string;
  revisionNo: number;
  state: "accepted";
  currencyCode: string;
  units: ProposalOrderConversionUnit[];
};

export type ProposalOrderConversionHistory = {
  id: string;
  projectId: string;
  proposalId: string;
  revisionId: string;
  proposalNumber: string;
  revisionNo: number;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  acceptedScopeSellAmount: number;
  currencyCode: string;
  createdAt: string;
  areas: ProposalOrderConversionArea[];
};

export type CustomerOrderProposalOriginLine = {
  kind: "direct_area" | "pricing_group";
  label: string;
  acceptedSellAmount: number;
  initialOrderItemId: string | null;
  areas: ProposalOrderConversionArea[];
};

export type CustomerOrderProposalOrigin = {
  conversionId: string;
  projectId: string;
  proposalId: string;
  revisionId: string;
  proposalNumber: string;
  revisionNo: number;
  acceptedScopeSellAmount: number;
  currencyCode: string;
  createdAt: string;
  lines: CustomerOrderProposalOriginLine[];
};

type Raw = Record<string, unknown>;

function record(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
}

function rows(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableInput(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function mapArea(value: unknown): ProposalOrderConversionArea {
  const row = record(value);
  return { id: text(row.id), areaName: text(row.area_name) };
}

function mapUnit(value: unknown): ProposalOrderConversionUnit {
  const row = record(value);
  return {
    kind: text(row.kind) as ProposalOrderConversionUnit["kind"],
    unitId: text(row.unit_id),
    label: text(row.label),
    acceptedSellAmount: numeric(row.accepted_sell_amount),
    areas: rows(row.areas).map(mapArea),
    convertedOrderId: nullableText(row.converted_order_id),
    convertedOrderNumber: nullableText(row.converted_order_number),
  };
}

function mapPreview(value: unknown): ProposalOrderConversionPreview {
  const row = record(value);
  return {
    projectId: text(row.project_id),
    customerId: text(row.customer_id),
    proposalId: text(row.proposal_id),
    proposalNumber: text(row.proposal_number),
    revisionId: text(row.revision_id),
    revisionNo: numeric(row.revision_no),
    state: "accepted",
    currencyCode: text(row.currency_code) || "USD",
    units: rows(row.units).map(mapUnit),
  };
}

export function mapProposalOrderConversionError(error: unknown) {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const mappings: Array<[string, string]> = [
    ["PROPOSAL_ORDER_REVISION_NOT_ACCEPTED", "Only an exact accepted Proposal revision can create an Order."],
    ["PROPOSAL_ORDER_ACCEPTANCE_MISSING", "Acceptance evidence is missing for this Proposal revision."],
    ["PROPOSAL_ORDER_AREA_SELECTION_REQUIRED", "Select at least one accepted Proposal Area."],
    ["PROPOSAL_ORDER_AREA_SELECTION_DUPLICATE", "The Proposal Area selection contains duplicates."],
    ["PROPOSAL_ORDER_AREA_REVISION_MISMATCH", "One or more selected Areas do not belong to the accepted Proposal revision."],
    ["PROPOSAL_ORDER_AREA_ALREADY_CONVERTED", "One or more selected Areas already belong to an Order created from this Proposal."],
    ["PROPOSAL_ORDER_PRICING_GROUP_PARTIAL", "Pricing Group Areas must be converted together because the accepted group price is atomic."],
    ["PROPOSAL_ORDER_CURRENCY_MISMATCH", "Proposal and Order customer currencies do not match. P6 does not perform FX conversion."],
    ["PROPOSAL_ORDER_IDEMPOTENCY_MISMATCH", "This conversion retry key was already used for different Order inputs. Start the conversion again."],
    ["PROPOSAL_ORDER_SERVICE_PRODUCT_INVALID", "The canonical active SERVICE product is missing or ambiguous."],
    ["PROPOSAL_ORDER_ADMIN_FEE_RECONCILIATION_FAILED", "The accepted Proposal amount cannot reconcile exactly with the selected Administrative Fee. Adjust the fee or create the Order manually."],
    ["PROJECT_PROPOSAL_MANAGE_FORBIDDEN", "You do not have permission to create Orders from Proposals."],
    ["PROJECT_PROPOSAL_VIEW_FORBIDDEN", "You do not have permission to view Proposal conversion information."],
  ];
  for (const [code, message] of mappings) {
    if (raw.includes(code)) return message;
  }
  return raw || "Proposal to Order action failed.";
}

function throwRpc(error: unknown) {
  if (error) throw new Error(mapProposalOrderConversionError(error));
}

export async function getProjectProposalOrderConversionPreview(revisionId: string) {
  const { data, error } = await supabase.rpc("get_project_proposal_order_conversion_preview", {
    p_revision_id: revisionId,
  });
  throwRpc(error);
  return mapPreview(data);
}

export async function getProjectProposalOrderConversions(input: {
  projectId: string;
  proposalId?: string | null;
  revisionId?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_project_proposal_order_conversions", {
    p_project_id: input.projectId,
    p_proposal_id: input.proposalId ?? null,
    p_revision_id: input.revisionId ?? null,
  });
  throwRpc(error);
  return rows(data).map((value): ProposalOrderConversionHistory => ({
    id: text(value.id),
    projectId: text(value.project_id),
    proposalId: text(value.proposal_id),
    revisionId: text(value.revision_id),
    proposalNumber: text(value.proposal_number),
    revisionNo: numeric(value.revision_no),
    orderId: text(value.order_id),
    orderNumber: text(value.order_number),
    orderStatus: text(value.order_status),
    acceptedScopeSellAmount: numeric(value.accepted_scope_sell_amount),
    currencyCode: text(value.currency_code) || "USD",
    createdAt: text(value.created_at),
    areas: rows(value.areas).map(mapArea),
  }));
}

export async function getCustomerOrderProposalOrigin(orderId: string): Promise<CustomerOrderProposalOrigin | null> {
  const { data, error } = await supabase.rpc("get_customer_order_proposal_origin", { p_order_id: orderId });
  throwRpc(error);
  if (!data) return null;
  const row = record(data);
  return {
    conversionId: text(row.conversion_id),
    projectId: text(row.project_id),
    proposalId: text(row.proposal_id),
    revisionId: text(row.revision_id),
    proposalNumber: text(row.proposal_number),
    revisionNo: numeric(row.revision_no),
    acceptedScopeSellAmount: numeric(row.accepted_scope_sell_amount),
    currencyCode: text(row.currency_code) || "USD",
    createdAt: text(row.created_at),
    lines: rows(row.lines).map((value) => ({
      kind: text(value.kind) as CustomerOrderProposalOriginLine["kind"],
      label: text(value.label),
      acceptedSellAmount: numeric(value.accepted_sell_amount),
      initialOrderItemId: nullableText(value.initial_order_item_id),
      areas: rows(value.areas).map(mapArea),
    })),
  };
}

export type CreateOrderFromAcceptedProjectProposalInput = {
  revisionId: string;
  selectedAreaIds: string[];
  idempotencyKey: string;
  priceGroupId: string;
  billingAddressId?: string | null;
  shippingAddressId?: string | null;
  expectedDeliveryDate?: string | null;
  customerReference?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  taxRate: string | number;
  paymentMethodId?: string | null;
  fulfillmentType: string;
  administrativeFeePercent: string | number;
};

export async function createOrderFromAcceptedProjectProposal(input: CreateOrderFromAcceptedProjectProposalInput) {
  const { data, error } = await supabase.rpc("create_order_from_accepted_project_proposal", {
    p_revision_id: input.revisionId,
    p_selected_area_ids: input.selectedAreaIds,
    p_idempotency_key: input.idempotencyKey,
    p_price_group_id: input.priceGroupId,
    p_billing_address_id: input.billingAddressId || null,
    p_shipping_address_id: input.shippingAddressId || null,
    p_expected_delivery_date: nullableInput(input.expectedDeliveryDate),
    p_customer_reference: nullableInput(input.customerReference),
    p_customer_notes: nullableInput(input.customerNotes),
    p_internal_notes: nullableInput(input.internalNotes),
    p_tax_rate: Number(input.taxRate),
    p_payment_method_id: input.paymentMethodId || null,
    p_fulfillment_type: input.fulfillmentType,
    p_administrative_fee_percent: Number(input.administrativeFeePercent),
  });
  throwRpc(error);
  return String(data);
}
