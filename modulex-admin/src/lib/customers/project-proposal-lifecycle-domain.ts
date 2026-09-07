import { supabase } from "@/lib/supabase/client";
import {
  mapProjectProposalError,
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/lib/customers/project-proposal-domain";

export function mapProjectProposalLifecycleError(error: unknown) {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const mappings: Array<[string, string]> = [
    ["PROPOSAL_IDEMPOTENCY_KEY_REQUIRED", "A safe retry key is required before creating a new Proposal revision."],
    ["PROPOSAL_DRAFT_ALREADY_EXISTS", "This Proposal already has a draft revision. Send or continue editing that draft before creating another."],
    ["PROPOSAL_AREA_REQUIRED_TO_SEND", "Add at least one Area before sending this Proposal revision."],
    ["PROPOSAL_PRICING_GROUP_AREA_REQUIRED", "Every Pricing Group must contain at least one Area before this Proposal can be sent."],
    ["PROPOSAL_REJECTION_ALREADY_RECORDED", "This revision already has rejection evidence recorded."],
    ["PROPOSAL_REVISION_REJECT_REQUIRES_SENT", "Only a sent Proposal revision can be rejected."],
    ["PROPOSAL_ACCEPTED_NAME_REQUIRED", "Accepted name is required."],
    ["PROPOSAL_ACCEPTANCE_METHOD_REQUIRED", "Acceptance method is required."],
    ["PROPOSAL_ACCEPTANCE_ALREADY_RECORDED", "This revision already has acceptance evidence recorded."],
    ["PROPOSAL_REVISION_ACCEPT_REQUIRES_SENT", "Only a sent Proposal revision can be accepted."],
  ];
  for (const [code, message] of mappings) {
    if (raw.includes(code)) return message;
  }
  return mapProjectProposalError(error);
}

function throwRpcError(error: unknown) {
  if (error) throw new Error(mapProjectProposalLifecycleError(error));
}

export async function createProjectProposalRevision(input: {
  proposalId: string;
  idempotencyKey: string;
  revisionNote?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_project_proposal_revision", {
    p_proposal_id: input.proposalId,
    p_idempotency_key: input.idempotencyKey,
    p_revision_note: normalizeOptionalText(input.revisionNote),
  });
  throwRpcError(error);
  return String(data);
}

export async function sendProjectProposalRevision(revisionId: string) {
  const { data, error } = await supabase.rpc("send_project_proposal_revision", {
    p_revision_id: revisionId,
  });
  throwRpcError(error);
  return String(data);
}

export async function rejectProjectProposalRevision(input: {
  revisionId: string;
  rejectionNote: string;
}) {
  const { data, error } = await supabase.rpc("reject_project_proposal_revision", {
    p_revision_id: input.revisionId,
    p_note: normalizeRequiredText(input.rejectionNote, "Rejection note"),
  });
  throwRpcError(error);
  return String(data);
}

export async function acceptProjectProposalRevision(input: {
  revisionId: string;
  acceptedName: string;
  acceptedEmail?: string | null;
  acceptanceMethod: string;
  signatureText?: string | null;
}) {
  const { data, error } = await supabase.rpc("accept_project_proposal_revision", {
    p_revision_id: input.revisionId,
    p_accepted_name: normalizeRequiredText(input.acceptedName, "Accepted name"),
    p_accepted_email: normalizeOptionalText(input.acceptedEmail),
    p_acceptance_method: normalizeRequiredText(input.acceptanceMethod, "Acceptance method"),
    p_signature_text: normalizeOptionalText(input.signatureText),
  });
  throwRpcError(error);
  return String(data);
}
