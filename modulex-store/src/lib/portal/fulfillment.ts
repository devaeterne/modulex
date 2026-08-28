import { requireStorePortalContext } from "@/lib/portal/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PortalAddressSnapshot = Record<string, unknown> | null;

export type PortalShipmentSummary = {
  id: string;
  shipment_number: string;
  order_id: string;
  order_number: string;
  status: string;
  customer_reference: string | null;
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  picking_started_at: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

export type PortalShipmentItem = {
  id: string;
  line_no: number;
  sku_snapshot: string;
  product_name_snapshot: string;
  ordered_quantity_snapshot: number;
  shipment_quantity: number;
};

export type PortalShipmentDetailData = PortalShipmentSummary & {
  shipping_address: PortalAddressSnapshot;
  items: PortalShipmentItem[];
};

export type PortalInstallationSummary = {
  id: string;
  installation_number: string;
  order_id: string;
  order_number: string;
  shipment_id: string | null;
  shipment_number: string | null;
  status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  team_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type PortalInstallationDetailData = PortalInstallationSummary & {
  address: PortalAddressSnapshot;
  notes: string | null;
  completion_notes: string | null;
};

export type PortalDashboardSummary = {
  orders: { recent: Array<Record<string, unknown>>; open_count: number };
  shipments: { recent: PortalShipmentSummary[]; active_count: number };
  installations: { recent: PortalInstallationSummary[]; active_count: number };
};

type CollectionResponse<T> = { ok?: boolean } & T;
type DetailResponse<T> = { ok?: boolean; reason?: string } & T;

async function createAuthorizedPortalClient() {
  await requireStorePortalContext();
  return createServerSupabaseClient();
}

export async function getPortalShipments(limit = 25, offset = 0): Promise<PortalShipmentSummary[]> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_shipments", { p_limit: limit, p_offset: offset });
  if (error) throw new Error("Unable to load shipments.");
  const response = data as CollectionResponse<{ shipments?: PortalShipmentSummary[] }> | null;
  return response?.ok && Array.isArray(response.shipments) ? response.shipments : [];
}

export async function getPortalShipment(id: string): Promise<PortalShipmentDetailData | null> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_shipment", { p_shipment_id: id });
  if (error) throw new Error("Unable to load shipment.");
  const response = data as DetailResponse<{ shipment?: PortalShipmentDetailData }> | null;
  return response?.ok && response.shipment ? response.shipment : null;
}

export async function getPortalInstallations(limit = 25, offset = 0): Promise<PortalInstallationSummary[]> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_installations", { p_limit: limit, p_offset: offset });
  if (error) throw new Error("Unable to load installations.");
  const response = data as CollectionResponse<{ installations?: PortalInstallationSummary[] }> | null;
  return response?.ok && Array.isArray(response.installations) ? response.installations : [];
}

export async function getPortalInstallation(id: string): Promise<PortalInstallationDetailData | null> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_installation", { p_installation_id: id });
  if (error) throw new Error("Unable to load installation.");
  const response = data as DetailResponse<{ installation?: PortalInstallationDetailData }> | null;
  return response?.ok && response.installation ? response.installation : null;
}

export async function getPortalDashboardSummary(): Promise<PortalDashboardSummary> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_dashboard_summary");
  if (error) throw new Error("Unable to load account overview.");
  const response = data as (PortalDashboardSummary & { ok?: boolean }) | null;
  if (!response?.ok) {
    return {
      orders: { recent: [], open_count: 0 },
      shipments: { recent: [], active_count: 0 },
      installations: { recent: [], active_count: 0 },
    };
  }
  return {
    orders: response.orders,
    shipments: response.shipments,
    installations: response.installations,
  };
}
