import "server-only";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  redirectUri: string;
};

function trimEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function decodeEncryptionKey(value: string): Buffer {
  if (!value) {
    throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function resolveRedirectUri(requestUrl?: string) {
  const configuredRedirect = trimEnv("GOOGLE_CALENDAR_REDIRECT_URI");
  if (configuredRedirect) return configuredRedirect;

  const configuredSite = trimEnv("NEXT_PUBLIC_SITE_URL");
  if (configuredSite) {
    return `${configuredSite.replace(/\/$/, "")}/api/admin/google-calendar/oauth/callback`;
  }

  if (requestUrl) {
    return `${new URL(requestUrl).origin}/api/admin/google-calendar/oauth/callback`;
  }

  throw new Error("Google Calendar redirect URI cannot be resolved.");
}

export function isGoogleCalendarConfigured() {
  const clientId = trimEnv("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = trimEnv("GOOGLE_CALENDAR_CLIENT_SECRET");
  const key = trimEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !clientSecret || !key) return false;
  try {
    return decodeEncryptionKey(key).length === 32;
  } catch {
    return false;
  }
}

export function getGoogleCalendarConfig(requestUrl?: string): GoogleCalendarConfig {
  const clientId = trimEnv("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = trimEnv("GOOGLE_CALENDAR_CLIENT_SECRET");

  if (!clientId) throw new Error("GOOGLE_CALENDAR_CLIENT_ID is not configured.");
  if (!clientSecret) throw new Error("GOOGLE_CALENDAR_CLIENT_SECRET is not configured.");

  return {
    clientId,
    clientSecret,
    encryptionKey: decodeEncryptionKey(trimEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY")),
    redirectUri: resolveRedirectUri(requestUrl),
  };
}
