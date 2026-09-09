import { supabase } from "@/lib/supabase/client";

export type SalesProductionPaymentStatus =
  | "not_invoiced"
  | "open"
  | "partially_paid"
  | "overdue"
  | "paid";

export type SalesProductionSummary = {
  currency_code: string;
  mixed_currency: boolean;
  sales: number | null;
  jobs: number;
  sqft: number;
  avg_ticket: number | null;
  open_balance: number | null;
  jobs_with_balance: number;
  needs_attention: number;
};

export type SalesProductionTrendPoint = {
  period_start: string;
  jobs: number;
  sqft: number;
  currency_code: string;
  sales: number | null;
  mixed_currency: boolean;
};

export type SalesProductionSalespersonRow = {
  sales_rep_id: string | null;
  salesperson_name: string;
  jobs: number;
  sqft: number;
  currency_code: string;
  sales: number | null;
  open_balance: number | null;
  mixed_currency: boolean;
};

export type SalesProductionMaterialRow = {
  material: string;
  jobs: number;
  sqft: number;
};

export type SalesProductionLocationRow = {
  location: string;
  jobs: number;
  sqft: number;
  currency_code: string;
  sales: number | null;
  open_balance: number | null;
  mixed_currency: boolean;
};

export type SalesProductionPaymentRow = {
  status: SalesProductionPaymentStatus;
  jobs: number;
  currency_code: string;
  open_balance: number | null;
  mixed_currency: boolean;
};

export type SalesProductionAttentionRow = {
  order_id: string;
  order_number: string;
  order_date: string;
  customer_name: string;
  salesperson_name: string;
  location: string;
  payment_status: SalesProductionPaymentStatus;
  currency_code: string;
  open_balance: number;
  overdue_balance: number;
  reasons: string[];
};

export type SalesProductionJobRow = {
  order_id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  project_id: string | null;
  project_number: string | null;
  project_name: string | null;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  sales_rep_id: string | null;
  salesperson_name: string;
  location: string;
  currency_code: string;
  sales_amount: number;
  sqft: number;
  material_types: string[];
  material_names: string[];
  invoice_count: number;
  invoiced_amount: number;
  paid_amount: number;
  open_balance: number;
  overdue_balance: number;
  payment_status: SalesProductionPaymentStatus;
  needs_attention: boolean;
};

export type SalesProductionFilterOptions = {
  salespeople: Array<{ id: string; name: string }>;
  materials: string[];
  locations: string[];
  payment_statuses: SalesProductionPaymentStatus[];
};

export type SalesProductionReport = {
  from_date: string | null;
  to_date: string | null;
  summary: SalesProductionSummary;
  trend: SalesProductionTrendPoint[];
  salespeople: SalesProductionSalespersonRow[];
  materials: SalesProductionMaterialRow[];
  locations: SalesProductionLocationRow[];
  payment_statuses: SalesProductionPaymentRow[];
  attention: SalesProductionAttentionRow[];
  rows: SalesProductionJobRow[];
  total_count: number;
  filter_options: SalesProductionFilterOptions;
};

export type SalesProductionReportFilters = {
  from?: string | null;
  to?: string | null;
  salesRepId?: string | null;
  material?: string | null;
  location?: string | null;
  paymentStatus?: SalesProductionPaymentStatus | null;
  limit?: number;
  offset?: number;
};

function normalizeError(error: { message?: string } | null) {
  return new Error(error?.message || "Sales & Production report could not be loaded.");
}

function clampPageSize(value: number | undefined) {
  return Math.min(Math.max(value ?? 50, 1), 200);
}

export async function getSalesProductionReport(options: SalesProductionReportFilters = {}) {
  const { data, error } = await supabase.rpc("get_sales_production_report", {
    p_from: options.from || null,
    p_to: options.to || null,
    p_sales_rep_id: options.salesRepId || null,
    p_material: options.material?.trim() || null,
    p_location: options.location?.trim() || null,
    p_payment_status: options.paymentStatus || null,
    p_limit: clampPageSize(options.limit),
    p_offset: Math.max(options.offset ?? 0, 0),
  });

  if (error) throw normalizeError(error);
  return data as SalesProductionReport;
}