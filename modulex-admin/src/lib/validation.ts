export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export type DecimalValidation = {
  precision: number;
  scale: number;
  min?: number;
  max?: number;
  allowNull?: boolean;
};

export type DecimalParseResult = {
  value: string | null;
  error: string | null;
};

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

/** Normalize a decimal input without silently changing its DB scale. */
export function parseDbDecimal(
  value: string | number | null | undefined,
  contract: DecimalValidation
): DecimalParseResult {
  const raw = value === null || value === undefined ? "" : String(value).trim().replace(",", ".");
  if (!raw) {
    return contract.allowNull === false
      ? { value: null, error: "A value is required." }
      : { value: null, error: null };
  }

  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
    return { value: null, error: "Enter a valid decimal number." };
  }

  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/^[-+]/, "");
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  if (fractionPart.length > contract.scale) {
    return { value: null, error: `Use no more than ${contract.scale} decimal places.` };
  }

  if (normalizedInteger.length > contract.precision - contract.scale) {
    return { value: null, error: "The value exceeds the allowed range." };
  }

  const normalizedMagnitude = fractionPart ? `${normalizedInteger}.${fractionPart}` : normalizedInteger;
  const normalized = `${sign}${normalizedMagnitude}`;
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return { value: null, error: "The value exceeds the allowed range." };
  }
  if (contract.min !== undefined && numericValue < contract.min) {
    return { value: null, error: `The value must be at least ${contract.min}.` };
  }
  if (contract.max !== undefined && numericValue > contract.max) {
    return { value: null, error: `The value must be at most ${contract.max}.` };
  }

  return { value: normalized, error: null };
}

export function formatDbDecimal(
  value: string | number | null | undefined,
  contract: DecimalValidation
) {
  const parsed = parseDbDecimal(value, contract);
  return parsed.error ? "" : parsed.value ?? "";
}
