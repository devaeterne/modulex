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

type DecimalParts = { coefficient: bigint; scale: number };
const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TWO = BigInt(2);
const BIG_HUNDRED = BigInt(100);

function decimalParts(value: string): DecimalParts {
  const sign = value.startsWith("-") ? -BIG_ONE : BIG_ONE;
  const unsigned = value.replace(/^[-+]/, "");
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  return {
    coefficient: sign * BigInt(`${integerPart || "0"}${fractionPart}`),
    scale: fractionPart.length,
  };
}

function roundDecimal(parts: DecimalParts, targetScale: number): string {
  const factor = BigInt(10) ** BigInt(targetScale);
  const denominator = BigInt(10) ** BigInt(parts.scale);
  let numerator = parts.coefficient * factor;
  const sign = numerator < BIG_ZERO ? -BIG_ONE : BIG_ONE;
  numerator = numerator < BIG_ZERO ? -numerator : numerator;
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BIG_TWO >= denominator) quotient += BIG_ONE;
  quotient *= sign;
  const negative = quotient < BIG_ZERO;
  const magnitude = (negative ? -quotient : quotient).toString().padStart(targetScale + 1, "0");
  const integer = targetScale ? magnitude.slice(0, -targetScale) || "0" : magnitude;
  const fraction = targetScale ? magnitude.slice(-targetScale) : "";
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function canonicalParts(value: string): string {
  const parsed = decimalParts(value);
  const rounded = roundDecimal(parsed, parsed.scale);
  const [integer, fraction = ""] = rounded.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return `${integer === "-0" ? "0" : integer}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

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

/** Canonical numeric representation for DB-equivalent comparisons only. */
export function canonicalizeDbDecimal(
  value: string | number | null | undefined,
  contract: DecimalValidation
) {
  const parsed = parseDbDecimal(value, contract);
  return parsed.error || parsed.value === null ? "" : canonicalParts(parsed.value);
}

/** Exact, string-based bulk arithmetic for DB numeric mutations. */
export function calculateDbDecimalBulk(
  current: string | null | undefined,
  adjustment: string,
  mode: "set_amount" | "current_amount" | "current_percent" | "source_percent",
  contract: DecimalValidation
): DecimalParseResult {
  const parsedAdjustment = parseDbDecimal(adjustment, { ...contract, min: undefined, max: undefined, scale: Math.max(contract.scale, 12) });
  if (parsedAdjustment.error || parsedAdjustment.value === null) return { value: null, error: parsedAdjustment.error ?? "A value is required." };
  if (mode === "set_amount") return parseDbDecimal(parsedAdjustment.value, contract);
  const parsedCurrent = parseDbDecimal(current, { ...contract, scale: Math.max(contract.scale, 12) });
  if (parsedCurrent.error || parsedCurrent.value === null) return { value: null, error: parsedCurrent.error ?? "A current value is required." };
  const left = decimalParts(parsedCurrent.value);
  const right = decimalParts(parsedAdjustment.value);
  let result: string;
  if (mode === "current_amount") {
    const scale = Math.max(left.scale, right.scale);
    const coefficient = left.coefficient * BigInt(10) ** BigInt(scale - left.scale) + right.coefficient * BigInt(10) ** BigInt(scale - right.scale);
    result = roundDecimal({ coefficient, scale }, contract.scale);
  } else {
    const factor = BIG_HUNDRED * BigInt(10) ** BigInt(right.scale) + right.coefficient;
    const numerator = left.coefficient * factor * BigInt(10) ** BigInt(contract.scale);
    const denominator = BIG_HUNDRED * BigInt(10) ** BigInt(left.scale + right.scale);
    const sign = numerator < BIG_ZERO ? -BIG_ONE : BIG_ONE;
    const magnitude = numerator < BIG_ZERO ? -numerator : numerator;
    let quotient = magnitude / denominator;
    if ((magnitude % denominator) * BIG_TWO >= denominator) quotient += BIG_ONE;
    quotient *= sign;
    result = roundDecimal({ coefficient: quotient, scale: contract.scale }, contract.scale);
  }
  return parseDbDecimal(result, contract);
}
