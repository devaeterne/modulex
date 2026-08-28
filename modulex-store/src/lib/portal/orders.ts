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
};

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

export async function getPortalOrders(limit = 25, offset = 0): Promise<PortalOrderSummary[]> {
  const supabase = await createServerSupabaseClient();
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
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_store_portal_order", { p_order_id: orderId });
  if (error) throw new Error("Unable to load order.");
  const response = data as OrderResponse | null;
  if (!response?.ok || !response.order) return null;
  return response.order;
}
