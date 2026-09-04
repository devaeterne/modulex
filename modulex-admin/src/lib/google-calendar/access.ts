import "server-only";

import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { decryptRefreshToken } from "@/lib/google-calendar/crypto";
import {
  GoogleOAuthProviderError,
  refreshGoogleAccessToken,
} from "@/lib/google-calendar/google-oauth";
import {
  getGoogleCredential,
  markGoogleCredentialError,
  markGoogleCredentialSuccess,
} from "@/lib/google-calendar/repository";

export class GoogleCalendarAccessError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GoogleCalendarAccessError";
  }
}

export async function getConnectedGoogleAccessToken(requestUrl?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  accountEmail: string | null;
  grantedScopes: string[];
}> {
  const credential = await getGoogleCredential();
  if (!credential || credential.status !== "connected" || !credential.encrypted_refresh_token) {
    throw new GoogleCalendarAccessError("not_connected", "Google Calendar is not connected.");
  }

  const config = getGoogleCalendarConfig(requestUrl);
  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(credential.encrypted_refresh_token, config.encryptionKey);
  } catch {
    await markGoogleCredentialError("credential_decrypt_failed", true);
    throw new GoogleCalendarAccessError("reconnect_required", "Google Calendar must be reconnected.");
  }

  try {
    const token = await refreshGoogleAccessToken({ refreshToken, requestUrl });
    await markGoogleCredentialSuccess();
    return {
      accessToken: token.accessToken,
      refreshToken,
      accountEmail: credential.provider_account_email,
      grantedScopes: credential.granted_scopes ?? [],
    };
  } catch (error) {
    if (error instanceof GoogleOAuthProviderError && error.code === "invalid_grant") {
      await markGoogleCredentialError("invalid_grant", true);
      throw new GoogleCalendarAccessError("reconnect_required", "Google Calendar authorization has expired or been revoked.");
    }

    const code = error instanceof GoogleOAuthProviderError ? error.code : "token_refresh_failed";
    await markGoogleCredentialError(code, false);
    throw error;
  }
}
