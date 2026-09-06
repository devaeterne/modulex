import { supabase } from "@/lib/supabase/client";

export type ArAgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";
export type CustomerBalanceState = "all" | "open" | "overdue" | "partial" | "paid";
export type InvoiceBalanceState = "all" | "open" | "paid";

export type CurrencyBalance = {
  currency_code: string;
  invoice_count?: number;
  customer_count?: number;
  open_invoice_count?: number;
  outstanding_amount: number;
};

export type ArAgingRow = {
  invoice_id: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string | null;
  project_id: string | null;
  invoice_status: string;
  invoice_date: string;
  due_date: string | null;
  days_past_due: number;
  aging_bucket: ArAgingBucket;
  total_amount: number;
  finance_paid_amount: number;
  project_paid_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency_code: string;
  base_currency_code: string;
  base_outstanding_amount: number | null;
  payment_state: "unpaid" | "partial" | "paid";
  unconverted: boolean;
  total_count: number;
};

export type ArAgingSummary = {
  as_of: string;
  customer_id: string | null;
  base_currency_code: string;
  open_invoice_count: number;
  overdue_invoice_count: number;
  partial_invoice_count: number;
  customer_count: number;
  unconverted_invoice_count: number;
  open_ar_base_amount: number | null;
  overdue_base_amount: number | null;
  aging_buckets: Record<ArAgingBucket, number | null>;
  currency_balances: CurrencyBalance[];
};

export type CustomerBalanceRow = {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  customer_status: string;
  open_invoice_count: number;
  overdue_invoice_count: number;
  partial_invoice_count: number;
  paid_invoice_count: number;
  outstanding_base_amount: number | null;
  base_currency_code: string;
  unconverted_invoice_count: number;
  currency_balances: CurrencyBalance[];
  total_count: number;
};

export type CustomerInvoiceBalanceRow = {
  invoice_id: string;
  customer_id: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string | null;
  project_id: string | null;
  invoice_status: string;
  invoice_date: string;
  due_date: string | null;
  days_past_due: number;
  aging_bucket: ArAgingBucket | null;
  total_amount: number;
  finance_paid_amount: number;
  project_paid_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency_code: string;
  base_currency_code: string;
  base_outstanding_amount: number | null;
  payment_state: "unpaid" | "partial" | "paid";
  unconverted: boolean;
  total_count: number;
};

export type CustomerPaymentHistoryRow = {
  transaction_id: string;
  original_transaction_id: string | null;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  event_type: "receipt" | "reversal";
  status: "draft" | "posted" | "voided";
  amount: number;
  effective_amount: number;
  currency_code: string;
  base_currency_code: string;
  base_amount: number | null;
  effective_base_amount: number | null;
  transaction_at: string;
  reference_no: string | null;
  notes: string | null;
  destination_account_id: string | null;
  destination_account_name: string | null;
  invoice_count: number;
  invoice_numbers: string | null;
  allocated_amount: number;
  project_payment_transaction_id: string | null;
  project_bridged: boolean;
  total_count: number;
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function getArAgingPage(options?: {
  asOf?: string | null;
  limit?: number;
  offset?: number;
  customerId?: string | null;
  bucket?: ArAgingBucket | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_ar_aging_page", {
    p_as_of: options?.asOf || null,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_customer_id: options?.customerId ?? null,
    p_bucket: options?.bucket ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "AR Aging could not be loaded.");
  return (data ?? []) as ArAgingRow[];
}

export async function getArAgingSummary(options?: {
  asOf?: string | null;
  customerId?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_ar_aging_summary", {
    p_as_of: options?.asOf || null,
    p_customer_id: options?.customerId ?? null,
  });
  if (error) throw rpcError(error, "AR summary could not be loaded.");
  return data as ArAgingSummary;
}

export async function getCustomerBalancesPage(options?: {
  asOf?: string | null;
  limit?: number;
  offset?: number;
  state?: CustomerBalanceState | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_customer_balances_page", {
    p_as_of: options?.asOf || null,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_state: options?.state ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Customer Balances could not be loaded.");
  return (data ?? []) as CustomerBalanceRow[];
}

export async function getCustomerInvoiceBalancePage(options: {
  customerId: string;
  asOf?: string | null;
  limit?: number;
  offset?: number;
  balanceState?: InvoiceBalanceState;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_customer_invoice_balance_page", {
    p_customer_id: options.customerId,
    p_as_of: options.asOf || null,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
    p_balance_state: options.balanceState ?? "all",
    p_search: clean(options.search),
  });
  if (error) throw rpcError(error, "Customer Invoice balances could not be loaded.");
  return (data ?? []) as CustomerInvoiceBalanceRow[];
}

export async function getCustomerPaymentHistoryPage(options?: {
  limit?: number;
  offset?: number;
  customerId?: string | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_customer_payment_history_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_customer_id: options?.customerId ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Customer Payment History could not be loaded.");
  return (data ?? []) as CustomerPaymentHistoryRow[];
}
