import { supabase } from "@/lib/supabase/client";

const ENTITY_DOCUMENT_BUCKET = "entity-documents";
const MAX_VENDOR_PDF_BYTES = 25 * 1024 * 1024;

export type ActiveOrderVendor = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
};

export type CustomVendorCabinetDraft = {
  vendorId: string;
  vendorName: string;
  lineName: string;
  totalCost: number;
  markupPercent: number;
  sellPrice: number;
  file: File;
};

export type CustomVendorCabinetEditDraft = Omit<CustomVendorCabinetDraft, "file"> & {
  replacementFile: File | null;
};

export type UploadedCustomVendorCabinetDocument = {
  documentId: string;
  storagePath: string;
  fileName: string;
};

export type CustomVendorCabinetDocument = UploadedCustomVendorCabinetDocument;

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned || "vendor-cabinet.pdf";
}

export function calculateCustomVendorCabinetSellPrice(totalCost: number, markupPercent: number) {
  if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error("Total Cost must be zero or greater.");
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000) {
    throw new Error("Markup % must be between 0 and 1000.");
  }
  return Math.round(totalCost * (1 + markupPercent / 100) * 10000) / 10000;
}

export async function loadActiveCustomVendorCabinetVendors(): Promise<ActiveOrderVendor[]> {
  const { data, error } = await supabase.rpc("get_active_order_vendors");
  if (error) throw error;
  return (data ?? []) as ActiveOrderVendor[];
}

export function validateCustomVendorCabinetPdf(file: File) {
  const extension = file.name.toLowerCase().endsWith(".pdf");
  if (!extension || file.type !== "application/pdf") throw new Error("Vendor PDF must be a PDF file.");
  if (file.size <= 0) throw new Error("Vendor PDF is empty.");
  if (file.size > MAX_VENDOR_PDF_BYTES) throw new Error("Vendor PDF must be 25 MiB or smaller.");
}

export async function uploadCustomVendorCabinetDocument(input: {
  orderId: string;
  vendorName: string;
  lineName: string;
  file: File;
}): Promise<UploadedCustomVendorCabinetDocument> {
  validateCustomVendorCabinetPdf(input.file);
  const storagePath = `order/${input.orderId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
  const upload = await supabase.storage.from(ENTITY_DOCUMENT_BUCKET).upload(storagePath, input.file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const registration = await supabase.rpc("register_entity_document", {
    p_entity_type: "order",
    p_entity_id: input.orderId,
    p_file_name: input.file.name,
    p_storage_path: storagePath,
    p_document_type: "other",
    p_mime_type: "application/pdf",
    p_file_size_bytes: input.file.size,
    p_description: `Vendor Cabinet quote · ${input.vendorName} · ${input.lineName}`,
  });

  if (registration.error) {
    await supabase.storage.from(ENTITY_DOCUMENT_BUCKET).remove([storagePath]);
    throw registration.error;
  }

  const row = registration.data as { id?: string } | null;
  if (!row?.id) {
    await supabase.storage.from(ENTITY_DOCUMENT_BUCKET).remove([storagePath]);
    throw new Error("Vendor PDF registration did not return a document id.");
  }

  return { documentId: row.id, storagePath, fileName: input.file.name };
}

export async function getCustomVendorCabinetDocument(documentId: string): Promise<CustomVendorCabinetDocument> {
  if (!documentId) throw new Error("Vendor Cabinet source document is missing.");
  const { data, error } = await supabase
    .from("entity_documents")
    .select("id, storage_bucket, storage_path, file_name")
    .eq("id", documentId)
    .eq("is_active", true)
    .single();
  if (error) throw error;
  if (!data || data.storage_bucket !== ENTITY_DOCUMENT_BUCKET || !data.storage_path) {
    throw new Error("Vendor Cabinet source PDF could not be resolved.");
  }
  return {
    documentId: String(data.id),
    storagePath: String(data.storage_path),
    fileName: String(data.file_name || "vendor-cabinet.pdf"),
  };
}

export async function getCustomVendorCabinetDocumentUrl(document: CustomVendorCabinetDocument) {
  const { data, error } = await supabase.storage.from(ENTITY_DOCUMENT_BUCKET).createSignedUrl(document.storagePath, 300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Vendor Cabinet PDF URL could not be created.");
  return data.signedUrl;
}

export async function removeCustomVendorCabinetDocument(document: UploadedCustomVendorCabinetDocument) {
  const deactivation = await supabase.rpc("deactivate_entity_document", { p_document_id: document.documentId });
  if (deactivation.error) throw deactivation.error;
  const removal = await supabase.storage.from(ENTITY_DOCUMENT_BUCKET).remove([document.storagePath]);
  if (removal.error) throw removal.error;
}

export async function cleanupCustomVendorCabinetDocument(document: UploadedCustomVendorCabinetDocument) {
  try {
    await removeCustomVendorCabinetDocument(document);
  } catch {
    // Best-effort rollback for failed add/edit flows; keep the original operation error authoritative.
  }
}

export async function createCustomVendorCabinetOrderLine(input: {
  orderId: string;
  vendorId: string;
  lineName: string;
  totalCost: number;
  markupPercent: number;
  documentId: string;
  orderDiscountAmount: string | number;
}) {
  const sellPrice = calculateCustomVendorCabinetSellPrice(input.totalCost, input.markupPercent);
  const { data, error } = await supabase.rpc("create_custom_vendor_cabinet_order_line", {
    p_order_id: input.orderId,
    p_vendor_id: input.vendorId,
    p_line_name: input.lineName.trim(),
    p_total_cost: input.totalCost,
    p_markup_percent: input.markupPercent,
    p_document_id: input.documentId,
    p_order_discount_amount: Number(input.orderDiscountAmount),
  });
  if (error) throw error;
  if (!data) throw new Error("Vendor Cabinet order line could not be created.");
  return { orderItemId: String(data), sellPrice };
}

export async function updateCustomVendorCabinetOrderLine(input: {
  orderItemId: string;
  vendorId: string;
  lineName: string;
  totalCost: number;
  markupPercent: number;
  documentId: string;
  orderDiscountAmount: string | number;
}) {
  const sellPrice = calculateCustomVendorCabinetSellPrice(input.totalCost, input.markupPercent);
  const { data, error } = await supabase.rpc("update_custom_vendor_cabinet_order_line", {
    p_order_item_id: input.orderItemId,
    p_vendor_id: input.vendorId,
    p_line_name: input.lineName.trim(),
    p_total_cost: input.totalCost,
    p_markup_percent: input.markupPercent,
    p_document_id: input.documentId,
    p_order_discount_amount: Number(input.orderDiscountAmount),
  });
  if (error) throw error;
  if (!data) throw new Error("Vendor Cabinet order line could not be updated.");
  return { orderItemId: String(data), sellPrice };
}
