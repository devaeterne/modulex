import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { decryptRefreshToken } from "@/lib/google-calendar/crypto";
import { revokeGoogleRefreshToken } from "@/lib/google-calendar/google-oauth";
import { getGoogleCredential, retireGoogleCredential } from "@/lib/google-calendar/repository";
import { withApiTiming } from "@/lib/observability/apiTiming";

async function handleDelete(request: Request) {
  const auth = await requirePermission(request, "settings.manage");
  if (auth.response) return auth.response;

  try {
    const credential = await getGoogleCredential();
    let providerRevoked = false;

    if (credential?.encrypted_refresh_token) {
      try {
        const config = getGoogleCalendarConfig(request.url);
        const refreshToken = decryptRefreshToken(credential.encrypted_refresh_token, config.encryptionKey);
        providerRevoked = await revokeGoogleRefreshToken(refreshToken);
      } catch {
        providerRevoked = false;
      }
    }

    await retireGoogleCredential();
    return Response.json({ success: true, provider_revoked: providerRevoked });
  } catch {
    return jsonError("Google Calendar could not be disconnected.", 500);
  }
}

export async function DELETE(request: Request) {
  return withApiTiming(
    { route: "/api/admin/google-calendar/connection", method: "DELETE" },
    () => handleDelete(request)
  );
}
