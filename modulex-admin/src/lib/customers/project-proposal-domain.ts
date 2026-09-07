import { supabase } from "@/lib/supabase/client";

export type ProjectProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded";
export type ProjectProposalRevisionState = ProjectProposalStatus;
export type ProjectProposalReadiness = "not_ready" | "ready_to_measure" | "needs_remeasure" | "ready_to_cut";

export type ProposalAreaType = {
  id: string;
  name: string;
  normalizedKey: string;
  isActive: boolean;
  sortOrder: number;
};

export type ProjectProposalPricingGroup = {
  id: string;
  label: string;
  description: string | null;
  sellAmount: number;
  sortOrder: number;
};

export type ProjectProposalArea = {
  id: string;
  areaTypeId: string | null;
  areaTypeName: string | null;
  areaName: string;
  readinessStatus: ProjectProposalReadiness | null;
  statusNote: string | null;
  materialProductId: string | null;
  materialDescription: string | null;
  supplierSnapshot: string | null;
  finish: string | null;
  thickness: string | null;
  sqFt: number | null;
  linearFt: number | null;
  edgeProfile: string | null;
  edgeLinearFt: number | null;
  sinkQuantity: number | null;
  sinkSource: string | null;
  sinkCutoutQuantity: number | null;
  sinkTemplateStatus: string | null;
  backsplash: string | null;
  backsplashNotes: string | null;
  scopeNotes: string | null;
  measurementNotes: string | null;
  internalNotes: string | null;
  pricingGroupId: string | null;
  directSellAmount: number | null;
  sortOrder: number;
};

export type ProjectProposalAcceptance = {
  id: string;
  acceptedName: string;
  acceptedEmail: string | null;
  acceptedAt: string;
  acceptanceMethod: string;
  signatureText: string | null;
};

export type ProjectProposalRevision = {
  id: string;
  revisionNo: number;
  state: ProjectProposalRevisionState;
  currencyCode: string;
  validUntil: string | null;
  customerMessage: string | null;
  termsText: string | null;
  revisionNote: string | null;
  sentAt: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  acceptedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  proposalTotal: number;
  pricingGroups: ProjectProposalPricingGroup[];
  areas: ProjectProposalArea[];
  acceptance: ProjectProposalAcceptance | null;
};

export type ProjectProposal = {
  id: string;
  projectId: string;
  proposalNumber: string;
  status: ProjectProposalStatus;
  createdAt: string;
  updatedAt: string;
  currentRevisionId: string | null;
  revisions: ProjectProposalRevision[];
};

export type ProjectProposalSummary = {
  id: string;
  projectId: string;
  proposalNumber: string;
  status: ProjectProposalStatus;
  createdAt: string;
  updatedAt: string;
  latestRevision: null | {
    id: string;
    revisionNo: number;
    state: ProjectProposalRevisionState;
    currencyCode: string;
    validUntil: string | null;
    proposalTotal: number;
  };
};

export type ProposalMaterialProductOption = { id: string; label: string };

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

function nullableTextValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function normalizeOptionalNumber(
  value: string | number | null | undefined,
  label = "Value",
  options: { integer?: boolean; min?: number } = {},
) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid number.`);
  if (options.integer && !Number.isInteger(parsed)) throw new Error(`${label} must be a whole number.`);
  if (options.min !== undefined && parsed < options.min) throw new Error(`${label} must be at least ${options.min}.`);
  return parsed;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter code.");
  return normalized;
}

export function mapProjectProposalError(error: unknown) {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const mappings: Array<[string, string]> = [
    ["PROJECT_PROPOSAL_VIEW_FORBIDDEN", "You do not have permission to view Project Proposals."],
    ["PROJECT_PROPOSAL_MANAGE_FORBIDDEN", "You do not have permission to manage Project Proposals."],
    ["PROJECT_PROPOSAL_NOT_FOUND", "Proposal could not be found."],
    ["PROPOSAL_REVISION_NOT_FOUND", "Proposal revision could not be found."],
    ["PROPOSAL_REVISION_IMMUTABLE", "This Proposal revision is locked. Create a new revision for commercial changes."],
    ["PROPOSAL_ACCEPTED_CHANGE_ORDER_REQUIRED", "Accepted Proposal scope is locked. Use a Project Change Order for later commercial changes."],
    ["PROPOSAL_AREA_NAME_REQUIRED", "Area Name is required."],
    ["PROPOSAL_AREA_READINESS_INVALID", "Select a valid Area readiness state."],
    ["PROPOSAL_AREA_DIRECT_OR_GROUP_REQUIRED", "Use direct Area pricing or a Pricing Group, not both."],
    ["PROPOSAL_PRICING_GROUP_REVISION_MISMATCH", "The selected Pricing Group belongs to another Proposal revision."],
    ["PROPOSAL_PRICING_GROUP_IN_USE", "Reassign the Areas in this Pricing Group before deleting it."],
    ["PROPOSAL_PRICING_GROUP_LABEL_REQUIRED", "Pricing Group label is required."],
    ["PROPOSAL_PRICING_GROUP_AMOUNT_REQUIRED", "Pricing Group sell amount is required."],
    ["PROPOSAL_AREA_TYPE_INACTIVE", "The selected Area Type is inactive and cannot be used for a new assignment."],
  ];
  for (const [code, message] of mappings) {
    if (raw.includes(code)) return message;
  }
  return raw || "Proposal action failed.";
}

function throwRpcError(error: unknown) {
  if (error) throw new Error(mapProjectProposalError(error));
}

function mapAreaType(row: RawJson): ProposalAreaType {
  return {
    id: textValue(row.id),
    name: textValue(row.name),
    normalizedKey: textValue(row.normalized_key),
    isActive: row.is_active === true,
    sortOrder: numberValue(row.sort_order),
  };
}

function mapPricingGroup(row: RawJson): ProjectProposalPricingGroup {
  return {
    id: textValue(row.id),
    label: textValue(row.label),
    description: nullableTextValue(row.description),
    sellAmount: numberValue(row.sell_amount),
    sortOrder: numberValue(row.sort_order),
  };
}

function mapArea(row: RawJson): ProjectProposalArea {
  return {
    id: textValue(row.id),
    areaTypeId: nullableTextValue(row.area_type_id),
    areaTypeName: nullableTextValue(row.area_type_name),
    areaName: textValue(row.area_name),
    readinessStatus: nullableTextValue(row.readiness_status) as ProjectProposalReadiness | null,
    statusNote: nullableTextValue(row.status_note),
    materialProductId: nullableTextValue(row.material_product_id),
    materialDescription: nullableTextValue(row.material_description),
    supplierSnapshot: nullableTextValue(row.supplier_snapshot),
    finish: nullableTextValue(row.finish),
    thickness: nullableTextValue(row.thickness),
    sqFt: nullableNumberValue(row.sq_ft),
    linearFt: nullableNumberValue(row.linear_ft),
    edgeProfile: nullableTextValue(row.edge_profile),
    edgeLinearFt: nullableNumberValue(row.edge_linear_ft),
    sinkQuantity: nullableNumberValue(row.sink_quantity),
    sinkSource: nullableTextValue(row.sink_source),
    sinkCutoutQuantity: nullableNumberValue(row.sink_cutout_quantity),
    sinkTemplateStatus: nullableTextValue(row.sink_template_status),
    backsplash: nullableTextValue(row.backsplash),
    backsplashNotes: nullableTextValue(row.backsplash_notes),
    scopeNotes: nullableTextValue(row.scope_notes),
    measurementNotes: nullableTextValue(row.measurement_notes),
    internalNotes: nullableTextValue(row.internal_notes),
    pricingGroupId: nullableTextValue(row.pricing_group_id),
    directSellAmount: nullableNumberValue(row.direct_sell_amount),
    sortOrder: numberValue(row.sort_order),
  };
}

function mapRevision(row: RawJson): ProjectProposalRevision {
  const acceptance = row.acceptance ? objectValue(row.acceptance) : null;
  return {
    id: textValue(row.id),
    revisionNo: numberValue(row.revision_no),
    state: textValue(row.state, "draft") as ProjectProposalRevisionState,
    currencyCode: textValue(row.currency_code, "USD"),
    validUntil: nullableTextValue(row.valid_until),
    customerMessage: nullableTextValue(row.customer_message),
    termsText: nullableTextValue(row.terms_text),
    revisionNote: nullableTextValue(row.revision_note),
    sentAt: nullableTextValue(row.sent_at),
    rejectedAt: nullableTextValue(row.rejected_at),
    rejectionNote: nullableTextValue(row.rejection_note),
    acceptedAt: nullableTextValue(row.accepted_at),
    supersededAt: nullableTextValue(row.superseded_at),
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
    proposalTotal: numberValue(row.proposal_total),
    pricingGroups: arrayValue(row.pricing_groups).map(mapPricingGroup),
    areas: arrayValue(row.areas).map(mapArea),
    acceptance: acceptance ? {
      id: textValue(acceptance.id),
      acceptedName: textValue(acceptance.accepted_name),
      acceptedEmail: nullableTextValue(acceptance.accepted_email),
      acceptedAt: textValue(acceptance.accepted_at),
      acceptanceMethod: textValue(acceptance.acceptance_method),
      signatureText: nullableTextValue(acceptance.signature_text),
    } : null,
  };
}

function mapProposal(row: RawJson): ProjectProposal {
  return {
    id: textValue(row.id),
    projectId: textValue(row.project_id),
    proposalNumber: textValue(row.proposal_number),
    status: textValue(row.status, "draft") as ProjectProposalStatus,
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
    currentRevisionId: nullableTextValue(row.current_revision_id),
    revisions: arrayValue(row.revisions).map(mapRevision),
  };
}

export async function getProposalAreaTypes(includeInactive = false) {
  const { data, error } = await supabase.rpc("get_proposal_area_types", { p_include_inactive: includeInactive });
  throwRpcError(error);
  return arrayValue(data).map(mapAreaType);
}

export async function getProjectProposals(projectId: string): Promise<ProjectProposalSummary[]> {
  const { data, error } = await supabase.rpc("get_project_proposals", { p_project_id: projectId });
  throwRpcError(error);
  return arrayValue(data).map((row) => {
    const latest = row.latest_revision ? objectValue(row.latest_revision) : null;
    return {
      id: textValue(row.id),
      projectId: textValue(row.project_id),
      proposalNumber: textValue(row.proposal_number),
      status: textValue(row.status, "draft") as ProjectProposalStatus,
      createdAt: textValue(row.created_at),
      updatedAt: textValue(row.updated_at),
      latestRevision: latest ? {
        id: textValue(latest.id),
        revisionNo: numberValue(latest.revision_no),
        state: textValue(latest.state, "draft") as ProjectProposalRevisionState,
        currencyCode: textValue(latest.currency_code, "USD"),
        validUntil: nullableTextValue(latest.valid_until),
        proposalTotal: numberValue(latest.proposal_total),
      } : null,
    };
  });
}

export async function getProjectProposal(proposalId: string) {
  const { data, error } = await supabase.rpc("get_project_proposal", { p_proposal_id: proposalId });
  throwRpcError(error);
  return mapProposal(objectValue(data));
}

export async function createProjectProposal(input: {
  projectId: string;
  idempotencyKey: string;
  currencyCode?: string;
  validUntil?: string | null;
  customerMessage?: string | null;
  termsText?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_project_proposal", {
    p_project_id: input.projectId,
    p_idempotency_key: input.idempotencyKey,
    p_currency_code: normalizeCurrency(input.currencyCode ?? "USD"),
    p_valid_until: normalizeOptionalText(input.validUntil),
    p_customer_message: normalizeOptionalText(input.customerMessage),
    p_terms_text: normalizeOptionalText(input.termsText),
  });
  throwRpcError(error);
  return String(data);
}

export async function updateProjectProposalDraft(input: {
  revisionId: string;
  currencyCode: string;
  validUntil?: string | null;
  customerMessage?: string | null;
  termsText?: string | null;
  revisionNote?: string | null;
}) {
  const { data, error } = await supabase.rpc("update_project_proposal_draft", {
    p_revision_id: input.revisionId,
    p_currency_code: normalizeCurrency(input.currencyCode),
    p_valid_until: normalizeOptionalText(input.validUntil),
    p_customer_message: normalizeOptionalText(input.customerMessage),
    p_terms_text: normalizeOptionalText(input.termsText),
    p_revision_note: normalizeOptionalText(input.revisionNote),
  });
  throwRpcError(error);
  return String(data);
}

export type ProjectProposalAreaInput = {
  id: string;
  areaTypeId?: string | null;
  areaName: string;
  readinessStatus?: ProjectProposalReadiness | null;
  statusNote?: string | null;
  materialProductId?: string | null;
  materialDescription?: string | null;
  supplierSnapshot?: string | null;
  finish?: string | null;
  thickness?: string | null;
  sqFt?: string | number | null;
  linearFt?: string | number | null;
  edgeProfile?: string | null;
  edgeLinearFt?: string | number | null;
  sinkQuantity?: string | number | null;
  sinkSource?: string | null;
  sinkCutoutQuantity?: string | number | null;
  sinkTemplateStatus?: string | null;
  backsplash?: string | null;
  backsplashNotes?: string | null;
  scopeNotes?: string | null;
  measurementNotes?: string | null;
  internalNotes?: string | null;
  pricingGroupId?: string | null;
  directSellAmount?: string | number | null;
  sortOrder?: number;
};

export async function upsertProjectProposalArea(revisionId: string, area: ProjectProposalAreaInput) {
  const directSellAmount = normalizeOptionalNumber(area.directSellAmount, "Direct sell amount", { min: 0 });
  const pricingGroupId = normalizeOptionalText(area.pricingGroupId);
  if (directSellAmount !== null && pricingGroupId) {
    throw new Error("Use direct Area pricing or a Pricing Group, not both.");
  }
  const payload = {
    id: area.id,
    area_type_id: normalizeOptionalText(area.areaTypeId),
    area_name: normalizeRequiredText(area.areaName, "Area Name"),
    readiness_status: area.readinessStatus ?? null,
    status_note: normalizeOptionalText(area.statusNote),
    material_product_id: normalizeOptionalText(area.materialProductId),
    material_description: normalizeOptionalText(area.materialDescription),
    supplier_snapshot: normalizeOptionalText(area.supplierSnapshot),
    finish: normalizeOptionalText(area.finish),
    thickness: normalizeOptionalText(area.thickness),
    sq_ft: normalizeOptionalNumber(area.sqFt, "Square feet", { min: 0 }),
    linear_ft: normalizeOptionalNumber(area.linearFt, "Linear feet", { min: 0 }),
    edge_profile: normalizeOptionalText(area.edgeProfile),
    edge_linear_ft: normalizeOptionalNumber(area.edgeLinearFt, "Edge linear feet", { min: 0 }),
    sink_quantity: normalizeOptionalNumber(area.sinkQuantity, "Sink quantity", { integer: true, min: 0 }),
    sink_source: normalizeOptionalText(area.sinkSource),
    sink_cutout_quantity: normalizeOptionalNumber(area.sinkCutoutQuantity, "Sink cutout quantity", { integer: true, min: 0 }),
    sink_template_status: normalizeOptionalText(area.sinkTemplateStatus),
    backsplash: normalizeOptionalText(area.backsplash),
    backsplash_notes: normalizeOptionalText(area.backsplashNotes),
    scope_notes: normalizeOptionalText(area.scopeNotes),
    measurement_notes: normalizeOptionalText(area.measurementNotes),
    internal_notes: normalizeOptionalText(area.internalNotes),
    pricing_group_id: pricingGroupId,
    direct_sell_amount: directSellAmount,
    sort_order: area.sortOrder ?? 0,
  };
  const { data, error } = await supabase.rpc("upsert_project_proposal_area", { p_revision_id: revisionId, p_area: payload });
  throwRpcError(error);
  return String(data);
}

export async function deleteProjectProposalArea(areaId: string) {
  const { error } = await supabase.rpc("delete_project_proposal_area", { p_area_id: areaId });
  throwRpcError(error);
}

export async function upsertProjectProposalPricingGroup(input: {
  revisionId: string;
  id: string;
  label: string;
  description?: string | null;
  sellAmount: string | number;
  sortOrder?: number;
}) {
  const sellAmount = normalizeOptionalNumber(input.sellAmount, "Pricing Group sell amount", { min: 0 });
  if (sellAmount === null) throw new Error("Pricing Group sell amount is required.");
  const { data, error } = await supabase.rpc("upsert_project_proposal_pricing_group", {
    p_revision_id: input.revisionId,
    p_group: {
      id: input.id,
      label: normalizeRequiredText(input.label, "Pricing Group label"),
      description: normalizeOptionalText(input.description),
      sell_amount: sellAmount,
      sort_order: input.sortOrder ?? 0,
    },
  });
  throwRpcError(error);
  return String(data);
}

export async function deleteProjectProposalPricingGroup(groupId: string) {
  const { error } = await supabase.rpc("delete_project_proposal_pricing_group", { p_group_id: groupId });
  throwRpcError(error);
}

export async function searchProposalMaterialProducts(query: string): Promise<ProposalMaterialProductOption[]> {
  const normalized = query.trim();
  let request = supabase.from("products").select("id, sku, name").order("name").limit(20);
  if (normalized) {
    const safe = normalized.replaceAll(",", " ");
    request = request.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
  }
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: `${row.sku ? `${row.sku} — ` : ""}${row.name || "Unnamed product"}`,
  }));
}
