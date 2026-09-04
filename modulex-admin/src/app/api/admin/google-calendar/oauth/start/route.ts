import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";
import {
  createGoogleAuthorizationUrl,
  generateGoogleOAuthState,
  hashGoogleOAuthState,
} from "@/lib/google-calendar/google-oauth";
import { createCalendarOAuthState } from "@/lib/google-calendar/repository";
import { withApiTiming } from "@/lib/observability/apiTiming";

const OAUTH_COOKIE = "modulex_google_calendar_oauth_state";
const OAUTH_TTL_SECONDS = 600;

function oauthCookie(state: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${OAUTH_COOKIE}=${encodeURIComponent(state)}; Path=/api/admin/google-calendar/oauth/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "settings.manage");
  if (auth.response) return auth.response;
  if (!isGoogleCalendarConfigured()) {
    return jsonError("Google Calendar OAuth application is not configured.", 503);
  }

  const state = generateGoogleOAuthState();
  const stateHash = hashGoogleOAuthState(state);
  const expiresAt = new Date(Date.now() + OAUTH_TTL_SECONDS * 1000).toISOString();

  try {
    await createCalendarOAuthState({
      userId: auth.actor.user.id,
      stateHash,
      expiresAt,
    });
    const authorizationUrl = createGoogleAuthorizationUrl({
      state,
      requestUrl: request.url,
      loginHint: auth.actor.user.email,
    });
    const response = Response.json({ authorization_url: authorizationUrl });
    response.headers.append("Set-Cookie", oauthCookie(state, request));
    return response;
  } catch {
    return jsonError("Google Calendar authorization could not be started.", 500);
  }
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/oauth/start", method: "POST" },
    () => handlePost(request)
  );
}
