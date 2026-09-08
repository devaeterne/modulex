import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { persistAcceptedProjectProposalArtifact } from "@/lib/customers/project-proposal-artifact-server";
import { withApiTiming } from "@/lib/observability/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/accepted-artifact";

type RouteContext = {
  params: Promise<{
    projectId: string;
    proposalId: string;
    revisionId: string;
  }>;
};

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

async function handlePost(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.manage");
  if (auth.response) return auth.response;

  const token = accessToken(request);
  if (!token) return jsonError("Authentication required.", 401);

  const { projectId, proposalId, revisionId } = await context.params;
  if (!projectId || !proposalId || !revisionId) {
    return jsonError("Project, Proposal, and Revision are required.", 400);
  }

  try {
    const artifact = await persistAcceptedProjectProposalArtifact({
      accessToken: token,
      projectId,
      proposalId,
      revisionId,
    });
    return Response.json({ artifact }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const detail = message(error);
    if (/PROJECT_PDF_PROJECT_UNAVAILABLE/.test(detail)) return jsonError("Project not found.", 404);
    if (/PROJECT_PDF_PROPOSAL_UNAVAILABLE/.test(detail)) return jsonError("Proposal not found.", 404);
    if (/PROJECT_PDF_REVISION_UNAVAILABLE/.test(detail)) return jsonError("Proposal revision not found.", 404);
    if (/NOT_ACCEPTED|Only the exact accepted Proposal Revision/i.test(detail)) {
      return jsonError("Only the exact accepted Proposal Revision can be persisted.", 409);
    }
    if (/STORAGE_CONFLICT|immutable request|metadata does not match/i.test(detail)) {
      return jsonError("Accepted Proposal snapshot conflicts with an existing immutable artifact.", 409);
    }
    if (/IDENTITY_MISMATCH|does not match Project|does not belong/i.test(detail)) {
      return jsonError("Accepted Proposal snapshot identity is invalid.", 422);
    }
    if (/permission|forbidden/i.test(detail)) {
      return jsonError("Accepted Proposal snapshot persistence is not permitted.", 403);
    }
    console.error("Accepted Proposal artifact persistence failed", error);
    return jsonError("Proposal was accepted, but its immutable PDF snapshot could not be persisted. Retry the snapshot action.", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  return withApiTiming({ route: ROUTE, method: "POST" }, () => handlePost(request, context));
}
