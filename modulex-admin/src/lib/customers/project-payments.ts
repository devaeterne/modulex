import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type ProjectPaymentRequirementStatus = "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";
export type ProjectPaymentTransactionType = "payment" | "refund" | "reversal";
export type ProjectPaymentTransactionStatus = "posted" | "voided";

export type ProjectPaymentCurrencySummary = {
  currencyCode: string;
  expected: number;
  received: number;
  allocated: number;
  unallocatedCredit: number;
  remaining: number;
  overdue: number;
};

export type ProjectPaymentRequirement = {
  id: string;
  name: string;
  sequenceNo: number;
  amount: number;
  received: number;
  remaining: number;
  currencyCode: string;
  dueDate: string | null;
  invoiceId: string | null;
  status: ProjectPaymentRequirementStatus;
};

export type ProjectPaymentTransaction = {
  id: string;
  transactionType: ProjectPaymentTransactionType;
  status: ProjectPaymentTransactionStatus;
  amount: number;
  allocated: number;
  unallocated: number;
  currencyCode: string;
  transactionDate: string;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  referenceNo: string | null;
  reversalOfTransactionId: string | null;
  notes: string | null;
  createdAt: string;
};

export type ProjectPaymentLedger = {
  projectId: string;
  currencies: ProjectPaymentCurrencySummary[];
  requirements: ProjectPaymentRequirement[];
  transactions: ProjectPaymentTransaction[];
};

type RawCurrencySummary = {
  currency_code?: string | null;
  expected?: number | string | null;
  received?: number | string | null;
  allocated?: number | string | null;
  unallocated_credit?: number | string | null;
  remaining?: number | string | null;
  overdue?: number | string | null;
};

type RawRequirement = {
  id?: string | null;
  name?: string | null;
  sequence_no?: number | string | null;
  amount?: number | string | null;
  received?: number | string | null;
  remaining?: number | string | null;
  currency_code?: string | null;
  due_date?: string | null;
  invoice_id?: string | null;
  status?: string | null;
};

type RawTransaction = {
  id?: string | null;
  transaction_type?: string | null;
  status?: string | null;
  amount?: number | string | null;
  allocated?: number | string | null;
  unallocated?: number | string | null;
  currency_code?: string | null;
  transaction_date?: string | null;
  payment_method_id?: string | null;
  payment_method_name?: string | null;
  reference_no?: string | null;
  reversal_of_transaction_id?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type RawLedger = {
  project_id?: string | null;
  currencies?: RawCurrencySummary[] | null;
  requirements?: RawRequirement[] | null;
  transactions?: RawTransaction[] | null;
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requireProjectPaymentManage() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !hasPermission(profile.roles, "project_payments.manage")) {
    throw new Error("You do not have permission to manage Project customer payments.");
  }
  return profile;
}

export async function loadProjectPaymentLedger(projectId: string): Promise<ProjectPaymentLedger> {
  await requireProjectPaymentManage();
  const { data, error } = await supabase.rpc("get_customer_project_payment_ledger", {
    p_project_id: projectId,
  });
  if (error) throw error;

  const raw = (data ?? {}) as RawLedger;
  return {
    projectId: raw.project_id ?? projectId,
    currencies: (raw.currencies ?? []).map((row) => ({
      currencyCode: row.currency_code ?? "USD",
      expected: numberValue(row.expected),
      received: numberValue(row.received),
      allocated: numberValue(row.allocated),
      unallocatedCredit: numberValue(row.unallocated_credit),
      remaining: numberValue(row.remaining),
      overdue: numberValue(row.overdue),
    })),
    requirements: (raw.requirements ?? []).map((row) => ({
      id: row.id ?? "",
      name: row.name ?? "Payment requirement",
      sequenceNo: numberValue(row.sequence_no),
      amount: numberValue(row.amount),
      received: numberValue(row.received),
      remaining: numberValue(row.remaining),
      currencyCode: row.currency_code ?? "USD",
      dueDate: row.due_date ?? null,
      invoiceId: row.invoice_id ?? null,
      status: (row.status ?? "pending") as ProjectPaymentRequirementStatus,
    })),
    transactions: (raw.transactions ?? []).map((row) => ({
      id: row.id ?? "",
      transactionType: (row.transaction_type ?? "payment") as ProjectPaymentTransactionType,
      status: (row.status ?? "posted") as ProjectPaymentTransactionStatus,
      amount: numberValue(row.amount),
      allocated: numberValue(row.allocated),
      unallocated: numberValue(row.unallocated),
      currencyCode: row.currency_code ?? "USD",
      transactionDate: row.transaction_date ?? "",
      paymentMethodId: row.payment_method_id ?? null,
      paymentMethodName: row.payment_method_name ?? null,
      referenceNo: row.reference_no ?? null,
      reversalOfTransactionId: row.reversal_of_transaction_id ?? null,
      notes: row.notes ?? null,
      createdAt: row.created_at ?? "",
    })),
  };
}

export async function createProjectPaymentRequirement(input: {
  projectId: string;
  name: string;
  amount: number;
  currencyCode: string;
  dueDate?: string | null;
  notes?: string | null;
  invoiceId?: string | null;
}) {
  await requireProjectPaymentManage();
  const { data, error } = await supabase.rpc("create_customer_project_payment_requirement", {
    p_project_id: input.projectId,
    p_name: input.name,
    p_amount: input.amount,
    p_currency_code: input.currencyCode,
    p_due_date: input.dueDate ?? null,
    p_notes: input.notes ?? null,
    p_invoice_id: input.invoiceId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function recordProjectPayment(input: {
  projectId: string;
  amount: number;
  currencyCode: string;
  transactionDate: string;
  paymentMethodId?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
}) {
  await requireProjectPaymentManage();
  const { data, error } = await supabase.rpc("record_customer_project_payment", {
    p_project_id: input.projectId,
    p_amount: input.amount,
    p_currency_code: input.currencyCode,
    p_transaction_date: input.transactionDate,
    p_payment_method_id: input.paymentMethodId ?? null,
    p_reference_no: input.referenceNo ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function allocateProjectPayment(input: {
  paymentId: string;
  requirementId: string;
  amount: number;
}) {
  await requireProjectPaymentManage();
  const { data, error } = await supabase.rpc("allocate_customer_project_payment", {
    p_payment_id: input.paymentId,
    p_requirement_id: input.requirementId,
    p_amount: input.amount,
  });
  if (error) throw error;
  return data as string;
}

export async function reverseProjectPayment(input: {
  paymentId: string;
  amount: number;
  reason: string;
}) {
  await requireProjectPaymentManage();
  const { data, error } = await supabase.rpc("reverse_customer_project_payment", {
    p_payment_id: input.paymentId,
    p_amount: input.amount,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as string;
}

export async function voidProjectPayment(input: { paymentId: string; reason: string }) {
  await requireProjectPaymentManage();
  const { data, error } = await supabase.rpc("void_customer_project_payment", {
    p_payment_id: input.paymentId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as string;
}
