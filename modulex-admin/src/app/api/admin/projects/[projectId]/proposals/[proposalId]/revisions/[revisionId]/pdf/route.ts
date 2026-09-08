import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { buildProjectProposalPdfProjection } from "@/lib/customers/project-proposal-pdf-projection";
import { getProjectProposalPdfSource } from "@/lib/customers/project-proposal-server-read";
import { renderProjectProposalPdf } from "@/lib/documents/proposal-pdf-server";
import { withApiTiming } from "@/lib/observability/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/projects/[projectId]/proposals/[proposalId]/revisions/[revisionId]/pdf";

type RouteContext = {
  params: Promise<{
    projectId: string;
    proposalId: string;
    revisionId: string;
  }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

async function handleGet(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.view");
  if (auth.response) return auth.response;

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) return jsonError("Authentication required.", 401);

  const { projectId, proposalId, revisionId } = await context.params;
  if (!projectId || !proposalId || !revisionId) {
    return jsonError("Project, Proposal, and Revision are required.", 400);
  }

  try {
    const source = await getProjectProposalPdfSource({
      accessToken,
      projectId,
      proposalId,
      revisionId,
    });
    const { project, proposal, settings } = source;

    if (project.id !== projectId) {
      return jsonError("Project not found.", 404);
    }
    if (proposal.projectId !== projectId || proposal.id !== proposalId) {
      return jsonError("Proposal not found.", 404);
    }

    const revision = proposal.revisions.find((revision) => revision.id === revisionId);
    if (!revision) {
      return jsonError("Proposal revision not found.", 404);
    }

    const projection = buildProjectProposalPdfProjection({
      project,
      proposal,
      revision,
      settings,
    });
    const bytes = await renderProjectProposalPdf(projection);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${projection.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes("PROJECT_PDF_PROJECT_UNAVAILABLE")) {
      return jsonError("Project not found.", 404);
    }
    if (message.includes("PROJECT_PDF_PROPOSAL_UNAVAILABLE")) {
      return jsonError("Proposal not found.", 404);
    }
    if (message.includes("PROJECT_PDF_REVISION_UNAVAILABLE")) {
      return jsonError("Proposal revision not found.", 404);
    }
    if (/permission|forbidden/i.test(message)) {
      return jsonError("Proposal PDF access is not permitted.", 403);
    }
    if (/does not belong/i.test(message)) {
      return jsonError("Proposal PDF source is invalid.", 422);
    }
    console.error("Proposal PDF generation failed", error);
    return jsonError("Proposal PDF could not be generated.", 500);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return withApiTiming({ route: ROUTE, method: "GET" }, () => handleGet(request, context));
}
