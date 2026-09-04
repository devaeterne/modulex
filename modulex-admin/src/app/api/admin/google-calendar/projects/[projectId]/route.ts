import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  ensureProjectCalendar,
  getProjectCalendarStatus,
  ProjectCalendarError,
  renameProjectCalendar,
  setProjectCalendarSyncEnabled,
} from "@/lib/google-calendar/project-calendar";
import { withApiTiming } from "@/lib/observability/apiTiming";

type RouteContext = { params: Promise<{ projectId: string }> };

function projectCalendarError(error: unknown) {
  if (error instanceof ProjectCalendarError) {
    return Response.json({ error: error.message, code: error.code }, { status: 409 });
  }
  return jsonError(error instanceof Error ? error.message : "Project Calendar request failed.", 500);
}

async function handleGet(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.view");
  if (auth.response) return auth.response;
  const { projectId } = await context.params;
  try {
    return Response.json(await getProjectCalendarStatus(projectId));
  } catch (error) {
    return projectCalendarError(error);
  }
}

async function handlePost(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.manage");
  if (auth.response) return auth.response;
  const { projectId } = await context.params;
  try {
    await ensureProjectCalendar(projectId, auth.actor.user.id, request.url);
    return Response.json(await getProjectCalendarStatus(projectId));
  } catch (error) {
    return projectCalendarError(error);
  }
}

async function handlePatch(request: Request, context: RouteContext) {
  const auth = await requirePermission(request, "projects.manage");
  if (auth.response) return auth.response;
  const { projectId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  try {
    if (typeof body.provider_calendar_name === "string") {
      await renameProjectCalendar(projectId, body.provider_calendar_name, auth.actor.user.id, request.url);
    }
    if (typeof body.sync_enabled === "boolean") {
      await setProjectCalendarSyncEnabled(projectId, body.sync_enabled);
    }
    if (typeof body.provider_calendar_name !== "string" && typeof body.sync_enabled !== "boolean") {
      return jsonError("Calendar name or sync_enabled is required.", 400);
    }
    return Response.json(await getProjectCalendarStatus(projectId));
  } catch (error) {
    return projectCalendarError(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/projects/[projectId]", method: "GET" },
    () => handleGet(request, context)
  );
}

export async function POST(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/projects/[projectId]", method: "POST" },
    () => handlePost(request, context)
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/projects/[projectId]", method: "PATCH" },
    () => handlePatch(request, context)
  );
}
