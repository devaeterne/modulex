import { supabase } from "@/lib/supabase/client";
import { parseDbDecimal } from "@/lib/validation";

export type CustomerReceiptCustomerOption = {
  id: string;
  customer_code: string;
  name: string;
  status: string;
  currency_code: string;
};

export type CustomerReceiptAccountOption = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  currency_code: string;
};

export type CustomerReceiptReferenceData = {
  customers: CustomerReceiptCustomerOption[];
  accounts: CustomerReceiptAccountOption[];
};

export type CustomerReceiptInvoice = {
  invoice_id: string;
  invoice_number: string;
  order_id: string | null;
  project_id: string | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  currency_code: string;
  total_amount: string | number;
  paid_amount: string | number;
  balance_amount: string | number;
  legacy_unreconciled: boolean;
};

export type CustomerReceiptRow = {
  transaction_id: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  destination_account_id: string | null;
  destination_account_name: string | null;
  amount: string | number;
  currency_code: string;
  transaction_at: string;
  reference_no: string | null;
  notes: string | null;
  status: "draft" | "posted" | "voided";
  allocated_amount: string | number;
  invoice_count: number;
  reversal_transaction_id: string | null;
  total_count: number;
};

export type CustomerReceiptAllocationInput = {
  invoiceId: string;
  amount: string | number;
};

export type RecordCustomerReceiptInput = {
  customerId: string;
  destinationAccountId: string;
  amount: string | number;
  currencyCode: string;
  transactionAt: string;
  referenceNo?: string | null;
  notes?: string | null;
  invoiceAllocations: CustomerReceiptAllocationInput[];
  manualFxRate?: string | number | null;
  manualFxRateSource?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

function moneyDecimal(value: string | number, label: string) {
  const parsed = parseDbDecimal(value, { precision: 18, scale: 4, min: 0.0001, allowNull: false });
  if (parsed.error || parsed.value === null) throw new Error(`${label}: ${parsed.error || "A value is required."}`);
  return parsed.value;
}

function fxDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = parseDbDecimal(value, { precision: 24, scale: 10, min: 0.0000000001, allowNull: false });
  if (parsed.error || parsed.value === null) throw new Error(`Manual FX rate: ${parsed.error || "A value is required."}`);
  return parsed.value;
}

export async function getCustomerReceiptReferenceData() {
  const { data, error } = await supabase.rpc("get_customer_receipt_reference_data");
  if (error) throw rpcError(error, "Customer Receipt reference data could not be loaded.");
  return (data ?? { customers: [], accounts: [] }) as CustomerReceiptReferenceData;
}

export async function getCustomerReceiptInvoices(customerId: string) {
  const { data, error } = await supabase.rpc("get_customer_receipt_invoices", { p_customer_id: customerId });
  if (error) throw rpcError(error, "Customer open Invoices could not be loaded.");
  return (data ?? []) as CustomerReceiptInvoice[];
}

export async function getCustomerReceiptsPage(options?: {
  limit?: number;
  offset?: number;
  customerId?: string | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_customer_receipts_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_customer_id: options?.customerId ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Customer Receipts could not be loaded.");
  return (data ?? []) as CustomerReceiptRow[];
}

export async function recordCustomerReceipt(input: RecordCustomerReceiptInput) {
  const amount = moneyDecimal(input.amount, "Receipt amount");
  const allocations = input.invoiceAllocations.map((allocation) => ({
    invoice_id: allocation.invoiceId,
    amount: moneyDecimal(allocation.amount, "Invoice allocation"),
  }));
  const manualFxRate = fxDecimal(input.manualFxRate);
  if (manualFxRate !== null && !clean(input.manualFxRateSource)) {
    throw new Error("Manual FX source / agreement is required when overriding the rate.");
  }

  const { data, error } = await supabase.rpc("record_customer_receipt", {
    p_customer_id: input.customerId,
    p_destination_account_id: input.destinationAccountId,
    p_amount: amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_transaction_at: input.transactionAt,
    p_reference_no: clean(input.referenceNo),
    p_notes: clean(input.notes),
    p_invoice_allocations: allocations,
    p_manual_fx_rate: manualFxRate,
    p_manual_fx_rate_source: clean(input.manualFxRateSource),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Customer Receipt could not be recorded.");
  return data as string;
}

export async function voidCustomerReceipt(transactionId: string, reason: string) {
  const { data, error } = await supabase.rpc("void_customer_receipt", {
    p_transaction_id: transactionId,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Customer Receipt could not be voided.");
  return data as string;
}

export async function reverseCustomerReceipt(transactionId: string, reason: string) {
  const { data, error } = await supabase.rpc("reverse_customer_receipt", {
    p_transaction_id: transactionId,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Customer Receipt could not be reversed.");
  return data as string;
}

export async function linkCustomerProjectPaymentToFinance(projectPaymentTransactionId: string, financeTransactionId: string) {
  const { data, error } = await supabase.rpc("link_customer_project_payment_to_finance", {
    p_project_payment_transaction_id: projectPaymentTransactionId,
    p_finance_transaction_id: financeTransactionId,
  });
  if (error) throw rpcError(error, "Project payment could not be reconciled to the Finance receipt.");
  return data as string;
}
