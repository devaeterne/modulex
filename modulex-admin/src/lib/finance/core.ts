import { supabase } from "@/lib/supabase/client";

export type FinanceAccountType = "bank" | "cash" | "clearing";
export type FinanceCategoryType = "expense" | "income";
export type FinanceTransactionStatus = "draft" | "posted" | "voided";
export type FinanceTransactionKind =
  | "expense"
  | "customer_receipt"
  | "vendor_payment"
  | "employee_payment"
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "refund"
  | "reversal";

export type FinanceAccount = {
  id: string;
  code: string;
  name: string;
  account_type: FinanceAccountType;
  currency_code: string;
  institution_name: string | null;
  reference_no: string | null;
  is_active: boolean;
  balance: number;
  created_at: string;
  updated_at: string;
};

export type FinanceCategory = {
  id: string;
  code: string;
  name: string;
  category_type: FinanceCategoryType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceFxRate = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_source: string;
  observed_at: string;
  is_active: boolean;
  created_at: string;
};

export type FinanceTransaction = {
  id: string;
  transaction_kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  source_account_id: string | null;
  source_account_name: string | null;
  destination_account_id: string | null;
  destination_account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  currency_code: string;
  transaction_at: string;
  reference_no: string | null;
  notes: string | null;
  base_currency_code: string | null;
  base_amount: number | null;
  fx_rate: number | null;
  fx_rate_source: string | null;
  reversal_of_transaction_id: string | null;
  posted_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  total_count: number;
};

export type FinanceOverview = {
  base_currency: string;
  active_account_count: number;
  draft_transaction_count: number;
  posted_transaction_count: number;
  account_balances: Array<{
    id: string;
    name: string;
    type: FinanceAccountType;
    currency_code: string;
    balance: number;
  }>;
};

export type FinanceEmployeeOption = {
  employee_id: string;
  employee_number: string;
  full_name: string;
  employment_status: string;
};

export type FinancePayrollItemOption = {
  payroll_item_id: string;
  payroll_run_id: string;
  period_code: string;
  pay_date: string;
  run_status: string;
  net_pay: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
};

export type FinanceTransactionLinkInput = {
  project_id?: string | null;
  order_id?: string | null;
  customer_id?: string | null;
  employee_id?: string | null;
  vendor_code?: string | null;
  source_document_type?: string | null;
  source_document_id?: string | null;
  allocated_amount: number;
  notes?: string | null;
};

export type FinanceTransactionDraftInput = {
  transactionKind: FinanceTransactionKind;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  amount: number;
  currencyCode: string;
  transactionAt: string;
  referenceNo?: string | null;
  notes?: string | null;
};

function normalizeRpcError(error: { message?: string } | null) {
  return new Error(error?.message || "Finance operation failed.");
}

export async function getFinanceOverview() {
  const { data, error } = await supabase.rpc("get_finance_overview");
  if (error) throw normalizeRpcError(error);
  return (data ?? {
    base_currency: "USD",
    active_account_count: 0,
    draft_transaction_count: 0,
    posted_transaction_count: 0,
    account_balances: [],
  }) as FinanceOverview;
}

export async function getFinanceAccounts() {
  const { data, error } = await supabase.rpc("get_finance_accounts");
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceAccount[];
}

export async function getFinanceCategories() {
  const { data, error } = await supabase.rpc("get_finance_categories");
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceCategory[];
}

export async function getFinanceFxRates(limit = 100) {
  const { data, error } = await supabase.rpc("get_finance_fx_rates", { p_limit: limit });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceFxRate[];
}

export async function getFinanceEmployeeDirectory() {
  const { data, error } = await supabase.rpc("get_finance_employee_directory");
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceEmployeeOption[];
}

export async function getFinanceEmployeePayrollItems(employeeId: string) {
  const { data, error } = await supabase.rpc("get_finance_employee_payroll_items", {
    p_employee_id: employeeId,
  });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinancePayrollItemOption[];
}

export async function getFinanceTransactionsPage(options?: {
  limit?: number;
  offset?: number;
  status?: FinanceTransactionStatus | null;
  kind?: FinanceTransactionKind | null;
  accountId?: string | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_finance_transactions_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_status: options?.status ?? null,
    p_kind: options?.kind ?? null,
    p_account_id: options?.accountId ?? null,
    p_search: options?.search?.trim() || null,
  });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinanceTransaction[];
}

export async function createFinanceAccount(input: {
  code: string;
  name: string;
  accountType: FinanceAccountType;
  currencyCode: string;
  institutionName?: string | null;
  referenceNo?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_finance_account", {
    p_code: input.code.trim(),
    p_name: input.name.trim(),
    p_account_type: input.accountType,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_institution_name: input.institutionName?.trim() || null,
    p_reference_no: input.referenceNo?.trim() || null,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function updateFinanceAccount(input: {
  accountId: string;
  name: string;
  institutionName?: string | null;
  referenceNo?: string | null;
  isActive: boolean;
}) {
  const { data, error } = await supabase.rpc("update_finance_account", {
    p_account_id: input.accountId,
    p_name: input.name.trim(),
    p_institution_name: input.institutionName?.trim() || null,
    p_reference_no: input.referenceNo?.trim() || null,
    p_is_active: input.isActive,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function createFinanceCategory(input: {
  code: string;
  name: string;
  categoryType: FinanceCategoryType;
}) {
  const { data, error } = await supabase.rpc("create_finance_category", {
    p_code: input.code.trim(),
    p_name: input.name.trim(),
    p_category_type: input.categoryType,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function upsertFinanceFxRate(input: {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateSource: string;
  observedAt: string;
}) {
  const { data, error } = await supabase.rpc("upsert_finance_fx_rate", {
    p_from_currency: input.fromCurrency.trim().toUpperCase(),
    p_to_currency: input.toCurrency.trim().toUpperCase(),
    p_rate: input.rate,
    p_rate_source: input.rateSource.trim(),
    p_observed_at: input.observedAt,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function createFinanceTransactionDraft(
  input: FinanceTransactionDraftInput,
  idempotencyKey = crypto.randomUUID(),
) {
  const { data, error } = await supabase.rpc("create_finance_transaction_draft", {
    p_transaction_kind: input.transactionKind,
    p_source_account_id: input.sourceAccountId || null,
    p_destination_account_id: input.destinationAccountId || null,
    p_category_id: input.categoryId || null,
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_transaction_at: input.transactionAt,
    p_reference_no: input.referenceNo?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function updateFinanceTransactionDraft(
  transactionId: string,
  input: FinanceTransactionDraftInput,
) {
  const { data, error } = await supabase.rpc("update_finance_transaction_draft", {
    p_transaction_id: transactionId,
    p_transaction_kind: input.transactionKind,
    p_source_account_id: input.sourceAccountId || null,
    p_destination_account_id: input.destinationAccountId || null,
    p_category_id: input.categoryId || null,
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_transaction_at: input.transactionAt,
    p_reference_no: input.referenceNo?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function deleteFinanceTransactionDraft(transactionId: string) {
  const { data, error } = await supabase.rpc("delete_finance_transaction_draft", {
    p_transaction_id: transactionId,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function setFinanceTransactionLinks(transactionId: string, links: FinanceTransactionLinkInput[]) {
  const { data, error } = await supabase.rpc("set_finance_transaction_links", {
    p_transaction_id: transactionId,
    p_links: links,
  });
  if (error) throw normalizeRpcError(error);
  return Number(data ?? 0);
}

export async function postFinanceTransaction(input: {
  transactionId: string;
  manualFxRate?: number | null;
  manualFxRateSource?: string | null;
  idempotencyKey?: string;
}) {
  const { data, error } = await supabase.rpc("post_finance_transaction", {
    p_transaction_id: input.transactionId,
    p_manual_fx_rate: input.manualFxRate ?? null,
    p_manual_fx_rate_source: input.manualFxRateSource?.trim() || null,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function voidFinanceTransaction(transactionId: string, reason: string, idempotencyKey = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc("void_finance_transaction", {
    p_transaction_id: transactionId,
    p_reason: reason.trim(),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function reverseFinanceTransaction(transactionId: string, reason: string, idempotencyKey = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc("reverse_finance_transaction", {
    p_transaction_id: transactionId,
    p_reason: reason.trim(),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}
