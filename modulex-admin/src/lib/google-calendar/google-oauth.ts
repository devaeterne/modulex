import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  GOOGLE_CALENDAR_SCOPES,
  getGoogleCalendarConfig,
} from "@/lib/google-calendar/config";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export class GoogleOAuthProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "GoogleOAuthProviderError";
  }
}

export type GoogleOAuthTokenSet = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string[];
  tokenType: string;
  idToken: string | null;
};

export type GoogleUserInfo = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
};

function providerCode(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeTokenResponse(data: Record<string, unknown>): GoogleOAuthTokenSet {
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) {
    throw new GoogleOAuthProviderError("Google did not return an access token.", "missing_access_token", 502);
  }

  return {
    accessToken,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : Number(data.expires_in ?? 0) || 0,
    refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
    scope: typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [],
    tokenType: typeof data.token_type === "string" ? data.token_type : "Bearer",
    idToken: typeof data.id_token === "string" ? data.id_token : null,
  };
}

export function generateGoogleOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGoogleOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function timingSafeOAuthStateEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function createGoogleAuthorizationUrl(input: {
  state: string;
  requestUrl?: string;
  loginHint?: string | null;
}): string {
  const config = getGoogleCalendarConfig(input.requestUrl);
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  if (input.loginHint?.trim()) url.searchParams.set("login_hint", input.loginHint.trim());
  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  requestUrl?: string;
}): Promise<GoogleOAuthTokenSet> {
  const config = getGoogleCalendarConfig(input.requestUrl);
  const body = new URLSearchParams({
    code: input.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new GoogleOAuthProviderError(
      "Google authorization code exchange failed.",
      providerCode(data.error, "token_exchange_failed"),
      response.status
    );
  }
  return normalizeTokenResponse(data);
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  requestUrl?: string;
}): Promise<GoogleOAuthTokenSet> {
  const config = getGoogleCalendarConfig(input.requestUrl);
  const body = new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new GoogleOAuthProviderError(
      "Google access token refresh failed.",
      providerCode(data.error, "token_refresh_failed"),
      response.status
    );
  }
  return normalizeTokenResponse(data);
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new GoogleOAuthProviderError(
      "Google account information could not be loaded.",
      providerCode(data.error, "userinfo_failed"),
      response.status
    );
  }

  const sub = typeof data.sub === "string" ? data.sub : "";
  if (!sub) {
    throw new GoogleOAuthProviderError("Google account identity is missing.", "userinfo_missing_sub", 502);
  }

  return {
    sub,
    email: typeof data.email === "string" ? data.email : null,
    emailVerified: data.email_verified === true,
  };
}

export async function revokeGoogleRefreshToken(refreshToken: string): Promise<boolean> {
  const response = await fetch(GOOGLE_REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    cache: "no-store",
  });
  return response.ok;
}
