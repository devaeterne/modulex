import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const BUSINESS_TYPES = new Set(["project_start", "project_target", "project_delivery", "installation"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(new Date(value).valueOf());
}

async function attemptProviderFlush(request: Request) {
  try {
    const sync = await flushCalendarOutboxBatch(20, request.url);
    return {
      provider_sync: sync.errors ? "error" as const : "synced" as const,
      provider_error_code: sync.errors ? "google_sync_pending" : null,
    };
  } catch {
    return { provider_sync: "pending" as const, provider_error_code: "google_sync_pending" };
  }
}

async function updateProjectMilestone(input: {
  sourceType: string;
  sourceId: string;
  deleted: boolean;
  allDayStart: string | null;
  actorUserId: string;
}) {
  const column = input.sourceType === "project_start"
    ? "start_date"
    : input.sourceType === "project_target"
      ? "target_date"
      : "planned_delivery_date";
  if (!input.deleted && !input.allDayStart) throw new Error("Project milestone requires an all-day date.");
  const { data, error } = await supabaseAdmin
    .from("customer_projects")
    .update({ [column]: input.deleted ? null : input.allDayStart, updated_by: input.actorUserId })
    .eq("id", input.sourceId)
    .select(`id,${column}`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project was not found.");
  return data;
}

async function updateInstallation(input: {
  sourceId: string;
  deleted: boolean;
  startAt: string | null;
  endAt: string | null;
  actorUserId: string;
}) {
  if (!input.deleted && !input.startAt) throw new Error("Installation requires a scheduled start time.");
  if (input.startAt && input.endAt && new Date(input.endAt) <= new Date(input.startAt)) {
    throw new Error("Installation end must be after start.");
  }
  const values = input.deleted
    ? { status: "cancelled", updated_by: input.actorUserId }
    : { scheduled_start_at: input.startAt, scheduled_end_at: input.endAt, updated_by: input.actorUserId };
  const { data, error } = await supabaseAdmin
    .from("customer_installations")
    .update(values)
    .eq("id", input.sourceId)
    .select("id,status,scheduled_start_at,scheduled_end_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Installation was not found.");
  return data;
}

async function handlePatch(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const sourceType = typeof body.source_type === "string" ? body.source_type.trim() : "";
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const deleted = body.deleted === true;
  if (!BUSINESS_TYPES.has(sourceType) || !UUID_PATTERN.test(sourceId)) {
    return jsonError("A valid business Calendar source is required.", 400);
  }

  try {
    let source: unknown;
    if (sourceType === "installation") {
      const startAt = deleted ? null : validDateTime(body.start) ? new Date(body.start).toISOString() : null;
      const endAt = deleted || body.end == null || body.end === ""
        ? null
        : validDateTime(body.end)
          ? new Date(body.end).toISOString()
          : null;
      if (!deleted && !startAt) return jsonError("Installation start time is invalid.", 400);
      if (!deleted && body.end && !endAt) return jsonError("Installation end time is invalid.", 400);
      source = await updateInstallation({ sourceId, deleted, startAt, endAt, actorUserId: auth.actor.user.id });
    } else {
      const allDayStart = deleted ? null : validDate(body.start) ? body.start : null;
      if (!deleted && !allDayStart) return jsonError("Project milestone date is invalid.", 400);
      source = await updateProjectMilestone({ sourceType, sourceId, deleted, allDayStart, actorUserId: auth.actor.user.id });
    }
    return Response.json({ source, ...(await attemptProviderFlush(request)) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Calendar business event could not be updated.", 400);
  }
}

export async function PATCH(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/business-events", method: "PATCH" },
    () => handlePatch(request),
  );
}
