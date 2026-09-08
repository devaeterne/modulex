import { supabase } from "@/lib/supabase/client";

export type ProjectProposalPdfRequest = {
  projectId: string;
  proposalId: string;
  revisionId: string;
  download?: boolean;
};

function pdfUrl(input: ProjectProposalPdfRequest) {
  const projectId = encodeURIComponent(input.projectId);
  const proposalId = encodeURIComponent(input.proposalId);
  const revisionId = encodeURIComponent(input.revisionId);
  const query = input.download ? "?download=1" : "";
  return `/api/admin/projects/${projectId}/proposals/${proposalId}/revisions/${revisionId}/pdf${query}`;
}

async function requestPdf(url: string, token: string) {
  return fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

async function responseError(response: Response) {
  const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
  return payload?.error || `Proposal PDF request failed (${response.status}).`;
}

export async function fetchProjectProposalPdf(input: ProjectProposalPdfRequest): Promise<Blob> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let token = data.session?.access_token;
  if (!token) throw new Error("Session expired. Please sign in again.");

  const url = pdfUrl(input);
  let response = await requestPdf(url, token);

  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    token = refreshed.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");
    response = await requestPdf(url, token);
  }

  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error("Proposal PDF response was invalid.");
  }
  return response.blob();
}
