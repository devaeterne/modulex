import { supabase } from "@/lib/supabase/client";

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

function mapArtifact(value: unknown): ProjectProposalArtifact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as RawArtifact;
  const text = (entry: unknown) => typeof entry === "string" ? entry : "";
  const numberValue = (entry: unknown) => {
    const parsed = Number(entry ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
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
    portalVisible: row.portal_visible === true,
    proposalNumber: text(row.proposal_number),
    revisionNo: numberValue(row.revision_no),
    acceptedAt: text(row.accepted_at),
    acceptedName: text(row.accepted_name),
    acceptanceMethod: text(row.acceptance_method),
  };
  return artifact.id ? artifact : null;
}

async function responseError(response: Response) {
  const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
  return payload?.error || `Project document request failed (${response.status}).`;
}

async function authenticatedFetch(url: string, init: RequestInit) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let token = data.session?.access_token;
  if (!token) throw new Error("Session expired. Please sign in again.");

  const run = (accessToken: string) => fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  let response = await run(token);
  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    token = refreshed.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");
    response = await run(token);
  }
  return response;
}

export async function ensureAcceptedProjectProposalArtifact(input: {
  projectId: string;
  proposalId: string;
  revisionId: string;
}): Promise<ProjectProposalArtifact> {
  const response = await authenticatedFetch(
    `/api/admin/projects/${encodeURIComponent(input.projectId)}/proposals/${encodeURIComponent(input.proposalId)}/revisions/${encodeURIComponent(input.revisionId)}/accepted-artifact`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await responseError(response));
  const payload = await response.json() as { artifact?: unknown };
  const artifact = mapArtifact(payload.artifact);
  if (!artifact) throw new Error("Accepted Proposal snapshot response was invalid.");
  return artifact;
}

export async function getProjectProposalArtifacts(projectId: string): Promise<ProjectProposalArtifact[]> {
  const { data, error } = await supabase.rpc("get_project_proposal_artifacts", { p_project_id: projectId });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map(mapArtifact).filter((artifact): artifact is ProjectProposalArtifact => Boolean(artifact));
}

export async function downloadProjectProposalArtifact(input: {
  projectId: string;
  artifactId: string;
}): Promise<Blob> {
  const response = await authenticatedFetch(
    `/api/admin/projects/${encodeURIComponent(input.projectId)}/documents/${encodeURIComponent(input.artifactId)}/download`,
    { method: "GET" },
  );
  if (!response.ok) throw new Error(await responseError(response));
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error("Stored Proposal document response was invalid.");
  }
  return response.blob();
}
