import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  discoverGoogleCalendars,
  GoogleCalendarImportError,
} from "@/lib/google-calendar/calendar-import";
import { withApiTiming } from "@/lib/observability/apiTiming";

async function handleGet(request: Request) {
  const auth = await requirePermission(request, "calendar.manage");
  if (auth.response) return auth.response;

  try {
    const calendars = await discoverGoogleCalendars(request.url);
    return Response.json({ calendars });
  } catch (error) {
    if (error instanceof GoogleCalendarImportError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Google Calendar discovery failed.", 502);
  }
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/discovery", method: "GET" },
    () => handleGet(request),
  );
}
