import "server-only";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";

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

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
};

export type GoogleCalendarEventResource = GoogleCalendarEventInput & {
  id: string;
  htmlLink?: string;
  status?: string;
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
