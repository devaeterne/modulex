import { requireStorePortalContext } from "@/lib/portal/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PortalOrderSummary = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  customer_reference: string | null;
  item_count: number;
  fulfillment_type: string;
};

export type PortalOrderItem = {
  id: string;
  line_no: number;
  sku_snapshot: string;
  product_name_snapshot: string;
  quantity: number;
  countertop: PortalCountertopSummary | null;
};

export type PortalCountertopStone = { name: string | null; sku: string | null; stone_type: string | null; material_price_band: string | null; price_per_sqft: string | null; sqft: string | null; subtotal: string | null };
export type PortalCountertopEdge = { name: string | null; pricing_method: string | null; unit_price: string | null; linear_ft: string | null; applicable_measure: string | null; subtotal: string | null };
export type PortalCountertopSink = { name: string | null; sku: string | null; unit_price: string | null; subtotal: string | null };
export type PortalCountertopService = { name: string | null; pricing_method: string | null; unit_price: string | null; quantity: string | null; applicable_measure: string | null; subtotal: string | null };
export type PortalCountertopSummary = { stone: PortalCountertopStone; edge: PortalCountertopEdge | null; sink: PortalCountertopSink | null; services: PortalCountertopService[]; totals: { material_subtotal: string | null; edge_subtotal: string | null; sink_subtotal: string | null; services_subtotal: string | null; subtotal: string | null } };

export type PortalOrderDetail = PortalOrderSummary & {
  items: PortalOrderItem[];
};

type OrdersResponse = {
  ok?: boolean;
  orders?: PortalOrderSummary[];
};

type OrderResponse = {
  ok?: boolean;
  order?: PortalOrderDetail;
};

async function createAuthorizedPortalClient() {
  await requireStorePortalContext();
  return createServerSupabaseClient();
}

export async function getPortalOrders(limit = 25, offset = 0): Promise<PortalOrderSummary[]> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_orders", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error("Unable to load orders.");
  const response = data as OrdersResponse | null;
  if (!response?.ok || !Array.isArray(response.orders)) return [];
  return response.orders;
}

export async function getPortalOrder(orderId: string): Promise<PortalOrderDetail | null> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_order", { p_order_id: orderId });
  if (error) throw new Error("Unable to load order.");
  const response = data as OrderResponse | null;
  if (!response?.ok || !response.order) return null;
  return response.order;
}
