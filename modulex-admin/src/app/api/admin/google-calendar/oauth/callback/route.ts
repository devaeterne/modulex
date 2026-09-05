import { GOOGLE_CALENDAR_SCOPES, getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { encryptRefreshToken } from "@/lib/google-calendar/crypto";
import {
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  hashGoogleOAuthState,
  timingSafeOAuthStateEqual,
} from "@/lib/google-calendar/google-oauth";
import {
  consumeCalendarOAuthState,
  saveConnectedGoogleCredential,
} from "@/lib/google-calendar/repository";
import { withApiTiming } from "@/lib/observability/apiTiming";

const OAUTH_COOKIE = "modulex_google_calendar_oauth_state";

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function settingsUrl(request: Request, result: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  const origin = configured || new URL(request.url).origin;
  const url = new URL("/settings/integrations/google-calendar", origin);
  url.searchParams.set("calendar", result);
  return url;
}

function redirectResult(request: Request, result: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      Location: settingsUrl(request, result).toString(),
      "Set-Cookie": `${OAUTH_COOKIE}=; Path=/api/admin/google-calendar/oauth/callback; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    },
  });
}

async function handleGet(request: Request) {
  const url = new URL(request.url);
  const queryState = url.searchParams.get("state") ?? "";
  const cookieState = readCookie(request, OAUTH_COOKIE) ?? "";

  if (!timingSafeOAuthStateEqual(queryState, cookieState)) {
    return redirectResult(request, "invalid_state");
  }

  let consumed: { userId: string } | null = null;
  try {
    consumed = await consumeCalendarOAuthState({ stateHash: hashGoogleOAuthState(queryState) });
  } catch {
    return redirectResult(request, "invalid_state");
  }
  if (!consumed) return redirectResult(request, "invalid_state");

  if (url.searchParams.get("error")) {
    return redirectResult(request, "consent_denied");
  }

  const code = url.searchParams.get("code") ?? "";
  if (!code) return redirectResult(request, "missing_code");

  try {
    const tokenSet = await exchangeGoogleAuthorizationCode({ code, requestUrl: request.url });
    if (!tokenSet.refreshToken) {
      return redirectResult(request, "missing_refresh_token");
    }

    const userInfo = await fetchGoogleUserInfo(tokenSet.accessToken);
    const config = getGoogleCalendarConfig(request.url);
    const encryptedRefreshToken = encryptRefreshToken(tokenSet.refreshToken, config.encryptionKey);

    await saveConnectedGoogleCredential({
      providerAccountId: userInfo.sub,
      providerAccountEmail: userInfo.email,
      encryptedRefreshToken,
      grantedScopes: tokenSet.scope.length ? tokenSet.scope : [...GOOGLE_CALENDAR_SCOPES],
      connectedBy: consumed.userId,
    });

    return redirectResult(request, "connected");
  } catch {
    return redirectResult(request, "oauth_failed");
  }
}

export async function GET(request: Request) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/oauth/callback", method: "GET" },
    () => handleGet(request)
  );
}
