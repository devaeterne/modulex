import "server-only";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const CALENDAR_LIST_API = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const CALENDAR_COLORS_API = "https://www.googleapis.com/calendar/v3/colors";
const CHANNELS_STOP_API = "https://www.googleapis.com/calendar/v3/channels/stop";

export class GoogleCalendarProviderError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = "GoogleCalendarProviderError";
  }
}

export type GoogleCalendarResource = {
  id: string;
  summary: string;
  timeZone?: string;
  conferenceProperties?: { allowedConferenceSolutionTypes?: string[] };
};

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  timeZone?: string;
  accessRole?: string;
  dataOwner?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  colorId?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
};

export type GoogleCalendarColor = { background?: string; foreground?: string };
export type GoogleCalendarEventDate = { dateTime?: string; date?: string; timeZone?: string };
export type GoogleCalendarAttendee = { email?: string; displayName?: string; responseStatus?: string; optional?: boolean; organizer?: boolean; self?: boolean };
export type GoogleCalendarReminders = { useDefault?: boolean; overrides?: Array<{ method?: string; minutes?: number }> };
export type GoogleCalendarConferenceData = Record<string, unknown>;
export type GoogleCalendarExtendedProperties = { private?: Record<string, string>; shared?: Record<string, string> };

export type GoogleCalendarEventInput = {
  summary?: string;
  description?: string | null;
  location?: string | null;
  colorId?: string | null;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  recurrence?: string[];
  attendees?: GoogleCalendarAttendee[];
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  reminders?: GoogleCalendarReminders | null;
  conferenceData?: GoogleCalendarConferenceData | null;
  visibility?: string | null;
  transparency?: string | null;
  extendedProperties?: GoogleCalendarExtendedProperties;
  status?: string;
};

export type GoogleCalendarEventResource = GoogleCalendarEventInput & {
  id: string;
  htmlLink?: string;
  status?: string;
  updated?: string;
  etag?: string;
  eventType?: string;
  recurringEventId?: string;
  originalStartTime?: GoogleCalendarEventDate;
  organizer?: Record<string, unknown>;
  creator?: Record<string, unknown>;
};

export type GoogleCalendarEventPage = { items: GoogleCalendarEventResource[]; nextSyncToken: string | null };
export type GoogleCalendarEventBatchPage = GoogleCalendarEventPage & { nextPageToken: string | null };
export type GoogleCalendarWatchChannel = {
  id: string;
  resourceId?: string;
  resourceUri?: string;
  expiration?: string;
  token?: string;
};

function resourceUrl(calendarId: string) { return `${CALENDAR_API_BASE}/${encodeURIComponent(calendarId)}`; }
function eventUrl(calendarId: string, eventId?: string) {
  const base = `${resourceUrl(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

async function parseProviderBody(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  try { return await response.json() as Record<string, unknown>; } catch { return {}; }
}

function providerErrorCode(body: Record<string, unknown>, status: number) {
  const error = body.error;
  if (error && typeof error === "object") {
    const code = (error as Record<string, unknown>).status;
    if (typeof code === "string" && code) return code.toLowerCase();
  }
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 410) return "sync_token_gone";
  if (status === 429) return "quota_exceeded";
  if (status >= 500) return "provider_unavailable";
  return `google_calendar_http_${status}`;
}

async function googleCalendarRequest<T>(input: {
  accessToken: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: { authorization: `Bearer ${input.accessToken}`, ...(input.body ? { "content-type": "application/json" } : {}) },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });
  const data = await parseProviderBody(response);
  if (!response.ok) throw new GoogleCalendarProviderError("Google Calendar request failed.", providerErrorCode(data, response.status), response.status);
  return data as T;
}

export async function listGoogleCalendars(input: { accessToken: string }): Promise<GoogleCalendarListEntry[]> {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | null = null;
  do {
    const url = new URL(CALENDAR_LIST_API);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await googleCalendarRequest<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>({ accessToken: input.accessToken, url: url.toString() });
    calendars.push(...(page.items ?? []).filter((calendar) => !calendar.deleted));
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);
  return calendars;
}

export async function getGoogleCalendarEventColors(input: { accessToken: string }): Promise<Record<string, GoogleCalendarColor>> {
  const colors = await googleCalendarRequest<{ event?: Record<string, GoogleCalendarColor> }>({ accessToken: input.accessToken, url: CALENDAR_COLORS_API });
  return colors.event ?? {};
}

export async function createGoogleProjectCalendar(input: { accessToken: string; summary: string; timeZone: string }): Promise<GoogleCalendarResource> {
  return googleCalendarRequest({ accessToken: input.accessToken, url: CALENDAR_API_BASE, method: "POST", body: { summary: input.summary, timeZone: input.timeZone } });
}

export async function getGoogleProjectCalendar(input: { accessToken: string; calendarId: string }): Promise<GoogleCalendarResource> {
  return googleCalendarRequest({ accessToken: input.accessToken, url: resourceUrl(input.calendarId) });
}

export async function renameGoogleProjectCalendar(input: { accessToken: string; calendarId: string; summary: string; timeZone: string }): Promise<GoogleCalendarResource> {
  return googleCalendarRequest({ accessToken: input.accessToken, url: resourceUrl(input.calendarId), method: "PUT", body: { summary: input.summary, timeZone: input.timeZone } });
}

export async function getGoogleCalendarEvent(input: { accessToken: string; calendarId: string; eventId: string }): Promise<GoogleCalendarEventResource> {
  return googleCalendarRequest({ accessToken: input.accessToken, url: eventUrl(input.calendarId, input.eventId) });
}

export async function listGoogleCalendarEventPage(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  pageToken?: string | null;
  maxResults?: number;
  timeMin?: string | null;
  timeMax?: string | null;
  singleEvents?: boolean;
}): Promise<GoogleCalendarEventBatchPage> {
  const singleEvents = input.singleEvents ?? true;
  const maxResults = Math.min(2500, Math.max(1, Math.trunc(input.maxResults ?? 2500)));
  const url = new URL(eventUrl(input.calendarId));
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("showDeleted", "true");
  url.searchParams.set("singleEvents", String(singleEvents));
  if (input.syncToken) {
    url.searchParams.set("syncToken", input.syncToken);
  } else {
    if (input.timeMin) url.searchParams.set("timeMin", input.timeMin);
    if (input.timeMax) url.searchParams.set("timeMax", input.timeMax);
    if (singleEvents) url.searchParams.set("orderBy", "startTime");
  }
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  const page = await googleCalendarRequest<{ items?: GoogleCalendarEventResource[]; nextPageToken?: string; nextSyncToken?: string }>({
    accessToken: input.accessToken,
    url: url.toString(),
  });
  return {
    items: page.items ?? [],
    nextPageToken: page.nextPageToken ?? null,
    nextSyncToken: page.nextSyncToken ?? null,
  };
}

export async function listGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  timeMin?: string | null;
  timeMax?: string | null;
  singleEvents?: boolean;
}): Promise<GoogleCalendarEventPage> {
  const items: GoogleCalendarEventResource[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  do {
    const page = await listGoogleCalendarEventPage({
      ...input,
      pageToken,
      maxResults: 2500,
    });
    items.push(...page.items);
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

function mutationUrl(calendarId: string, eventId?: string, input?: { conferenceDataVersion?: number; sendUpdates?: "all" | "externalOnly" | "none" }) {
  const url = new URL(eventUrl(calendarId, eventId));
  if (input?.conferenceDataVersion) url.searchParams.set("conferenceDataVersion", String(input.conferenceDataVersion));
  if (input?.sendUpdates) url.searchParams.set("sendUpdates", input.sendUpdates);
  return url.toString();
}

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  event: GoogleCalendarEventInput;
  conferenceDataVersion?: number;
  sendUpdates?: "all" | "externalOnly" | "none";
}): Promise<GoogleCalendarEventResource> {
  return googleCalendarRequest({
    accessToken: input.accessToken,
    url: mutationUrl(input.calendarId, undefined, input),
    method: "POST",
    body: input.event as Record<string, unknown>,
  });
}

export async function patchGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: GoogleCalendarEventInput;
  conferenceDataVersion?: number;
  sendUpdates?: "all" | "externalOnly" | "none";
}): Promise<GoogleCalendarEventResource> {
  return googleCalendarRequest({
    accessToken: input.accessToken,
    url: mutationUrl(input.calendarId, input.eventId, input),
    method: "PATCH",
    body: input.event as Record<string, unknown>,
  });
}

export async function updateGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: GoogleCalendarEventInput;
}): Promise<GoogleCalendarEventResource> {
  return googleCalendarRequest({ accessToken: input.accessToken, url: eventUrl(input.calendarId, input.eventId), method: "PUT", body: input.event as Record<string, unknown> });
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}): Promise<void> {
  await googleCalendarRequest<Record<string, never>>({ accessToken: input.accessToken, url: mutationUrl(input.calendarId, input.eventId, { sendUpdates: input.sendUpdates }), method: "DELETE" });
}

export async function watchGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  channelId: string;
  webhookUrl: string;
  channelToken: string;
  expirationMs?: number;
}): Promise<GoogleCalendarWatchChannel> {
  const url = `${eventUrl(input.calendarId)}/watch`;
  return googleCalendarRequest({
    accessToken: input.accessToken,
    url,
    method: "POST",
    body: {
      id: input.channelId,
      type: "web_hook",
      address: input.webhookUrl,
      token: input.channelToken,
      ...(input.expirationMs ? { expiration: String(input.expirationMs) } : {}),
    },
  });
}

export async function stopGoogleCalendarWatchChannel(input: { accessToken: string; channelId: string; resourceId: string }): Promise<void> {
  await googleCalendarRequest<Record<string, never>>({
    accessToken: input.accessToken,
    url: CHANNELS_STOP_API,
    method: "POST",
    body: { id: input.channelId, resourceId: input.resourceId },
  });
}
