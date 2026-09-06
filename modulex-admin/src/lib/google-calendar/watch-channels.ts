import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import { stopGoogleCalendarWatchChannel, watchGoogleCalendarEvents } from "@/lib/google-calendar/google-calendar";
import {
  activateWatchChannel,
  getCompanyCalendarBinding,
  insertCalendarSyncAudit,
  insertPendingWatchChannel,
  listActiveWatchChannels,
  stopWatchChannelRecord,
} from "@/lib/google-calendar/v3-repository";

const RENEW_BEFORE_MS = 48 * 60 * 60 * 1000;
const REQUESTED_TTL_MS = 6 * 24 * 60 * 60 * 1000;

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function webhookUrl(requestUrl?: string) {
  const configured = process.env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim();
  if (configured) return configured;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return `${site.replace(/\/$/, "")}/api/admin/calendar/google/webhook`;
  if (requestUrl) return `${new URL(requestUrl).origin}/api/admin/calendar/google/webhook`;
  throw new Error("Google Calendar webhook URL cannot be resolved.");
}

export type WatchState = {
  channelId: string;
  resourceId: string | null;
  expiresAt: string | null;
  status: string;
};

export async function ensureCompanyCalendarWatch(requestUrl?: string): Promise<WatchState> {
  const binding = await getCompanyCalendarBinding();
  if (!binding) throw new Error("Company Calendar is not configured.");
  const active = await listActiveWatchChannels(binding.id);
  const now = Date.now();
  const healthy = active.find((channel) => channel.status === "active" && channel.expires_at && new Date(channel.expires_at).getTime() - now > RENEW_BEFORE_MS);
  if (healthy) return { channelId: healthy.channel_id, resourceId: healthy.resource_id, expiresAt: healthy.expires_at, status: healthy.status };

  const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
  const channelId = randomUUID();
  const rawToken = randomBytes(32).toString("base64url");
  const requestedExpiration = Date.now() + REQUESTED_TTL_MS;
  await insertPendingWatchChannel({ bindingId: binding.id, channelId, tokenHash: tokenHash(rawToken), expiresAt: new Date(requestedExpiration).toISOString() });

  try {
    const created = await watchGoogleCalendarEvents({
      accessToken,
      calendarId: binding.provider_calendar_id,
      channelId,
      webhookUrl: webhookUrl(requestUrl),
      channelToken: rawToken,
      expirationMs: requestedExpiration,
    });
    if (!created.resourceId) throw new Error("Google Calendar watch did not return a resource id.");
    const expiresAt = created.expiration ? new Date(Number(created.expiration)).toISOString() : null;
    const activated = await activateWatchChannel({ channelId, resourceId: created.resourceId, resourceUri: created.resourceUri ?? null, expiresAt });

    for (const old of active.filter((item) => item.channel_id !== channelId && item.status === "active" && item.resource_id)) {
      try {
        await stopGoogleCalendarWatchChannel({ accessToken, channelId: old.channel_id, resourceId: old.resource_id! });
        await stopWatchChannelRecord(old.channel_id, "replaced");
      } catch {
        // Safe overlap is preferable to dropping notifications. Reconciliation will retry retirement.
      }
    }
    await insertCalendarSyncAudit({ bindingId: binding.id, direction: "system", action: "watch_activate", resolution: "active", details: { channelId, expiresAt } });
    return { channelId: activated.channel_id, resourceId: activated.resource_id, expiresAt: activated.expires_at, status: activated.status };
  } catch (error) {
    await stopWatchChannelRecord(channelId, "error");
    throw error;
  }
}

export async function renewExpiringCompanyCalendarWatch(now = new Date(), requestUrl?: string): Promise<WatchState> {
  const binding = await getCompanyCalendarBinding();
  if (!binding) throw new Error("Company Calendar is not configured.");
  const active = await listActiveWatchChannels(binding.id);
  const healthy = active.find((channel) => channel.status === "active" && channel.expires_at && new Date(channel.expires_at).getTime() - now.getTime() > RENEW_BEFORE_MS);
  if (healthy) return { channelId: healthy.channel_id, resourceId: healthy.resource_id, expiresAt: healthy.expires_at, status: healthy.status };
  return ensureCompanyCalendarWatch(requestUrl);
}

export function hashGoogleWatchToken(token: string) {
  return tokenHash(token);
}
