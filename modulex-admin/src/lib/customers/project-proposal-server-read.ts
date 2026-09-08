import { createClient } from "@supabase/supabase-js";
import type { CustomerProject } from "@/lib/customers/project-domain";
import type {
  ProjectProposal,
  ProjectProposalAcceptance,
  ProjectProposalArea,
  ProjectProposalPricingGroup,
  ProjectProposalReadiness,
  ProjectProposalRevision,
  ProjectProposalRevisionState,
  ProjectProposalStatus,
} from "@/lib/customers/project-proposal-domain";
import {
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
} from "@/lib/settings/types";

export type ProjectProposalPdfSource = {
  project: CustomerProject;
  proposal: ProjectProposal;
  revision: ProjectProposalRevision;
  settings: GeneralSettings;
};

type RawJson = Record<string, unknown>;

function objectValue(value: unknown): RawJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawJson : {};
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

function mapAcceptance(value: unknown): ProjectProposalAcceptance | null {
  if (!value) return null;
  const row = objectValue(value);
  return {
    id: textValue(row.id),
    acceptedName: textValue(row.accepted_name),
    acceptedEmail: nullableTextValue(row.accepted_email),
    acceptedAt: textValue(row.accepted_at),
    acceptanceMethod: textValue(row.acceptance_method),
    signatureText: nullableTextValue(row.signature_text),
  };
}

function mapRevision(row: RawJson): ProjectProposalRevision {
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
    acceptance: mapAcceptance(row.acceptance),
  };
}

function mapProposal(value: unknown): ProjectProposal {
  const row = objectValue(value);
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

function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase public runtime configuration is missing.");
  }
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function getProjectProposalPdfSource(input: {
  accessToken: string;
  projectId: string;
  proposalId: string;
  revisionId: string;
}): Promise<ProjectProposalPdfSource> {
  const supabase = createUserScopedClient(input.accessToken);
  const [projectResult, proposalResult, settingsResult] = await Promise.all([
    supabase.rpc("get_customer_project", { p_project_id: input.projectId }),
    supabase.rpc("get_project_proposal", { p_proposal_id: input.proposalId }),
    supabase.from("general_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (projectResult.error || !projectResult.data) {
    throw new Error("PROJECT_PDF_PROJECT_UNAVAILABLE");
  }
  if (proposalResult.error || !proposalResult.data) {
    throw new Error("PROJECT_PDF_PROPOSAL_UNAVAILABLE");
  }

  const project = projectResult.data as unknown as CustomerProject;
  const proposal = mapProposal(proposalResult.data);
  const revision = proposal.revisions.find((entry) => entry.id === input.revisionId);
  if (!revision) {
    throw new Error("PROJECT_PDF_REVISION_UNAVAILABLE");
  }

  return {
    project,
    proposal,
    revision,
    settings: settingsResult.error || !settingsResult.data
      ? DEFAULT_GENERAL_SETTINGS
      : settingsResult.data as unknown as GeneralSettings,
  };
}
