import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { ProjectCalendarError, resyncProjectCalendar } from "@/lib/google-calendar/project-calendar";
import { withApiTiming } from "@/lib/observability/apiTiming";

type RouteContext = { params: Promise<{ projectId: string }> };

async function handlePost(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.manage");
  if (auth.response) return auth.response;
  const { projectId } = await context.params;
  try {
    return Response.json(await resyncProjectCalendar(projectId, auth.actor.user.id, request.url));
  } catch (error) {
    if (error instanceof ProjectCalendarError) {
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return jsonError(error instanceof Error ? error.message : "Project Calendar resync failed.", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/projects/[projectId]/resync", method: "POST" },
    () => handlePost(request, context)
  );
}
