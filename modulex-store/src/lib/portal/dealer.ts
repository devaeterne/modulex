import { requireDealerPortalContext } from "@/lib/dealer/auth";
import type { PortalOrderDetail } from "@/lib/portal/orders";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DealerPricingContext = {
  pricing_enabled: boolean;
  price_group_name?: string;
  currency_code?: string;
};

export type DealerCatalogVariant = {
  id: string;
  sku: string;
  colorCode: string | null;
  colorName: string | null;
  priceAvailable: boolean;
  price?: number | null;
  currencyCode?: string | null;
};

export type DealerCatalogProduct = {
  id: string;
  baseProductCode: string;
  slug: string;
  displayName: string;
  shortDescription: string | null;
  category: string | null;
  brand: string | null;
  isFeatured: boolean;
  primaryImageUrl: string | null;
  variants: DealerCatalogVariant[];
};

export type DealerPortalOrderItem = PortalOrderDetail["items"][number] & {
  unit_price?: number;
  discount_percent?: number;
  discount_amount?: number;
  line_subtotal?: number;
  line_total?: number;
};

export type DealerPortalOrderDetail = Omit<PortalOrderDetail, "items"> & {
  pricing_enabled: boolean;
  currency_code?: string;
  subtotal?: number;
  discount_amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount?: number;
  items: DealerPortalOrderItem[];
};

export type DealerDocumentSummary = {
  id: string;
  document_type: string | null;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  description: string | null;
  created_at: string;
};

export type DealerDocumentDownload = DealerDocumentSummary & {
  storage_bucket: string;
  storage_path: string;
};

export type DealerAccountAddress = {
  id: string;
  address_name: string;
  company_name: string | null;
  contact_name: string | null;
  address_line_1: string;
  address_line_2: string | null;
  postal_code: string | null;
  city: string;
  state_region: string | null;
  country_code: string;
  phone: string | null;
  address_type: string;
  is_default_billing: boolean;
  is_default_shipping: boolean;
};

export type DealerAccount = {
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  country_code: string | null;
  currency_code: string;
  customer_since: string | null;
  price_group_name: string | null;
  addresses: DealerAccountAddress[];
};

type RpcResponse<T> = { ok?: boolean } & T;

async function createAuthorizedDealerClient() {
  await requireDealerPortalContext();
  return createServerSupabaseClient();
}

export async function getDealerPricingContext(): Promise<DealerPricingContext> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_pricing_context");
  if (error) throw new Error("Unable to load Dealer pricing context.");
  const response = data as RpcResponse<DealerPricingContext> | null;
  if (!response?.ok) return { pricing_enabled: false };
  return {
    pricing_enabled: Boolean(response.pricing_enabled),
    price_group_name: response.price_group_name,
    currency_code: response.currency_code,
  };
}

export async function getDealerCatalogProducts(query?: string): Promise<DealerCatalogProduct[]> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_catalog_products", {
    p_query: query?.trim() || null,
    p_color_code: null,
    p_limit: 48,
    p_offset: 0,
  });
  if (error) throw new Error("Unable to load Dealer catalog.");
  const response = data as RpcResponse<{ products?: DealerCatalogProduct[] }> | null;
  return response?.ok && Array.isArray(response.products) ? response.products : [];
}

export async function getDealerProductBySlug(slug: string): Promise<DealerCatalogProduct | null> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_product_by_slug", { p_slug: slug });
  if (error) throw new Error("Unable to load Dealer product.");
  const response = data as RpcResponse<{ product?: DealerCatalogProduct }> | null;
  return response?.ok && response.product ? response.product : null;
}

export async function getDealerOrder(id: string): Promise<DealerPortalOrderDetail | null> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_order", { p_order_id: id });
  if (error) throw new Error("Unable to load Dealer order.");
  const response = data as RpcResponse<{ pricing_enabled?: boolean; order?: Omit<DealerPortalOrderDetail, "pricing_enabled"> }> | null;
  if (!response?.ok || !response.order) return null;
  return { ...response.order, pricing_enabled: Boolean(response.pricing_enabled) };
}

export async function getDealerDocuments(): Promise<DealerDocumentSummary[]> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_documents");
  if (error) throw new Error("Unable to load Dealer documents.");
  const response = data as RpcResponse<{ documents?: DealerDocumentSummary[] }> | null;
  return response?.ok && Array.isArray(response.documents) ? response.documents : [];
}

export async function getDealerDocumentDownload(id: string): Promise<DealerDocumentDownload | null> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_document", { p_document_id: id });
  if (error) throw new Error("Unable to authorize Dealer document.");
  const response = data as RpcResponse<{ document?: DealerDocumentDownload }> | null;
  return response?.ok && response.document ? response.document : null;
}

export async function getDealerAccount(): Promise<DealerAccount | null> {
  const supabase = await createAuthorizedDealerClient();
  const { data, error } = await supabase.rpc("get_store_dealer_account");
  if (error) throw new Error("Unable to load Dealer account.");
  const response = data as RpcResponse<{ account?: DealerAccount }> | null;
  return response?.ok && response.account ? response.account : null;
}
