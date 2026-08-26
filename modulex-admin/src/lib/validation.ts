export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string | null | undefined) {
  if (!value?.trim()) return true;
  return EMAIL_PATTERN.test(value.trim());
}

export function sanitizePhoneInput(value: string) {
  const trimmed = value.trimStart();
  const hasLeadingPlus = trimmed.startsWith("+");
  const body = value.replace(/[^0-9().\-\s]/g, "");
  return `${hasLeadingPlus ? "+" : ""}${body}`.slice(0, 24);
}

export function getPhoneDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidPhone(value: string | null | undefined) {
  if (!value?.trim()) return true;
  const normalized = value.trim();
  const digits = getPhoneDigits(normalized);

  return (
    !/[A-Za-z]/.test(normalized) &&
    /^\+?[0-9().\-\s]+$/.test(normalized) &&
    digits.length >= 7 &&
    digits.length <= 15
  );
}

export function normalizeCountryCode(value: string) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
}

export function isValidCountryCode(value: string | null | undefined) {
  if (!value?.trim()) return true;
  return COUNTRY_CODE_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeCurrencyCode(value: string) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
}

export function isValidCurrencyCode(value: string | null | undefined) {
  if (!value?.trim()) return true;
  return CURRENCY_CODE_PATTERN.test(value.trim().toUpperCase());
}

export function isValidHttpUrl(value: string | null | undefined) {
  if (!value?.trim()) return true;

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}
