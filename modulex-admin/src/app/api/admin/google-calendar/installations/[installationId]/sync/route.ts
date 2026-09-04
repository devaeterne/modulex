import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  resolveInstallationProjectId,
  syncInstallationToGoogle,
} from "@/lib/google-calendar/installation-projection";
import { withApiTiming } from "@/lib/observability/apiTiming";

type RouteContext = { params: Promise<{ installationId: string }> };

async function handlePost(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.manage");
  if (auth.response) return auth.response;
  const { installationId } = await context.params;

  try {
    await resolveInstallationProjectId(installationId);
    const result = await syncInstallationToGoogle(installationId, auth.actor.user.id, request.url);
    return Response.json(result, { status: result.ok ? 200 : 202 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Installation Calendar sync failed.", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/installations/[installationId]/sync", method: "POST" },
    () => handlePost(request, context)
  );
}
