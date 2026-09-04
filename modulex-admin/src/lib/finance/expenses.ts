import { supabase } from "@/lib/supabase/client";

export type CompanyExpenseStatus = "draft" | "posted" | "void";

export type CompanyExpense = {
  id: string;
  expense_date: string;
  finance_category_id: string;
  category_name: string;
  category_snapshot: string;
  vendor: string | null;
  description: string;
  amount: number;
  currency_code: string;
  reference_no: string | null;
  notes: string | null;
  status: CompanyExpenseStatus;
  finance_transaction_id: string | null;
  finance_transaction_status: "draft" | "posted" | "voided" | null;
  source_account_id: string | null;
  source_account_name: string | null;
  base_currency_code: string | null;
  base_amount: number | null;
  created_at: string;
  updated_at: string;
  total_count: number;
};

export type CompanyExpenseDraftInput = {
  expenseDate: string;
  financeCategoryId: string;
  vendor?: string | null;
  description: string;
  amount: number;
  currencyCode: string;
  sourceAccountId: string;
  referenceNo?: string | null;
  notes?: string | null;
};

function normalizeRpcError(error: { message?: string } | null) {
  return new Error(error?.message || "Finance expense operation failed.");
}

export async function getCompanyExpensesPage(options?: {
  limit?: number;
  offset?: number;
  status?: CompanyExpenseStatus | null;
  categoryId?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_company_expenses_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_status: options?.status ?? null,
    p_category_id: options?.categoryId || null,
    p_search: options?.search?.trim() || null,
    p_from: options?.from || null,
    p_to: options?.to || null,
  });
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as CompanyExpense[];
}

export async function createCompanyExpenseDraft(
  input: CompanyExpenseDraftInput,
  idempotencyKey = crypto.randomUUID(),
) {
  const { data, error } = await supabase.rpc("create_company_expense_draft", {
    p_expense_date: input.expenseDate,
    p_finance_category_id: input.financeCategoryId,
    p_vendor: input.vendor?.trim() || null,
    p_description: input.description.trim(),
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_source_account_id: input.sourceAccountId,
    p_reference_no: input.referenceNo?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function updateCompanyExpenseDraft(expenseId: string, input: CompanyExpenseDraftInput) {
  const { data, error } = await supabase.rpc("update_company_expense_draft", {
    p_expense_id: expenseId,
    p_expense_date: input.expenseDate,
    p_finance_category_id: input.financeCategoryId,
    p_vendor: input.vendor?.trim() || null,
    p_description: input.description.trim(),
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_source_account_id: input.sourceAccountId,
    p_reference_no: input.referenceNo?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function deleteCompanyExpenseDraft(expenseId: string) {
  const { data, error } = await supabase.rpc("delete_company_expense_draft", {
    p_expense_id: expenseId,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function postCompanyExpense(input: {
  expenseId: string;
  manualFxRate?: number | null;
  manualFxRateSource?: string | null;
  idempotencyKey?: string;
}) {
  const { data, error } = await supabase.rpc("post_company_expense", {
    p_expense_id: input.expenseId,
    p_manual_fx_rate: input.manualFxRate ?? null,
    p_manual_fx_rate_source: input.manualFxRateSource?.trim() || null,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function voidCompanyExpense(
  expenseId: string,
  reason: string,
  idempotencyKey = crypto.randomUUID(),
) {
  const { data, error } = await supabase.rpc("void_company_expense", {
    p_expense_id: expenseId,
    p_reason: reason.trim(),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}
