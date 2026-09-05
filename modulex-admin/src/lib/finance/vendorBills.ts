import { supabase } from "@/lib/supabase/client";

export type VendorBillDocumentStatus = "draft" | "open" | "void";
export type VendorBillPaymentStatus = "draft" | "unpaid" | "partially_paid" | "paid" | "void";

export type VendorBillListItem = {
  id: string;
  vendor_id: string;
  vendor_code: string;
  vendor_name_snapshot: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  currency_code: string;
  status: VendorBillDocumentStatus;
  payment_status: VendorBillPaymentStatus;
  paid_amount: number;
  outstanding_amount: number;
  purchase_order_reference: string | null;
  base_currency_code: string | null;
  base_amount: number | null;
  project_count: number;
  order_count: number;
  created_at: string;
  total_count: number;
};

export type VendorBillLine = {
  id: string;
  invoice_id: string;
  line_no: number;
  description: string;
  quantity: number | null;
  unit_amount: number | null;
  amount: number;
  project_id: string | null;
  order_id: string | null;
  procurement_commitment_id: string | null;
  purchase_order_reference: string | null;
  notes: string | null;
};

export type VendorBillDetail = {
  invoice: VendorBillListItem & Record<string, unknown>;
  vendor: { id: string; code: string; display_name: string; status: string } | null;
  lines: VendorBillLine[];
  procurement_allocations: Array<Record<string, unknown>>;
  payment_allocations: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
};

export type VendorBillDraftInput = {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  currencyCode: string;
  paymentTermId?: string | null;
  purchaseOrderReference?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
};

export type VendorBillLineInput = {
  description: string;
  quantity?: number | null;
  unitAmount?: number | null;
  amount: number;
  projectId?: string | null;
  orderId?: string | null;
  procurementCommitmentId?: string | null;
  purchaseOrderReference?: string | null;
  notes?: string | null;
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

export async function getVendorBillsPage(options?: {
  limit?: number;
  offset?: number;
  vendorId?: string | null;
  status?: VendorBillDocumentStatus | VendorBillPaymentStatus | null;
  search?: string | null;
  dueBefore?: string | null;
  projectId?: string | null;
  orderId?: string | null;
  currencyCode?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_vendor_invoices_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_vendor_id: options?.vendorId ?? null,
    p_status: options?.status ?? null,
    p_search: clean(options?.search),
    p_due_before: options?.dueBefore || null,
    p_project_id: options?.projectId ?? null,
    p_order_id: options?.orderId ?? null,
    p_currency_code: clean(options?.currencyCode)?.toUpperCase() ?? null,
  });
  if (error) throw rpcError(error, "Vendor Bills could not be loaded.");
  return (data ?? []) as VendorBillListItem[];
}

export async function getVendorBillDetail(invoiceId: string) {
  const { data, error } = await supabase.rpc("get_vendor_invoice_detail", { p_invoice_id: invoiceId });
  if (error) throw rpcError(error, "Vendor Bill detail could not be loaded.");
  return data as VendorBillDetail;
}

export async function createVendorBillDraft(input: VendorBillDraftInput) {
  const { data, error } = await supabase.rpc("create_vendor_invoice_draft", {
    p_vendor_id: input.vendorId,
    p_invoice_number: input.invoiceNumber.trim(),
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate || null,
    p_total_amount: input.totalAmount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_payment_term_id: input.paymentTermId ?? null,
    p_purchase_order_reference: clean(input.purchaseOrderReference),
    p_reference_no: clean(input.referenceNo),
    p_notes: clean(input.notes),
    p_source_document_bucket: null,
    p_source_document_path: null,
    p_source_document_file_name: null,
    p_source_document_mime_type: null,
    p_source_document_size_bytes: null,
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor Bill draft could not be created.");
  return data as string;
}

export async function updateVendorBillDraft(invoiceId: string, input: VendorBillDraftInput) {
  const { data, error } = await supabase.rpc("update_vendor_invoice_draft", {
    p_invoice_id: invoiceId,
    p_invoice_number: input.invoiceNumber.trim(),
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate || null,
    p_total_amount: input.totalAmount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_payment_term_id: input.paymentTermId ?? null,
    p_purchase_order_reference: clean(input.purchaseOrderReference),
    p_reference_no: clean(input.referenceNo),
    p_notes: clean(input.notes),
  });
  if (error) throw rpcError(error, "Vendor Bill draft could not be updated.");
  return data as string;
}

export async function setVendorBillLines(invoiceId: string, lines: VendorBillLineInput[]) {
  const { data, error } = await supabase.rpc("set_vendor_invoice_lines", {
    p_invoice_id: invoiceId,
    p_lines: lines.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity ?? null,
      unit_amount: line.unitAmount ?? null,
      amount: line.amount,
      project_id: line.projectId ?? null,
      order_id: line.orderId ?? null,
      procurement_commitment_id: line.procurementCommitmentId ?? null,
      purchase_order_reference: clean(line.purchaseOrderReference),
      notes: clean(line.notes),
    })),
  });
  if (error) throw rpcError(error, "Vendor Bill lines could not be saved.");
  return Number(data ?? 0);
}

export async function openVendorBill(invoiceId: string, manualFxRate?: number | null, manualFxSource?: string | null) {
  const { data, error } = await supabase.rpc("open_vendor_invoice", {
    p_invoice_id: invoiceId,
    p_manual_fx_rate: manualFxRate ?? null,
    p_manual_fx_rate_source: clean(manualFxSource),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor Bill could not be opened.");
  return data as string;
}

export async function voidVendorBill(invoiceId: string, reason: string) {
  const { data, error } = await supabase.rpc("void_vendor_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor Bill could not be voided.");
  return data as string;
}

export async function deleteVendorBillDraft(invoiceId: string) {
  const { data, error } = await supabase.rpc("delete_vendor_invoice_draft", { p_invoice_id: invoiceId });
  if (error) throw rpcError(error, "Vendor Bill draft could not be deleted.");
  return data as string;
}

export async function allocateVendorPayment(invoiceId: string, financeTransactionId: string, amount: number) {
  const { data, error } = await supabase.rpc("allocate_vendor_payment_to_invoice", {
    p_invoice_id: invoiceId,
    p_finance_transaction_id: financeTransactionId,
    p_amount: amount,
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor payment could not be allocated to the bill.");
  return data as string;
}

export async function reverseVendorPaymentAllocation(allocationId: string, reversalFinanceTransactionId: string, reason: string) {
  const { data, error } = await supabase.rpc("reverse_vendor_invoice_payment_allocation", {
    p_allocation_id: allocationId,
    p_reversal_finance_transaction_id: reversalFinanceTransactionId,
    p_reason: reason.trim(),
    p_idempotency_key: newIdempotencyKey(),
  });
  if (error) throw rpcError(error, "Vendor payment allocation could not be reversed.");
  return data as string;
}