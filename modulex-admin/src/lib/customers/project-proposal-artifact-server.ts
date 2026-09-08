import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildProjectProposalPdfProjection } from "@/lib/customers/project-proposal-pdf-projection";
import { getProjectProposalPdfSource } from "@/lib/customers/project-proposal-server-read";
import { renderProjectProposalPdf } from "@/lib/documents/proposal-pdf-server";

export const PROJECT_PROPOSAL_ARTIFACT_BUCKET = "customer-documents";

export type ProjectProposalArtifact = {
  id: string;
  projectId: string;
  proposalId: string;
  proposalRevisionId: string;
  acceptanceId: string;
  customerDocumentId: string;
  contentSha256: string;
  createdBy: string;
  createdAt: string;
  fileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  portalVisible: boolean;
  proposalNumber: string;
  revisionNo: number;
  acceptedAt: string;
  acceptedName: string;
  acceptanceMethod: string;
};

type RawArtifact = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown) {
  return value === true;
}

export function mapProjectProposalArtifact(value: unknown): ProjectProposalArtifact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as RawArtifact;
  const artifact: ProjectProposalArtifact = {
    id: text(row.id),
    projectId: text(row.project_id),
    proposalId: text(row.proposal_id),
    proposalRevisionId: text(row.proposal_revision_id),
    acceptanceId: text(row.acceptance_id),
    customerDocumentId: text(row.customer_document_id),
    contentSha256: text(row.content_sha256),
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
    fileName: text(row.file_name),
    storageBucket: text(row.storage_bucket),
    storagePath: text(row.storage_path),
    mimeType: text(row.mime_type),
    fileSizeBytes: numberValue(row.file_size_bytes),
    portalVisible: booleanValue(row.portal_visible),
    proposalNumber: text(row.proposal_number),
    revisionNo: numberValue(row.revision_no),
    acceptedAt: text(row.accepted_at),
    acceptedName: text(row.accepted_name),
    acceptanceMethod: text(row.acceptance_method),
  };
  return artifact.id ? artifact : null;
}

export function createProjectProposalArtifactUserClient(accessToken: string): SupabaseClient {
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

export function sha256Hex(bytes: Uint8Array | ArrayBuffer) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return createHash("sha256").update(input).digest("hex");
}

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Proposal";
}

export function acceptedProposalArtifactPath(input: {
  customerId: string;
  projectId: string;
  proposalId: string;
  revisionId: string;
  fileName: string;
}) {
  return `${input.customerId}/projects/${input.projectId}/proposals/${input.proposalId}/revisions/${input.revisionId}/accepted/${input.fileName}`;
}

async function getArtifactByRevision(input: {
  supabase: SupabaseClient;
  projectId: string;
  proposalId: string;
  revisionId: string;
}) {
  const { data, error } = await input.supabase.rpc("get_project_proposal_artifact", {
    p_project_id: input.projectId,
    p_artifact_id: null,
    p_proposal_id: input.proposalId,
    p_revision_id: input.revisionId,
  });
  if (error) throw error;
  return mapProjectProposalArtifact(data);
}

export async function getProjectProposalArtifactServer(input: {
  accessToken: string;
  projectId: string;
  artifactId: string;
}) {
  const supabase = createProjectProposalArtifactUserClient(input.accessToken);
  const { data, error } = await supabase.rpc("get_project_proposal_artifact", {
    p_project_id: input.projectId,
    p_artifact_id: input.artifactId,
    p_proposal_id: null,
    p_revision_id: null,
  });
  if (error) throw error;
  return mapProjectProposalArtifact(data);
}

export async function persistAcceptedProjectProposalArtifact(input: {
  accessToken: string;
  projectId: string;
  proposalId: string;
  revisionId: string;
}): Promise<ProjectProposalArtifact> {
  const supabase = createProjectProposalArtifactUserClient(input.accessToken);
  const existing = await getArtifactByRevision({
    supabase,
    projectId: input.projectId,
    proposalId: input.proposalId,
    revisionId: input.revisionId,
  });
  if (existing) return existing;

  const source = await getProjectProposalPdfSource(input);
  const { project, proposal, revision, settings } = source;

  if (project.id !== input.projectId
      || proposal.id !== input.proposalId
      || proposal.projectId !== input.projectId
      || revision.id !== input.revisionId) {
    throw new Error("PROJECT_PROPOSAL_ARTIFACT_IDENTITY_MISMATCH");
  }
  if (proposal.status !== "accepted" || revision.state !== "accepted" || !revision.acceptance?.id) {
    throw new Error("PROJECT_PROPOSAL_ARTIFACT_NOT_ACCEPTED");
  }

  const projection = buildProjectProposalPdfProjection({ project, proposal, revision, settings });
  const bytes = await renderProjectProposalPdf(projection);
  if (bytes.byteLength <= 0) throw new Error("PROJECT_PROPOSAL_ARTIFACT_EMPTY_PDF");

  const contentSha256 = sha256Hex(bytes);
  const fileName = `Proposal-${safeFilePart(proposal.proposalNumber)}-R${revision.revisionNo}.pdf`;
  const storagePath = acceptedProposalArtifactPath({
    customerId: project.customer_id,
    projectId: input.projectId,
    proposalId: input.proposalId,
    revisionId: input.revisionId,
    fileName,
  });

  const { error: uploadError } = await supabase.storage
    .from(PROJECT_PROPOSAL_ARTIFACT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    const { data: storedBlob, error: downloadError } = await supabase.storage
      .from(PROJECT_PROPOSAL_ARTIFACT_BUCKET)
      .download(storagePath);
    if (downloadError || !storedBlob) throw uploadError;
    const storedBytes = new Uint8Array(await storedBlob.arrayBuffer());
    if (sha256Hex(storedBytes) !== contentSha256) {
      throw new Error("PROJECT_PROPOSAL_ARTIFACT_STORAGE_CONFLICT");
    }
  }

  const { data, error } = await supabase.rpc("register_project_proposal_accepted_artifact", {
    p_project_id: input.projectId,
    p_proposal_id: input.proposalId,
    p_revision_id: input.revisionId,
    p_acceptance_id: revision.acceptance.id,
    p_file_name: fileName,
    p_storage_path: storagePath,
    p_mime_type: "application/pdf",
    p_file_size_bytes: bytes.byteLength,
    p_content_sha256: contentSha256,
  });
  if (error) throw error;

  const artifact = mapProjectProposalArtifact(data);
  if (!artifact) throw new Error("PROJECT_PROPOSAL_ARTIFACT_REGISTRATION_FAILED");
  if (artifact.contentSha256 !== contentSha256 || artifact.storagePath !== storagePath) {
    throw new Error("PROJECT_PROPOSAL_ARTIFACT_REGISTRATION_MISMATCH");
  }
  return artifact;
}
