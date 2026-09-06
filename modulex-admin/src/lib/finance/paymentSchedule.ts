import { supabase } from "@/lib/supabase/client";

export type PaymentScheduleStatus = "planned" | "cancelled";
export type PaymentScheduleDisplayStatus = PaymentScheduleStatus | "overdue" | "settled";

export type PaymentScheduleVendorOption = {
  id: string;
  code: string;
  name: string;
  currency_code: string | null;
};

export type PaymentScheduleBillOption = {
  id: string;
  vendor_id: string;
  invoice_number: string;
  vendor_name: string;
  due_date: string | null;
  total_amount: number;
  currency_code: string;
  paid_amount: number;
  outstanding_amount: number;
  scheduled_amount: number;
  unscheduled_amount: number;
};

export type PaymentScheduleMethodOption = {
  id: string;
  system_key: string;
  name: string;
};

export type PaymentScheduleAccountOption = {
  id: string;
  name: string;
  code: string;
  currency_code: string;
  account_type: string;
};

export type PaymentScheduleReferenceData = {
  vendors: PaymentScheduleVendorOption[];
  bills: PaymentScheduleBillOption[];
  payment_methods: PaymentScheduleMethodOption[];
  accounts: PaymentScheduleAccountOption[];
};

export type PaymentScheduleListItem = {
  id: string;
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  invoice_id: string;
  invoice_number: string;
  due_date: string | null;
  scheduled_payment_date: string;
  planned_amount: number;
  currency_code: string;
  payment_method_id: string | null;
  payment_method_name: string | null;
  source_account_id: string | null;
  source_account_name: string | null;
  status: PaymentScheduleStatus;
  display_status: PaymentScheduleDisplayStatus;
  notes: string | null;
  bill_total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  active_scheduled_amount: number;
  scheduled_remaining_amount: number;
  created_at: string;
  updated_at: string;
  total_count: number;
};

export type PaymentScheduleInput = {
  vendorId: string;
  invoiceId: string;
  scheduledPaymentDate: string;
  plannedAmount: number;
  currencyCode: string;
  paymentMethodId?: string | null;
  sourceAccountId?: string | null;
  notes?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function getPaymentScheduleReferenceData() {
  const { data, error } = await supabase.rpc("get_vendor_payment_schedule_reference_data");
  if (error) throw rpcError(error, "Payment Schedule reference data could not be loaded.");
  return data as PaymentScheduleReferenceData;
}

export async function getPaymentSchedulesPage(options?: {
  limit?: number;
  offset?: number;
  vendorId?: string | null;
  invoiceId?: string | null;
  status?: PaymentScheduleStatus | "overdue" | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_vendor_payment_schedules_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_vendor_id: options?.vendorId ?? null,
    p_invoice_id: options?.invoiceId ?? null,
    p_status: options?.status ?? null,
    p_date_from: options?.dateFrom || null,
    p_date_to: options?.dateTo || null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Payment Schedule could not be loaded.");
  return (data ?? []) as PaymentScheduleListItem[];
}

export async function createPaymentSchedule(input: PaymentScheduleInput) {
  const { data, error } = await supabase.rpc("create_vendor_payment_schedule", {
    p_vendor_id: input.vendorId,
    p_invoice_id: input.invoiceId,
    p_scheduled_payment_date: input.scheduledPaymentDate,
    p_planned_amount: input.plannedAmount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_payment_method_id: input.paymentMethodId ?? null,
    p_source_account_id: input.sourceAccountId ?? null,
    p_notes: clean(input.notes),
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw rpcError(error, "Payment Schedule could not be created.");
  return data as string;
}

export async function updatePaymentSchedule(scheduleId: string, input: Omit<PaymentScheduleInput, "vendorId" | "invoiceId" | "currencyCode">) {
  const { data, error } = await supabase.rpc("update_vendor_payment_schedule", {
    p_schedule_id: scheduleId,
    p_scheduled_payment_date: input.scheduledPaymentDate,
    p_planned_amount: input.plannedAmount,
    p_payment_method_id: input.paymentMethodId ?? null,
    p_source_account_id: input.sourceAccountId ?? null,
    p_notes: clean(input.notes),
  });
  if (error) throw rpcError(error, "Payment Schedule could not be updated.");
  return data as string;
}

export async function cancelPaymentSchedule(scheduleId: string, reason: string) {
  const { data, error } = await supabase.rpc("cancel_vendor_payment_schedule", {
    p_schedule_id: scheduleId,
    p_reason: reason.trim(),
  });
  if (error) throw rpcError(error, "Payment Schedule could not be cancelled.");
  return data as string;
}
