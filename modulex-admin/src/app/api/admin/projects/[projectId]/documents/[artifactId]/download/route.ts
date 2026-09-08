import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  PROJECT_PROPOSAL_ARTIFACT_BUCKET,
  createProjectProposalArtifactUserClient,
  getProjectProposalArtifactServer,
  sha256Hex,
} from "@/lib/customers/project-proposal-artifact-server";
import { withApiTiming } from "@/lib/observability/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/projects/[projectId]/documents/[artifactId]/download";

type RouteContext = {
  params: Promise<{ projectId: string; artifactId: string }>;
};

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function handleGet(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.view");
  if (auth.response) return auth.response;

  const token = accessToken(request);
  if (!token) return jsonError("Authentication required.", 401);

  const { projectId, artifactId } = await context.params;
  if (!projectId || !artifactId) return jsonError("Project and document are required.", 400);

  try {
    const artifact = await getProjectProposalArtifactServer({
      accessToken: token,
      projectId,
      artifactId,
    });
    if (!artifact || artifact.projectId !== projectId) {
      return jsonError("Project document not found.", 404);
    }
    if (artifact.storageBucket !== PROJECT_PROPOSAL_ARTIFACT_BUCKET) {
      return jsonError("Project document storage identity is invalid.", 422);
    }

    const supabase = createProjectProposalArtifactUserClient(token);
    const { data: blob, error } = await supabase.storage
      .from(PROJECT_PROPOSAL_ARTIFACT_BUCKET)
      .download(artifact.storagePath);
    if (error || !blob) return jsonError("Stored Project document could not be read.", 404);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256Hex(bytes) !== artifact.contentSha256) {
      return jsonError("Stored Project document failed immutable SHA-256 verification.", 409);
    }

    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? "");
    if (/permission|forbidden/i.test(detail)) return jsonError("Project document access is not permitted.", 403);
    console.error("Stored Proposal artifact download failed", error);
    return jsonError("Stored Project document could not be downloaded.", 500);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return withApiTiming({ route: ROUTE, method: "GET" }, () => handleGet(request, context));
}
