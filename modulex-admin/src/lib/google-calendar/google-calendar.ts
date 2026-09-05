import "server-only";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const CALENDAR_LIST_API = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const CALENDAR_COLORS_API = "https://www.googleapis.com/calendar/v3/colors";

export class GoogleCalendarProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "GoogleCalendarProviderError";
  }
}

export type GoogleCalendarResource = {
  id: string;
  summary: string;
  timeZone?: string;
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

export type GoogleCalendarColor = {
  background?: string;
  foreground?: string;
};

export type GoogleCalendarEventDate = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  colorId?: string;
  start: GoogleCalendarEventDate;
  end: GoogleCalendarEventDate;
};

export type GoogleCalendarEventResource = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  colorId?: string;
  htmlLink?: string;
  status?: string;
  updated?: string;
  etag?: string;
};

export type GoogleCalendarEventPage = {
  items: GoogleCalendarEventResource[];
  nextSyncToken: string | null;
};

function resourceUrl(calendarId: string) {
  return `${CALENDAR_API_BASE}/${encodeURIComponent(calendarId)}`;
}

function eventUrl(calendarId: string, eventId?: string) {
  const base = `${resourceUrl(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

async function parseProviderBody(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
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
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });
  const data = await parseProviderBody(response);

  if (!response.ok) {
    throw new GoogleCalendarProviderError(
      "Google Calendar request failed.",
      providerErrorCode(data, response.status),
      response.status
    );
  }

  return data as T;
}

export async function listGoogleCalendars(input: {
  accessToken: string;
}): Promise<GoogleCalendarListEntry[]> {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(CALENDAR_LIST_API);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await googleCalendarRequest<{
      items?: GoogleCalendarListEntry[];
      nextPageToken?: string;
    }>({ accessToken: input.accessToken, url: url.toString() });
    calendars.push(...(page.items ?? []).filter((calendar) => !calendar.deleted));
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);

  return calendars;
}

export async function getGoogleCalendarEventColors(input: {
  accessToken: string;
}): Promise<Record<string, GoogleCalendarColor>> {
  const colors = await googleCalendarRequest<{ event?: Record<string, GoogleCalendarColor> }>({
    accessToken: input.accessToken,
    url: CALENDAR_COLORS_API,
  });
  return colors.event ?? {};
}

export async function createGoogleProjectCalendar(input: {
  accessToken: string;
  summary: string;
  timeZone: string;
}): Promise<GoogleCalendarResource> {
  return googleCalendarRequest<GoogleCalendarResource>({
    accessToken: input.accessToken,
    url: CALENDAR_API_BASE,
    method: "POST",
    body: {
      summary: input.summary,
      timeZone: input.timeZone,
    },
  });
}

export async function getGoogleProjectCalendar(input: {
  accessToken: string;
  calendarId: string;
}): Promise<GoogleCalendarResource> {
  return googleCalendarRequest<GoogleCalendarResource>({
    accessToken: input.accessToken,
    url: resourceUrl(input.calendarId),
  });
}

export async function renameGoogleProjectCalendar(input: {
  accessToken: string;
  calendarId: string;
  summary: string;
  timeZone: string;
}): Promise<GoogleCalendarResource> {
  return googleCalendarRequest<GoogleCalendarResource>({
    accessToken: input.accessToken,
    url: resourceUrl(input.calendarId),
    method: "PUT",
    body: {
      summary: input.summary,
      timeZone: input.timeZone,
    },
  });
}

export async function listGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  timeMin?: string | null;
  timeMax?: string | null;
}): Promise<GoogleCalendarEventPage> {
  const items: GoogleCalendarEventResource[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    const url = new URL(eventUrl(input.calendarId));
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("singleEvents", "true");
    if (input.syncToken) {
      url.searchParams.set("syncToken", input.syncToken);
    } else {
      if (input.timeMin) url.searchParams.set("timeMin", input.timeMin);
      if (input.timeMax) url.searchParams.set("timeMax", input.timeMax);
      url.searchParams.set("orderBy", "startTime");
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await googleCalendarRequest<{
      items?: GoogleCalendarEventResource[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>({ accessToken: input.accessToken, url: url.toString() });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? null;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { items, nextSyncToken };
}

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  event: GoogleCalendarEventInput;
}): Promise<GoogleCalendarEventResource> {
  return googleCalendarRequest<GoogleCalendarEventResource>({
    accessToken: input.accessToken,
    url: eventUrl(input.calendarId),
    method: "POST",
    body: input.event as unknown as Record<string, unknown>,
  });
}

export async function updateGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: GoogleCalendarEventInput;
}): Promise<GoogleCalendarEventResource> {
  return googleCalendarRequest<GoogleCalendarEventResource>({
    accessToken: input.accessToken,
    url: eventUrl(input.calendarId, input.eventId),
    method: "PUT",
    body: input.event as unknown as Record<string, unknown>,
  });
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  await googleCalendarRequest<Record<string, never>>({
    accessToken: input.accessToken,
    url: eventUrl(input.calendarId, input.eventId),
    method: "DELETE",
  });
}
