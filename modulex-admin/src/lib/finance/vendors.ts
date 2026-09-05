import { supabase } from "@/lib/supabase/client";

export type VendorStatus = "onboarding" | "active" | "inactive";
export type VendorType = "supplier" | "contractor" | "service_provider" | "other";
export type VendorContactType = "primary" | "orders" | "billing" | "remittance" | "compliance" | "other";
export type VendorSourceSystem = "vendor_catalog" | "procurement" | "vendor_invoice" | "legacy" | "manual";
export type VendorComplianceType = "w9" | "coi" | "license" | "other";
export type VendorComplianceStatus = "pending" | "valid" | "expired" | "rejected" | "not_required";
export type VendorComplianceState = VendorComplianceStatus | "missing";

export type VendorListItem = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  vendor_type: VendorType;
  status: VendorStatus;
  default_currency_code: string | null;
  remit_city: string | null;
  remit_state_region: string | null;
  remit_country_code: string | null;
  contact_count: number;
  source_identity_count: number;
  w9_status: VendorComplianceState;
  coi_status: VendorComplianceState;
  created_at: string;
  updated_at: string;
  total_count: number;
};

export type VendorRecord = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  normalized_name: string;
  vendor_type: VendorType;
  status: VendorStatus;
  default_currency_code: string | null;
  payment_term_id: string | null;
  remit_to_name: string | null;
  remit_address_line1: string | null;
  remit_address_line2: string | null;
  remit_city: string | null;
  remit_state_region: string | null;
  remit_postal_code: string | null;
  remit_country_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorContact = {
  id: string;
  vendor_id: string;
  contact_type: VendorContactType;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  is_active: boolean;
};

export type VendorSourceIdentity = {
  id: string;
  vendor_id: string;
  source_system: VendorSourceSystem;
  source_code: string;
  source_name_snapshot: string | null;
  is_primary: boolean;
};

export type VendorComplianceDocument = {
  id: string;
  vendor_id: string;
  document_type: VendorComplianceType;
  status: VendorComplianceStatus;
  effective_status: VendorComplianceState;
  title: string;
  document_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  verified_at: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  notes: string | null;
  is_active: boolean;
};

export type VendorDetail = {
  vendor: VendorRecord;
  contacts: VendorContact[];
  source_identities: VendorSourceIdentity[];
  compliance_documents: VendorComplianceDocument[];
  compliance_summary: {
    w9: VendorComplianceState;
    coi: VendorComplianceState;
  };
};

export type VendorSourceCandidate = {
  source_system: VendorSourceSystem;
  source_code: string;
  source_name_snapshot: string | null;
  occurrence_count: number;
  mapped_vendor_id: string | null;
  mapped_vendor_code: string | null;
  mapped_vendor_name: string | null;
};

export type VendorInput = {
  code: string;
  legalName: string;
  displayName: string;
  vendorType: VendorType;
  defaultCurrencyCode?: string | null;
  paymentTermId?: string | null;
  remitToName?: string | null;
  remitAddressLine1?: string | null;
  remitAddressLine2?: string | null;
  remitCity?: string | null;
  remitStateRegion?: string | null;
  remitPostalCode?: string | null;
  remitCountryCode?: string | null;
  notes?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

function rpcError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function getVendorsPage(options?: {
  limit?: number;
  offset?: number;
  status?: VendorStatus | null;
  search?: string | null;
}) {
  const { data, error } = await supabase.rpc("get_vendors_page", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
    p_status: options?.status ?? null,
    p_search: clean(options?.search),
  });
  if (error) throw rpcError(error, "Vendors could not be loaded.");
  return (data ?? []) as VendorListItem[];
}

export async function getVendorDetail(vendorId: string) {
  const { data, error } = await supabase.rpc("get_vendor_detail", { p_vendor_id: vendorId });
  if (error) throw rpcError(error, "Vendor detail could not be loaded.");
  return data as VendorDetail;
}

export async function getVendorSourceCandidates() {
  const { data, error } = await supabase.rpc("get_vendor_source_candidates");
  if (error) throw rpcError(error, "Vendor source identities could not be loaded.");
  return (data ?? []) as VendorSourceCandidate[];
}

export async function createVendor(input: VendorInput, status: VendorStatus = "onboarding") {
  const { data, error } = await supabase.rpc("create_vendor", {
    p_code: input.code.trim(),
    p_legal_name: input.legalName.trim(),
    p_display_name: input.displayName.trim(),
    p_vendor_type: input.vendorType,
    p_status: status,
    p_default_currency_code: clean(input.defaultCurrencyCode)?.toUpperCase() ?? null,
    p_payment_term_id: input.paymentTermId || null,
    p_remit_to_name: clean(input.remitToName),
    p_remit_address_line1: clean(input.remitAddressLine1),
    p_remit_address_line2: clean(input.remitAddressLine2),
    p_remit_city: clean(input.remitCity),
    p_remit_state_region: clean(input.remitStateRegion),
    p_remit_postal_code: clean(input.remitPostalCode),
    p_remit_country_code: clean(input.remitCountryCode)?.toUpperCase() ?? null,
    p_notes: clean(input.notes),
  });
  if (error) throw rpcError(error, "Vendor could not be created.");
  return data as string;
}

export async function updateVendor(vendorId: string, input: VendorInput) {
  const { data, error } = await supabase.rpc("update_vendor", {
    p_vendor_id: vendorId,
    p_code: input.code.trim(),
    p_legal_name: input.legalName.trim(),
    p_display_name: input.displayName.trim(),
    p_vendor_type: input.vendorType,
    p_default_currency_code: clean(input.defaultCurrencyCode)?.toUpperCase() ?? null,
    p_payment_term_id: input.paymentTermId || null,
    p_remit_to_name: clean(input.remitToName),
    p_remit_address_line1: clean(input.remitAddressLine1),
    p_remit_address_line2: clean(input.remitAddressLine2),
    p_remit_city: clean(input.remitCity),
    p_remit_state_region: clean(input.remitStateRegion),
    p_remit_postal_code: clean(input.remitPostalCode),
    p_remit_country_code: clean(input.remitCountryCode)?.toUpperCase() ?? null,
    p_notes: clean(input.notes),
  });
  if (error) throw rpcError(error, "Vendor could not be updated.");
  return data as string;
}

export async function setVendorStatus(vendorId: string, status: VendorStatus) {
  const { data, error } = await supabase.rpc("set_vendor_status", { p_vendor_id: vendorId, p_status: status });
  if (error) throw rpcError(error, "Vendor status could not be updated.");
  return data as string;
}

export async function upsertVendorContact(input: {
  vendorId: string;
  contactId?: string | null;
  contactType: VendorContactType;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
}) {
  const { data, error } = await supabase.rpc("upsert_vendor_contact", {
    p_vendor_id: input.vendorId,
    p_contact_id: input.contactId ?? null,
    p_contact_type: input.contactType,
    p_name: input.name.trim(),
    p_title: clean(input.title),
    p_email: clean(input.email),
    p_phone: clean(input.phone),
    p_is_primary: input.isPrimary ?? false,
    p_is_active: input.isActive ?? true,
  });
  if (error) throw rpcError(error, "Vendor contact could not be saved.");
  return data as string;
}

export async function mapVendorSourceIdentity(input: {
  vendorId: string;
  sourceSystem: VendorSourceSystem;
  sourceCode: string;
  sourceNameSnapshot?: string | null;
  isPrimary?: boolean;
}) {
  const { data, error } = await supabase.rpc("map_vendor_source_identity", {
    p_vendor_id: input.vendorId,
    p_source_system: input.sourceSystem,
    p_source_code: input.sourceCode.trim(),
    p_source_name_snapshot: clean(input.sourceNameSnapshot),
    p_is_primary: input.isPrimary ?? false,
  });
  if (error) throw rpcError(error, "Vendor source identity could not be mapped.");
  return data as string;
}

export async function upsertVendorComplianceDocument(input: {
  vendorId: string;
  documentId?: string | null;
  documentType: VendorComplianceType;
  status: VendorComplianceStatus;
  title: string;
  documentNumber?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const { data, error } = await supabase.rpc("upsert_vendor_compliance_document", {
    p_vendor_id: input.vendorId,
    p_document_id: input.documentId ?? null,
    p_document_type: input.documentType,
    p_status: input.status,
    p_title: input.title.trim(),
    p_document_number: clean(input.documentNumber),
    p_issued_on: input.issuedOn || null,
    p_expires_on: input.expiresOn || null,
    p_storage_bucket: clean(input.storageBucket),
    p_storage_path: clean(input.storagePath),
    p_file_name: clean(input.fileName),
    p_mime_type: clean(input.mimeType),
    p_file_size_bytes: input.fileSizeBytes ?? null,
    p_notes: clean(input.notes),
    p_is_active: input.isActive ?? true,
  });
  if (error) throw rpcError(error, "Vendor compliance document could not be saved.");
  return data as string;
}
