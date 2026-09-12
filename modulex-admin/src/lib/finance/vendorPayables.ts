import { supabase } from "@/lib/supabase/client";

export type VendorCommitmentState = "planned" | "committed" | "cancelled";
export type VendorCommitmentInvoiceState = "not_invoiced" | "partially_invoiced" | "invoiced";
export type VendorCommitmentPaymentState = "unpaid" | "partially_paid" | "paid";

export type VendorOrderCommitment = {
  order_item_id: string;
  customer_id: string;
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  project_id: string | null;
  project_number: string | null;
  project_name: string | null;
  order_id: string;
  order_number: string;
  order_status: string;
  line_description: string;
  source_document_id: string | null;
  committed_amount: number;
  currency_code: string;
  invoiced_amount: number;
  paid_amount: number;
  uninvoiced_amount: number;
  invoiced_outstanding_amount: number;
  remaining_exposure: number;
  invoice_variance: number;
  invoice_count: number;
  payment_count: number;
  commitment_status: VendorCommitmentState;
  invoice_status: VendorCommitmentInvoiceState;
  payment_status: VendorCommitmentPaymentState;
  order_date: string;
  created_at: string;
  total_count: number;
};

export type VendorInvoiceOrderAllocation = {
  id: string;
  invoice_id: string;
  invoice_line_id: string;
  order_item_id: string;
  amount: number;
  currency_code: string;
  invoice_number?: string;
  invoice_status?: string;
  invoice_date?: string;
  due_date?: string | null;
  invoice_line_no?: number;
  line_no?: number;
  line_description?: string;
  order_id?: string;
  order_number?: string;
  project_id?: string | null;
  project_number?: string | null;
  project_name?: string | null;
  created_at?: string;
};

export type VendorPaymentOrderAllocation = {
  id: string;
  invoice_payment_allocation_id: string;
  order_item_id: string;
  amount_delta: number;
  currency_code: string;
  reversal_of_allocation_id: string | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  invoice_id?: string;
  invoice_number?: string;
  finance_transaction_id?: string;
  transaction_at?: string;
  transaction_status?: string;
  transaction_reference?: string | null;
  order_number?: string;
  line_description?: string;
};

export type VendorCommitmentSourceDocument = {
  id: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_active: boolean;
};

export type VendorOrderCommitmentDetail = {
  commitment: VendorOrderCommitment;
  bill_allocations: VendorInvoiceOrderAllocation[];
  draft_allocations: VendorInvoiceOrderAllocation[];
  settlements: VendorPaymentOrderAllocation[];
  source_document: VendorCommitmentSourceDocument | null;
};

export type VendorCommitmentCandidate = {
  order_item_id: string;
  order_id: string;
  order_number: string;
  project_id: string | null;
  project_number: string | null;
  project_name: string | null;
  line_description: string;
  committed_amount: number;
  currency_code: string;
  already_invoiced_amount: number;
  available_amount: number;
  order_date: string;
};

export type VendorInvoiceCommitmentReferenceData = {
  invoice: Record<string, unknown> & {
    id: string;
    vendor_id: string;
    currency_code: string;
    status: string;
  };
  lines: Array<Record<string, unknown> & { id: string; line_no: number; description: string; amount: number }>;
  allocations: VendorInvoiceOrderAllocation[];
  candidates: VendorCommitmentCandidate[];
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function getVendorOrderCommitmentsPage(options?: {
  limit?: number;
  offset?: number;
  vendorId?: string | null;
  commitmentStatus?: VendorCommitmentState | null;
  invoiceStatus?: VendorCommitmentInvoiceState | null;
  paymentStatus?: VendorCommitmentPaymentState | null;
  projectId?: string | null;
  orderId?: string | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_vendor_order_commitments_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_vendor_id: options?.vendorId ?? null,
    p_commitment_status: options?.commitmentStatus ?? null,
    p_invoice_status: options?.invoiceStatus ?? null,
    p_payment_status: options?.paymentStatus ?? null,
    p_project_id: options?.projectId ?? null,
    p_order_id: options?.orderId ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Vendor commitments could not be loaded.");
  return (data ?? []) as VendorOrderCommitment[];
}

export async function getVendorOrderCommitmentDetail(orderItemId: string) {
  const { data, error } = await supabase.rpc("get_vendor_order_commitment_detail", {
    p_order_item_id: orderItemId,
  });
  if (error) throw rpcError(error, "Vendor commitment detail could not be loaded.");
  return data as VendorOrderCommitmentDetail;
}

export async function getVendorInvoiceCommitmentReferenceData(invoiceId: string) {
  const { data, error } = await supabase.rpc("get_vendor_invoice_commitment_reference_data", {
    p_invoice_id: invoiceId,
  });
  if (error) throw rpcError(error, "Vendor Bill commitment reference data could not be loaded.");
  return data as VendorInvoiceCommitmentReferenceData;
}

export async function setVendorInvoiceOrderAllocations(
  invoiceId: string,
  invoiceLineId: string,
  allocations: Array<{ orderItemId: string; amount: number }>,
) {
  const { data, error } = await supabase.rpc("set_vendor_invoice_order_allocations", {
    p_invoice_id: invoiceId,
    p_invoice_line_id: invoiceLineId,
    p_allocations: allocations.map((item) => ({
      order_item_id: item.orderItemId,
      amount: item.amount,
    })),
  });
  if (error) throw rpcError(error, "Vendor Bill Order allocations could not be saved.");
  return Number(data ?? 0);
}

export async function allocateVendorPaymentToOrders(
  invoicePaymentAllocationId: string,
  allocations: Array<{ orderItemId: string; amount: number }>,
) {
  const { data, error } = await supabase.rpc("allocate_vendor_payment_to_orders", {
    p_invoice_payment_allocation_id: invoicePaymentAllocationId,
    p_allocations: allocations.map((item) => ({
      order_item_id: item.orderItemId,
      amount: item.amount,
    })),
  });
  if (error) throw rpcError(error, "Vendor Payment Order settlement could not be saved.");
  return Number(data ?? 0);
}
