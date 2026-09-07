import "server-only";

import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import {
  applyGoogleEventChange,
  PROVIDER_SYNC_PAGE_SIZE,
  syncCompanyCalendarFromGooglePage,
  type ProviderSyncPageResult,
  type SyncResult,
} from "@/lib/google-calendar/bidirectional-sync";
import {
  GoogleCalendarProviderError,
  listGoogleCalendarEventPage,
} from "@/lib/google-calendar/google-calendar";
import {
  getCompanyCalendarBinding,
  insertCalendarSyncAudit,
} from "@/lib/google-calendar/v3-repository";

export type CalendarBootstrapRange = { start: string; end: string };
export type CurrentFirstProviderSyncPageResult = ProviderSyncPageResult & {
  phase: "recent" | "history" | "incremental";
};

type FullSyncContinuation = {
  phase: "recent" | "history";
  pageToken: string | null;
  bootstrapRange?: CalendarBootstrapRange;
};

const CONTINUATION_PREFIX = "modulex-calendar-current-first-v1.";

function providerErrorCode(error: unknown) {
  if (error instanceof GoogleCalendarProviderError) return error.code;
  return error instanceof Error && error.message ? error.message.slice(0, 120) : "calendar_sync_failed";
}

function encodeContinuation(value: FullSyncContinuation) {
  return `${CONTINUATION_PREFIX}${Buffer.from(JSON.stringify(value), "utf8").toString("base64url")}`;
}

function decodeContinuation(token: string | null | undefined): FullSyncContinuation | null {
  if (!token) return null;
  if (!token.startsWith(CONTINUATION_PREFIX)) {
    // Backward compatibility for a full-history page token issued by #359.
    return { phase: "history", pageToken: token };
  }

  try {
    const raw = token.slice(CONTINUATION_PREFIX.length);
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    if (value.phase !== "recent" && value.phase !== "history") throw new Error("invalid phase");
    if (value.pageToken !== null && typeof value.pageToken !== "string") throw new Error("invalid page token");
    const range = value.bootstrapRange;
    if (range !== undefined) {
      if (!range || typeof range !== "object") throw new Error("invalid bootstrap range");
      const record = range as Record<string, unknown>;
      if (typeof record.start !== "string" || typeof record.end !== "string") throw new Error("invalid bootstrap range");
      return {
        phase: value.phase,
        pageToken: value.pageToken as string | null,
        bootstrapRange: { start: record.start, end: record.end },
      };
    }
    return { phase: value.phase, pageToken: value.pageToken as string | null };
  } catch {
    throw new Error("Google Calendar sync continuation token is invalid.");
  }
}

async function applyBootstrapEvents(input: {
  bindingId: string;
  events: Parameters<typeof applyGoogleEventChange>[0][];
  requestUrl?: string;
}): Promise<SyncResult> {
  const total: SyncResult = {
    processed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    errors: 0,
    mode: "full",
  };

  for (const event of input.events) {
    try {
      const applied = await applyGoogleEventChange(event, input.requestUrl);
      total.processed += applied.processed;
      total.created += applied.created;
      total.updated += applied.updated;
      total.deleted += applied.deleted;
      total.conflicts += applied.conflicts;
    } catch (error) {
      total.errors += 1;
      await insertCalendarSyncAudit({
        bindingId: input.bindingId,
        providerEventId: event.id,
        direction: "google_to_modulex",
        action: "apply_error",
        resolution: providerErrorCode(error),
      });
    }
  }

  if (total.errors > 0) throw new Error(`Google Calendar sync had ${total.errors} apply errors.`);
  return total;
}

export async function syncCompanyCalendarCurrentFirstPage(
  reason: "watch" | "manual" | "reconcile",
  requestUrl?: string,
  continuationToken?: string | null,
  bootstrapRange?: CalendarBootstrapRange | null,
): Promise<CurrentFirstProviderSyncPageResult> {
  const binding = await getCompanyCalendarBinding();
  if (!binding) throw new Error("Company Calendar is not configured.");

  if (binding.provider_sync_token) {
    const result = await syncCompanyCalendarFromGooglePage(reason, requestUrl, continuationToken);
    return {
      ...result,
      phase: result.mode === "incremental" ? "incremental" : "history",
    };
  }

  const continuation = decodeContinuation(continuationToken);
  const phase = continuation?.phase ?? (bootstrapRange ? "recent" : "history");

  if (phase === "recent") {
    const effectiveRange = continuation?.bootstrapRange ?? bootstrapRange;
    if (!effectiveRange) throw new Error("Google Calendar bootstrap range is missing.");

    const { accessToken } = await getConnectedGoogleAccessToken(requestUrl);
    const page = await listGoogleCalendarEventPage({
      accessToken,
      calendarId: binding.provider_calendar_id,
      pageToken: continuation?.pageToken ?? null,
      maxResults: PROVIDER_SYNC_PAGE_SIZE,
      timeMin: effectiveRange.start,
      timeMax: effectiveRange.end,
      singleEvents: true,
    });
    const total = await applyBootstrapEvents({ bindingId: binding.id, events: page.items, requestUrl });

    if (page.nextPageToken) {
      return {
        ...total,
        phase: "recent",
        complete: false,
        continuationToken: encodeContinuation({
          phase: "recent",
          pageToken: page.nextPageToken,
          bootstrapRange: effectiveRange,
        }),
      };
    }

    return {
      ...total,
      phase: "recent",
      complete: false,
      continuationToken: encodeContinuation({ phase: "history", pageToken: null }),
    };
  }

  const historyResult = await syncCompanyCalendarFromGooglePage(
    reason,
    requestUrl,
    continuation?.pageToken ?? null,
  );
  return {
    ...historyResult,
    phase: "history",
    continuationToken: historyResult.continuationToken
      ? encodeContinuation({ phase: "history", pageToken: historyResult.continuationToken })
      : null,
  };
}
