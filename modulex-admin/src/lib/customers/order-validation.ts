import { parseDbDecimal, type DecimalValidation } from "@/lib/validation";

export const ORDER_QUANTITY_DECIMAL = {
  precision: 18,
  scale: 4,
  min: 0.0001,
  allowNull: false,
} as const;

export const ORDER_MONEY_DECIMAL = {
  precision: 18,
  scale: 4,
  min: 0,
  allowNull: false,
} as const;

export const ORDER_PERCENT_DECIMAL = {
  precision: 7,
  scale: 3,
  min: 0,
  max: 100,
  allowNull: false,
} as const;

export type RequiredOrderDecimalParseResult =
  | Readonly<{ value: string; error: null }>
  | Readonly<{ value: null; error: string }>;

function parseRequiredOrderDecimal(
  value: string | number | null | undefined,
  contract: DecimalValidation,
): RequiredOrderDecimalParseResult {
  const result = parseDbDecimal(value, contract);
  if (result.value === null) {
    return { value: null, error: result.error ?? "A value is required." };
  }
  return { value: result.value, error: null };
}

export function parseOrderQuantity(value: string | number | null | undefined): RequiredOrderDecimalParseResult {
  return parseRequiredOrderDecimal(value, ORDER_QUANTITY_DECIMAL);
}

export function parseOrderMoney(value: string | number | null | undefined): RequiredOrderDecimalParseResult {
  return parseRequiredOrderDecimal(value, ORDER_MONEY_DECIMAL);
}

export function parseOrderPercent(value: string | number | null | undefined): RequiredOrderDecimalParseResult {
  return parseRequiredOrderDecimal(value, ORDER_PERCENT_DECIMAL);
}

function requireDecimal(result: RequiredOrderDecimalParseResult, label: string): string {
  if (result.error || result.value === null) {
    throw new Error(`${label}: ${result.error ?? "A value is required."}`);
  }
  return result.value;
}

export function requireOrderQuantity(value: string | number | null | undefined, label = "Order quantity") {
  return requireDecimal(parseOrderQuantity(value), label);
}

export function requireOrderMoney(value: string | number | null | undefined, label = "Order amount") {
  return requireDecimal(parseOrderMoney(value), label);
}

export function requireOrderPercent(value: string | number | null | undefined, label = "Order percentage") {
  return requireDecimal(parseOrderPercent(value), label);
}
