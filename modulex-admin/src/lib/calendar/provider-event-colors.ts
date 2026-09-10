import "server-only";

import type { AdminCalendarEvent } from "@/lib/calendar/event-normalization";
import { getConnectedGoogleAccessToken } from "@/lib/google-calendar/access";
import { getGoogleCalendarEventColors, type GoogleCalendarColor } from "@/lib/google-calendar/google-calendar";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const BUSINESS_SOURCE_TYPES = ["project_start", "project_target", "project_delivery", "installation"] as const;
const BUSINESS_SOURCE_TYPE_SET = new Set<string>(BUSINESS_SOURCE_TYPES);
export const GOOGLE_COLOR_CACHE_TTL_MS = 60 * 60 * 1000;
const GOOGLE_COLOR_FAILURE_CACHE_TTL_MS = 60 * 1000;

type GoogleColorPalette = Record<string, GoogleCalendarColor>;
type BusinessColorRow = {
  source_type: string;
  source_id: string;
  provider_color_id: string | null;
};

type ColorCache = {
  expiresAt: number;
  palette: GoogleColorPalette;
};

let colorCache: ColorCache | null = null;
let colorLoadPromise: Promise<GoogleColorPalette> | null = null;

function sourceKey(sourceType: string, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

async function loadGoogleEventColorPalette(): Promise<GoogleColorPalette> {
  const now = Date.now();
  if (colorCache && colorCache.expiresAt > now) return colorCache.palette;
  if (colorLoadPromise) return colorLoadPromise;

  colorLoadPromise = (async () => {
    try {
      const { accessToken } = await getConnectedGoogleAccessToken();
      const palette = await getGoogleCalendarEventColors({ accessToken });
      colorCache = { expiresAt: Date.now() + GOOGLE_COLOR_CACHE_TTL_MS, palette };
      return palette;
    } catch {
      // Calendar rendering must remain usable if Google token refresh or colors.get is unavailable.
      colorCache = { expiresAt: Date.now() + GOOGLE_COLOR_FAILURE_CACHE_TTL_MS, palette: {} };
      return {};
    } finally {
      colorLoadPromise = null;
    }
  })();

  return colorLoadPromise;
}

async function loadBusinessProviderColorIds(events: AdminCalendarEvent[]) {
  const businessEvents = events.filter((event) => BUSINESS_SOURCE_TYPE_SET.has(event.source_type));
  if (!businessEvents.length) return new Map<string, string>();

  const sourceIds = [...new Set(businessEvents.map((event) => event.source_id))];
  const { data, error } = await supabaseAdmin
    .from("calendar_business_event_extensions")
    .select("source_type,source_id,provider_color_id")
    .in("source_type", [...BUSINESS_SOURCE_TYPES])
    .in("source_id", sourceIds);

  if (error) return new Map<string, string>();

  return new Map(
    ((data ?? []) as BusinessColorRow[])
      .filter((row): row is BusinessColorRow & { provider_color_id: string } => Boolean(row.provider_color_id))
      .map((row) => [sourceKey(row.source_type, row.source_id), row.provider_color_id]),
  );
}

export async function decorateGoogleCalendarEventColors(events: AdminCalendarEvent[]): Promise<AdminCalendarEvent[]> {
  if (!events.length) return events;

  const businessColorIds = await loadBusinessProviderColorIds(events);
  const enrichedEvents = businessColorIds.size
    ? events.map((event) => {
        const providerColorId = businessColorIds.get(sourceKey(event.source_type, event.source_id));
        return providerColorId ? { ...event, provider_color_id: providerColorId } : event;
      })
    : events;

  if (!enrichedEvents.some((event) => Boolean(event.provider_color_id))) return enrichedEvents;

  const palette = await loadGoogleEventColorPalette();
  if (!Object.keys(palette).length) return enrichedEvents;

  return enrichedEvents.map((event) => {
    const providerColor = event.provider_color_id ? palette[event.provider_color_id] : undefined;
    if (!providerColor) return event;
    return {
      ...event,
      background_color: providerColor.background || event.background_color,
      foreground_color: providerColor.foreground || event.foreground_color,
    };
  });
}
