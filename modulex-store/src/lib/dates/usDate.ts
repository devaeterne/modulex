const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const INPUT_ERROR = "Enter a date as MM.DD.YYYY.";

export type DateInputParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export type DateFormatOptions = {
  timeZone?: string;
};

export type DateTimeFormatOptions = DateFormatOptions & {
  timeStyle?: "short" | "medium";
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function isCalendarDate(year: number, month: number, day: number) {
  return Number.isInteger(year)
    && Number.isInteger(month)
    && Number.isInteger(day)
    && year >= 1
    && month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth(year, month);
}

function canonicalParts(value: string | null | undefined) {
  if (!value) return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isCalendarDate(year, month, day)) return null;
  return { yearText, monthText, dayText };
}

export function formatDateOnly(value: string | null | undefined): string {
  const parts = canonicalParts(value);
  if (!parts) return "—";
  return `${parts.monthText}.${parts.dayText}.${parts.yearText}`;
}

export function formatDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const formatted = formatDateOnly(value);
  return formatted === "—" ? "" : formatted;
}

export function parseDateInput(value: string): DateInputParseResult {
  const match = US_DATE.exec(value.trim());
  if (!match) return { ok: false, error: INPUT_ERROR };
  const [, monthText, dayText, yearText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isCalendarDate(year, month, day)) return { ok: false, error: INPUT_ERROR };
  return { ok: true, value: `${yearText}-${monthText}-${dayText}` };
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function parseTimestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function formatTimestampDate(
  value: string | Date | null | undefined,
  options: DateFormatOptions = {},
): string {
  const date = parseTimestamp(value);
  if (!date) return "—";

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  };
  const dateParts = new Intl.DateTimeFormat("en-US", dateOptions).formatToParts(date);
  const month = part(dateParts, "month");
  const day = part(dateParts, "day");
  const year = part(dateParts, "year");
  if (!month || !day || !year) return "—";
  return `${month}.${day}.${year}`;
}

export function formatDateTime(
  value: string | Date | null | undefined,
  options: DateTimeFormatOptions = {},
): string {
  const date = parseTimestamp(value);
  if (!date) return "—";

  const formattedDate = formatTimestampDate(date, options);
  if (formattedDate === "—") return "—";

  const timeOptions: Intl.DateTimeFormatOptions = {
    timeStyle: options.timeStyle ?? "short",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  };
  const time = new Intl.DateTimeFormat("en-US", timeOptions).format(date);
  return `${formattedDate} ${time}`;
}
