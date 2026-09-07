import { supabase } from "@/lib/supabase/client";
import {
  mapProjectProposalError,
  normalizeOptionalText,
  normalizeRequiredText,
} from "@/lib/customers/project-proposal-domain";

function throwRpcError(error: unknown) {
  if (error) throw new Error(mapProjectProposalError(error));
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
