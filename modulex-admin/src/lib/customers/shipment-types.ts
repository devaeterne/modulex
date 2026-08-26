export type CustomerShipmentStatus = "draft" | "picking" | "packed" | "shipped" | "delivered" | "cancelled";

export type CustomerShipment = {
  id: string;
  shipment_number: string;
  customer_id: string;
  order_id: string;
  status: CustomerShipmentStatus;
  shipping_address_snapshot: Record<string, unknown> | null;
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  customer_reference: string | null;
  notes: string | null;
  internal_notes: string | null;
  picking_started_at: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerShipmentItem = {
  id: string;
  shipment_id: string;
  order_item_id: string;
  product_id: string | null;
  line_no: number;
  sku_snapshot: string;
  product_name_snapshot: string;
  ordered_quantity_snapshot: string | number;
  shipment_quantity: string | number;
  source_warehouse_id: string | null;
  source_location_id: string | null;
  stock_deducted_at: string | null;
  created_at: string;
};

export type ShipmentStockOption = {
  product_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_id: string;
  location_code: string;
  on_hand: string | number;
  reserved: string | number;
  available: string | number;
};
