import { supabase } from "@/lib/supabase/client";

export type VendorPaymentStatus = "draft" | "posted" | "voided";
export type PaymentInstrumentStatus = "issued" | "cleared" | "voided" | "returned";

export type VendorPaymentVendorOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  currency_code: string | null;
};

export type VendorPaymentMethodOption = {
  id: string;
  system_key: string;
  name: string;
};

export type VendorPaymentAccountOption = {
  id: string;
  name: string;
  code: string;
  currency_code: string;
  account_type: string;
};

export type VendorPaymentReferenceData = {
  vendors: VendorPaymentVendorOption[];
  payment_methods: VendorPaymentMethodOption[];
  accounts: VendorPaymentAccountOption[];
};

export type VendorPaymentListItem = {
  id: string;
  vendor_id: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  source_account_id: string | null;
  source_account_name: string | null;
  payment_method_id: string | null;
  payment_method_key: string | null;
  payment_method_name: string | null;
  amount: number;
  currency_code: string;
  transaction_at: string;
  reference_no: string | null;
  notes: string | null;
  status: VendorPaymentStatus;
  posted_at: string | null;
  instrument_id: string | null;
  instrument_type: string | null;
  instrument_number: string | null;
  instrument_status: PaymentInstrumentStatus | null;
  issued_at: string | null;
  cleared_at: string | null;
  voided_at: string | null;
  returned_at: string | null;
  allocated_amount: number;
  unapplied_amount: number;
  reversal_transaction_id: string | null;
  total_count: number;
};

export type VendorPaymentDetail = {
  transaction: Record<string, unknown> & {
    id: string;
    amount: number;
    currency_code: string;
    status: VendorPaymentStatus;
    allocated_amount: number;
    unapplied_amount: number;
  };
  vendor: Record<string, unknown> | null;
  payment_method: Record<string, unknown> | null;
  instrument: (Record<string, unknown> & { status?: PaymentInstrumentStatus; instrument_number?: string }) | null;
  bill_allocations: Array<Record<string, unknown>>;
  instrument_audit: Array<Record<string, unknown>>;
  reversal: Record<string, unknown> | null;
};

export type VendorPaymentDraftInput = {
  vendorId: string;
  sourceAccountId: string;
  paymentMethodId: string;
  amount: number;
  currencyCode: string;
  transactionAt: string;
  referenceNo?: string | null;
  notes?: string | null;
};

export type VendorBillAllocationInput = {
  invoice_id: string;
  amount: number;
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

export async function getVendorPaymentReferenceData() {
  const { data, error } = await supabase.rpc("get_vendor_payment_reference_data");
  if (error) throw rpcError(error, "Vendor Payment reference data could not be loaded.");
  return data as VendorPaymentReferenceData;
}

export async function getVendorPaymentsPage(options?: {
  limit?: number;
  offset?: number;
  vendorId?: string | null;
  status?: VendorPaymentStatus | null;
  paymentMethodId?: string | null;
  instrumentStatus?: PaymentInstrumentStatus | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_vendor_payments_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_vendor_id: options?.vendorId ?? null,
    p_status: options?.status ?? null,
    p_payment_method_id: options?.paymentMethodId ?? null,
    p_instrument_status: options?.instrumentStatus ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Vendor Payments could not be loaded.");
  return (data ?? []) as VendorPaymentListItem[];
}

export async function getVendorPaymentDetail(transactionId: string) {
  const { data, error } = await supabase.rpc("get_vendor_payment_detail", { p_transaction_id: transactionId });
  if (error) throw rpcError(error, "Vendor Payment detail could not be loaded.");
  return data as VendorPaymentDetail;
}

export async function createVendorPaymentDraft(input: VendorPaymentDraftInput) {
  const { data, error } = await supabase.rpc("create_vendor_payment_draft", {
    p_vendor_id: input.vendorId,
    p_source_account_id: input.sourceAccountId,
    p_payment_method_id: input.paymentMethodId,
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_transaction_at: input.transactionAt,
    p_reference_no: clean(input.referenceNo),
    p_notes: clean(input.notes),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor Payment draft could not be created.");
  return data as string;
}

export async function postVendorPayment(input: {
  transactionId: string;
  billAllocations?: VendorBillAllocationInput[];
  checkNumber?: string | null;
  issuedAt?: string | null;
  instrumentReference?: string | null;
  instrumentNotes?: string | null;
  manualFxRate?: number | null;
  manualFxSource?: string | null;
}) {
  const { data, error } = await supabase.rpc("post_vendor_payment", {
    p_transaction_id: input.transactionId,
    p_bill_allocations: input.billAllocations ?? [],
    p_check_number: clean(input.checkNumber),
    p_issued_at: input.issuedAt ?? null,
    p_instrument_reference: clean(input.instrumentReference),
    p_instrument_notes: clean(input.instrumentNotes),
    p_manual_fx_rate: input.manualFxRate ?? null,
    p_manual_fx_rate_source: clean(input.manualFxSource),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor Payment could not be posted.");
  return data as string;
}

export async function deleteVendorPaymentDraft(transactionId: string) {
  const { data, error } = await supabase.rpc("delete_vendor_payment_draft", { p_transaction_id: transactionId });
  if (error) throw rpcError(error, "Vendor Payment draft could not be deleted.");
  return data as string;
}

export async function clearVendorPaymentInstrument(transactionId: string, clearedAt: string, referenceNo?: string | null, notes?: string | null) {
  const { data, error } = await supabase.rpc("clear_vendor_payment_instrument", {
    p_transaction_id: transactionId,
    p_cleared_at: clearedAt,
    p_reference_no: clean(referenceNo),
    p_notes: clean(notes),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Check could not be cleared.");
  return data as string;
}

export async function reverseVendorPayment(transactionId: string, reason: string) {
  const { data, error } = await supabase.rpc("reverse_vendor_payment", {
    p_transaction_id: transactionId,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor Payment could not be reversed.");
  return data as string;
}

export async function voidVendorPaymentInstrument(transactionId: string, voidedAt: string, reason: string) {
  const { data, error } = await supabase.rpc("void_vendor_payment_instrument", {
    p_transaction_id: transactionId,
    p_voided_at: voidedAt,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Check could not be voided.");
  return data as string;
}

export async function returnVendorPaymentInstrument(transactionId: string, returnedAt: string, reason: string) {
  const { data, error } = await supabase.rpc("return_vendor_payment_instrument", {
    p_transaction_id: transactionId,
    p_returned_at: returnedAt,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Check could not be returned.");
  return data as string;
}
