import { getVendorsPage, type VendorListItem } from "@/lib/finance/vendors";
import { supabase } from "@/lib/supabase/client";

const ENTITY_DOCUMENT_BUCKET = "entity-documents";
const MAX_VENDOR_PDF_BYTES = 25 * 1024 * 1024;

export type CustomVendorCabinetDraft = {
  vendorId: string;
  vendorName: string;
  lineName: string;
  totalCost: number;
  markupPercent: number;
  sellPrice: number;
  file: File;
};

export type UploadedCustomVendorCabinetDocument = {
  documentId: string;
  storagePath: string;
};

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

export async function loadActiveCustomVendorCabinetVendors(): Promise<VendorListItem[]> {
  return getVendorsPage({ limit: 200, offset: 0, status: "active" });
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

  return { documentId: row.id, storagePath };
}

export async function cleanupCustomVendorCabinetDocument(document: UploadedCustomVendorCabinetDocument) {
  const deactivation = await supabase.rpc("deactivate_entity_document", { p_document_id: document.documentId });
  if (deactivation.error) return;
  await supabase.storage.from(ENTITY_DOCUMENT_BUCKET).remove([document.storagePath]);
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
