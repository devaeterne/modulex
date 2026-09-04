export const CALENDAR_NAME_PLACEHOLDERS = [
  "project_no",
  "project_name",
  "customer_name",
] as const;

export type CalendarNamePlaceholder = (typeof CALENDAR_NAME_PLACEHOLDERS)[number];
export type CalendarNameValues = Record<CalendarNamePlaceholder, string>;

const PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;
const ALLOWED = new Set<string>(CALENDAR_NAME_PLACEHOLDERS);

export function validateCalendarNameTemplate(template: string): { ok: true } | { ok: false; error: string } {
  const normalized = template.trim();
  if (!normalized) return { ok: false, error: "Calendar name template is required." };

  for (const match of normalized.matchAll(PLACEHOLDER_PATTERN)) {
    if (!ALLOWED.has(match[1])) {
      return { ok: false, error: `Unknown calendar name placeholder: {${match[1]}}.` };
    }
  }

  const leftover = normalized.replace(PLACEHOLDER_PATTERN, "");
  if (leftover.includes("{") || leftover.includes("}")) {
    return { ok: false, error: "Calendar name template contains an invalid placeholder." };
  }

  return { ok: true };
}

export function renderCalendarNameTemplate(template: string, values: CalendarNameValues): string {
  const validation = validateCalendarNameTemplate(template);
  if (!validation.ok) throw new Error(validation.error);

  const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, key: CalendarNamePlaceholder) => values[key] ?? "");
  const normalized = rendered.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Calendar name template resolves to an empty name.");
  return normalized;
}
