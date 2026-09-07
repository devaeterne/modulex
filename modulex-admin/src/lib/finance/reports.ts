import { supabase } from "@/lib/supabase/client";

export type FinanceReportingSummary = {
  base_currency_code: string;
  from_date: string | null;
  to_date: string | null;
  operating_income_base: number | null;
  operating_expense_base: number | null;
  operating_result_base: number | null;
  other_cash_inflow_base: number | null;
  other_cash_outflow_base: number | null;
  net_cash_change_base: number | null;
  posted_event_count: number;
  reversal_count: number;
  unconverted_count: number;
};

export type FinanceCashFlowPoint = {
  period_start: string;
  base_currency_code: string;
  operating_income_base: number | null;
  operating_expense_base: number | null;
  operating_result_base: number | null;
  other_cash_inflow_base: number | null;
  other_cash_outflow_base: number | null;
  net_cash_change_base: number | null;
  posted_event_count: number;
  unconverted_count: number;
};

export type FinanceAccountMovementRow = {
  transaction_id: string;
  original_transaction_id: string | null;
  transaction_kind: string;
  business_kind: string | null;
  transaction_at: string;
  account_id: string;
  account_name: string;
  counter_account_id: string | null;
  counter_account_name: string | null;
  amount: number;
  currency_code: string;
  account_delta_amount: number;
  base_currency_code: string | null;
  base_amount: number | null;
  account_delta_base: number | null;
  reference_no: string | null;
  notes: string | null;
  unconverted: boolean;
  total_count: number;
};

export type FinanceProjectActualsRow = {
  project_id: string;
  project_number: string;
  project_name: string;
  project_status: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  base_currency_code: string;
  linked_operating_income_base: number | null;
  linked_operating_expense_base: number | null;
  linked_other_cash_base: number | null;
  linked_net_cash_base: number | null;
  linked_transaction_count: number;
  linked_order_count: number;
  unconverted_allocation_count: number;
  total_count: number;
};

export type ProjectFinanceOrderActuals = {
  order_id: string;
  order_number: string | null;
  operating_income_base: number | null;
  operating_expense_base: number | null;
  other_cash_base: number | null;
  net_cash_base: number | null;
  transaction_count: number;
  unconverted_allocation_count: number;
};

export type ProjectFinanceActuals = {
  project_id: string;
  project_number: string;
  project_name: string;
  project_status: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  base_currency_code: string;
  from_date: string | null;
  to_date: string | null;
  linked_operating_income_base: number | null;
  linked_operating_expense_base: number | null;
  linked_other_cash_base: number | null;
  linked_net_cash_base: number | null;
  linked_transaction_count: number;
  linked_order_count: number;
  unconverted_allocation_count: number;
  orders: ProjectFinanceOrderActuals[];
};

function normalizeRpcError(error: { message?: string } | null) {
  return new Error(error?.message || "Finance reporting operation failed.");
}

function clampPageSize(value: number | undefined, fallback = 50) {
  return Math.min(Math.max(value ?? fallback, 1), 200);
}

export async function getFinanceReportingSummary(options?: {
  from?: string | null;
  to?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_finance_reporting_summary", {
    p_from: options?.from || null,
    p_to: options?.to || null,
  });
  if (error) throw normalizeRpcError(error);
  return data as FinanceReportingSummary;
}

export async function getFinanceCashFlowSeries(options?: {
  from?: string | null;
  to?: string | null;
  grain?: "day" | "month";
}) {
  const { data, error } = await supabase.rpc("get_finance_cash_flow_series", {
    p_from: options?.from || null,
    p_to: options?.to || null,
    p_grain: options?.grain ?? "month",
  });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceCashFlowPoint[];
}

export async function getFinanceAccountMovementsPage(options: {
  accountId: string;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}) {
  const { data, error } = await supabase.rpc("get_finance_account_movements_page", {
    p_from: options.from || null,
    p_to: options.to || null,
    p_account_id: options.accountId,
    p_limit: clampPageSize(options.limit),
    p_offset: Math.max(options.offset ?? 0, 0),
  });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceAccountMovementRow[];
}

export async function getFinanceProjectActualsPage(options?: {
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_finance_project_actuals_page", {
    p_from: options?.from || null,
    p_to: options?.to || null,
    p_limit: clampPageSize(options?.limit),
    p_offset: Math.max(options?.offset ?? 0, 0),
    p_search: options?.search?.trim() || null,
  });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceProjectActualsRow[];
}

export async function getProjectFinanceActuals(options: {
  projectId: string;
  from?: string | null;
  to?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_project_finance_actuals", {
    p_project_id: options.projectId,
    p_from: options.from || null,
    p_to: options.to || null,
  });
  if (error) throw normalizeRpcError(error);
  return data as ProjectFinanceActuals;
}
