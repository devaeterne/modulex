import { supabase } from "@/lib/supabase/client";

export type ApAgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export type ApAgingRow = {
  invoice_id: string;
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  days_past_due: number;
  aging_bucket: ApAgingBucket;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency_code: string;
  base_currency_code: string;
  base_outstanding_amount: number | null;
  scheduled_amount: number;
  base_scheduled_amount: number | null;
  scheduled_remaining_amount: number;
  purchase_order_reference: string | null;
  payment_status: string;
  unconverted: boolean;
  total_count: number;
};

export type ApAgingSummary = {
  as_of: string;
  vendor_id: string | null;
  base_currency_code: string;
  open_bill_count: number;
  overdue_bill_count: number;
  open_ap_base_amount: number | null;
  overdue_base_amount: number | null;
  due_soon_base_amount: number | null;
  scheduled_base_amount: number | null;
  unconverted_bill_count: number;
  aging_buckets: Record<ApAgingBucket, number | null>;
  checks: {
    issued_count: number;
    issued_base_amount: number | null;
    cleared_count: number;
    cleared_base_amount: number | null;
    returned_count: number;
    returned_base_amount: number | null;
    unconverted_count: number;
  };
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function getApAgingPage(options?: {
  asOf?: string | null;
  limit?: number;
  offset?: number;
  vendorId?: string | null;
  bucket?: ApAgingBucket | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_ap_aging_page", {
    p_as_of: options?.asOf || null,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_vendor_id: options?.vendorId ?? null,
    p_bucket: options?.bucket ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "AP Aging could not be loaded.");
  return (data ?? []) as ApAgingRow[];
}

export async function getApAgingSummary(options?: {
  asOf?: string | null;
  vendorId?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_ap_aging_summary", {
    p_as_of: options?.asOf || null,
    p_vendor_id: options?.vendorId ?? null,
  });
  if (error) throw rpcError(error, "AP summary could not be loaded.");
  return data as ApAgingSummary;
}
