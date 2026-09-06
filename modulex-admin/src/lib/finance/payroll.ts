import { supabase } from "@/lib/supabase/client";

export type FinanceEmployeePaymentDraftInput = {
  sourceAccountId: string;
  amount: number;
  currencyCode: string;
  transactionAt: string;
  referenceNo?: string | null;
  notes?: string | null;
  employeeId: string;
  sourceDocumentType?: "hr_payroll_item" | "hr_variable_pay" | "hr_advance" | null;
  sourceDocumentId?: string | null;
};

export type FinancePayrollObligation = {
  payroll_item_id: string;
  payroll_run_id: string;
  period_code: string;
  pay_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  currency_code: string;
  net_pay: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  employee_withholding: number;
  employee_deductions: number;
  advance_repayment: number;
  employer_payroll_taxes: number;
  employer_benefit_cost: number;
  total_employer_cost: number;
};

function normalizeRpcError(error: { message?: string } | null) {
  return new Error(error?.message || "Finance payroll operation failed.");
}

export async function saveEmployeePaymentDraft(
  input: FinanceEmployeePaymentDraftInput,
  idempotencyKey = crypto.randomUUID(),
) {
  const { data, error } = await supabase.rpc("save_employee_payment_draft", {
    p_source_account_id: input.sourceAccountId || null,
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_transaction_at: input.transactionAt,
    p_reference_no: input.referenceNo?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_employee_id: input.employeeId,
    p_source_document_type: input.sourceDocumentType || null,
    p_source_document_id: input.sourceDocumentId || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw normalizeRpcError(error);
  return data as string;
}

export async function getFinancePayrollObligations() {
  const { data, error } = await supabase.rpc("get_finance_payroll_obligations");
  if (error) throw normalizeRpcError(error);
  return (data ?? []) as FinancePayrollObligation[];
}
