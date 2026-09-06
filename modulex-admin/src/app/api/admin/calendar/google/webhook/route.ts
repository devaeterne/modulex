import { timingSafeEqual } from "node:crypto";
import { syncCompanyCalendarFromGoogle } from "@/lib/google-calendar/bidirectional-sync";
import {
  enqueueCalendarSyncJob,
  getCompanyCalendarBinding,
  getWatchChannel,
  insertCalendarSyncAudit,
  markWatchMessage,
} from "@/lib/google-calendar/v3-repository";
import { hashGoogleWatchToken } from "@/lib/google-calendar/watch-channels";
import { withApiTiming } from "@/lib/observability/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeHashEqual(expectedHex: string, actualHex: string) {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function handlePost(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id")?.trim() ?? "";
  const channelToken = request.headers.get("x-goog-channel-token") ?? "";
  const resourceId = request.headers.get("x-goog-resource-id")?.trim() ?? "";
  const resourceState = request.headers.get("x-goog-resource-state")?.trim() ?? "";
  const messageNumberRaw = request.headers.get("x-goog-message-number")?.trim() ?? "";
  const messageNumber = Number(messageNumberRaw);

  if (!channelId || !channelToken || !resourceId || !Number.isSafeInteger(messageNumber) || messageNumber < 0) {
    return new Response(null, { status: 400 });
  }

  const channel = await getWatchChannel(channelId);
  if (!channel || (channel.status !== "pending" && channel.status !== "active")) {
    return new Response(null, { status: 404 });
  }
  if (channel.expires_at && new Date(channel.expires_at).getTime() <= Date.now()) {
    return new Response(null, { status: 410 });
  }
  if (channel.resource_id && channel.resource_id !== resourceId) {
    return new Response(null, { status: 403 });
  }
  if (!safeHashEqual(channel.channel_token_hash, hashGoogleWatchToken(channelToken))) {
    return new Response(null, { status: 403 });
  }
  if (channel.last_message_number != null && messageNumber <= channel.last_message_number) {
    return new Response(null, { status: 204 });
  }

  const binding = await getCompanyCalendarBinding();
  if (!binding || binding.id !== channel.provider_binding_id) {
    return new Response(null, { status: 409 });
  }

  await markWatchMessage(channelId, messageNumber);
  await enqueueCalendarSyncJob({
    bindingId: binding.id,
    jobType: "incremental",
    dedupeKey: "google-watch",
    payload: { channel_id: channelId, resource_id: resourceId, resource_state: resourceState, message_number: messageNumber },
  });

  try {
    await syncCompanyCalendarFromGoogle("watch", request.url);
    await insertCalendarSyncAudit({
      bindingId: binding.id,
      direction: "system",
      action: "watch_notification",
      resolution: "synced",
      details: { channelId, resourceId, resourceState, messageNumber },
    });
  } catch (error) {
    await insertCalendarSyncAudit({
      bindingId: binding.id,
      direction: "system",
      action: "watch_notification",
      resolution: "queued_for_reconcile",
      details: {
        channelId,
        resourceId,
        resourceState,
        messageNumber,
        error: error instanceof Error ? error.message.slice(0, 160) : "google_sync_failed",
      },
    });
  }

  return new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/admin/calendar/google/webhook", method: "POST" },
    () => handlePost(request),
  );
}
