import { supabase } from "@/lib/supabase/client";
import { parseDbDecimal } from "@/lib/validation";

export type ArAgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export type ArAgingRow = {
  invoice_id: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string | null;
  project_id: string | null;
  project_number: string | null;
  customer_reference: string | null;
  invoice_date: string;
  due_date: string | null;
  days_past_due: number;
  aging_bucket: ArAgingBucket;
  status: string;
  currency_code: string;
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  total_count: number;
};

export type ArCurrencyTotals = {
  open_ar_amount: string;
  overdue_amount: string;
  due_soon_amount: string;
  aging_buckets: Record<ArAgingBucket, string>;
};

export type ArAgingSummary = {
  as_of: string;
  customer_id: string | null;
  open_invoice_count: number;
  overdue_invoice_count: number;
  currency_totals: Record<string, ArCurrencyTotals>;
  currency_mode: "grouped_no_revaluation";
};

export type CustomerArBalance = ArAgingSummary & {
  customer_code: string;
  customer_name: string;
  customer_status: string;
};

export type CustomerPaymentAllocation = {
  invoice_id: string;
  invoice_number: string | null;
  amount: string | number;
};

export type CustomerPaymentHistoryRow = {
  source_kind: "finance_receipt" | "project_payment";
  source_id: string;
  event_kind: string;
  status: string;
  transaction_at: string;
  amount: string;
  currency_code: string;
  base_currency_code: string | null;
  base_amount: string | null;
  reference_no: string | null;
  notes: string | null;
  order_id: string | null;
  project_id: string | null;
  invoice_allocations: CustomerPaymentAllocation[];
  total_count: number;
};

type RawArRow = Omit<ArAgingRow, "total_amount" | "paid_amount" | "outstanding_amount"> & {
  total_amount: string | number;
  paid_amount: string | number;
  outstanding_amount: string | number;
};

type RawPaymentRow = Omit<CustomerPaymentHistoryRow, "amount" | "base_amount"> & {
  amount: string | number;
  base_amount: string | number | null;
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

function money(value: string | number | null | undefined) {
  const parsed = parseDbDecimal(value ?? 0, { precision: 18, scale: 4, allowNull: false });
  if (parsed.error || parsed.value === null) throw new Error(`Invalid Finance amount: ${parsed.error || "Value required."}`);
  return parsed.value;
}

function signedMoney(value: string | number | null | undefined) {
  const parsed = parseDbDecimal(value ?? 0, { precision: 18, scale: 4, min: -99999999999999, max: 99999999999999, allowNull: false });
  if (parsed.error || parsed.value === null) throw new Error(`Invalid Finance amount: ${parsed.error || "Value required."}`);
  return parsed.value;
}

function normalizeCurrencyTotals(input: unknown): Record<string, ArCurrencyTotals> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([currency, raw]) => {
      const value = (raw ?? {}) as Record<string, unknown>;
      const buckets = (value.aging_buckets ?? {}) as Record<string, unknown>;
      return [currency, {
        open_ar_amount: money(value.open_ar_amount as string | number | undefined),
        overdue_amount: money(value.overdue_amount as string | number | undefined),
        due_soon_amount: money(value.due_soon_amount as string | number | undefined),
        aging_buckets: {
          current: money(buckets.current as string | number | undefined),
          "1_30": money(buckets["1_30"] as string | number | undefined),
          "31_60": money(buckets["31_60"] as string | number | undefined),
          "61_90": money(buckets["61_90"] as string | number | undefined),
          "90_plus": money(buckets["90_plus"] as string | number | undefined),
        },
      } satisfies ArCurrencyTotals];
    }),
  );
}

function normalizeSummary(data: unknown): ArAgingSummary {
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    as_of: String(raw.as_of ?? ""),
    customer_id: typeof raw.customer_id === "string" ? raw.customer_id : null,
    open_invoice_count: Number(raw.open_invoice_count ?? 0),
    overdue_invoice_count: Number(raw.overdue_invoice_count ?? 0),
    currency_totals: normalizeCurrencyTotals(raw.currency_totals),
    currency_mode: "grouped_no_revaluation",
  };
}

export async function getArAgingPage(options?: {
  limit?: number;
  offset?: number;
  customerId?: string | null;
  bucket?: ArAgingBucket | null;
  search?: string | null;
  asOf?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_ar_aging_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_customer_id: options?.customerId ?? null,
    p_bucket: options?.bucket ?? null,
    p_search: clean(options?.search),
    p_as_of: options?.asOf || null,
  });
  if (error) throw rpcError(error, "AR Aging could not be loaded.");
  return ((data ?? []) as RawArRow[]).map((row) => ({
    ...row,
    total_amount: money(row.total_amount),
    paid_amount: money(row.paid_amount),
    outstanding_amount: money(row.outstanding_amount),
  }));
}

export async function getArAgingSummary(options?: { customerId?: string | null; asOf?: string | null }) {
  const { data, error } = await supabase.rpc("get_ar_aging_summary", {
    p_customer_id: options?.customerId ?? null,
    p_as_of: options?.asOf || null,
  });
  if (error) throw rpcError(error, "AR summary could not be loaded.");
  return normalizeSummary(data);
}

export async function getCustomerArBalance(customerId: string, asOf?: string | null) {
  const { data, error } = await supabase.rpc("get_customer_ar_balance", {
    p_customer_id: customerId,
    p_as_of: asOf || null,
  });
  if (error) throw rpcError(error, "Customer balance could not be loaded.");
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ...normalizeSummary(raw),
    customer_code: String(raw.customer_code ?? ""),
    customer_name: String(raw.customer_name ?? ""),
    customer_status: String(raw.customer_status ?? ""),
  } as CustomerArBalance;
}

export async function getCustomerPaymentHistory(customerId: string, options?: { limit?: number; offset?: number }) {
  const { data, error } = await supabase.rpc("get_customer_payment_history", {
    p_customer_id: customerId,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw rpcError(error, "Customer Payment History could not be loaded.");
  return ((data ?? []) as RawPaymentRow[]).map((row) => ({
    ...row,
    amount: signedMoney(row.amount),
    base_amount: row.base_amount === null ? null : signedMoney(row.base_amount),
    invoice_allocations: Array.isArray(row.invoice_allocations) ? row.invoice_allocations : [],
  }));
}
