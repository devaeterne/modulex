export type CustomerStatus = "active" | "inactive" | "blocked" | "prospect";

export type Customer = {
  id: string;
  customer_code: string;
  name: string;
  legal_name: string | null;
  customer_type_id: string | null;
  status: CustomerStatus;
  tax_number: string | null;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country_code: string | null;
  language_code: string;
  currency_code: string;
  price_group_id: string | null;
  sales_rep_id: string | null;
  customer_since: string | null;
  portal_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerType = { id: string; system_key: string; name: string; sort_order: number; is_active: boolean; };
export type PriceGroupLookup = { id: string; name: string; system_key: string; sort_order: number; is_base_price: boolean; is_active: boolean; };
export type ProfileLookup = { id: string; full_name: string | null; email: string | null; role: string; is_active: boolean; };
export type PaymentTerm = { id: string; system_key: string; name: string; days: number | null; sort_order: number; is_active: boolean; };
export type PaymentMethod = { id: string; system_key: string; name: string; commission_percent: string | number; sort_order: number; is_active: boolean; };

export type CustomerContact = {
  id: string; customer_id: string; first_name: string; last_name: string | null; job_title: string | null; department: string | null;
  email: string | null; phone: string | null; mobile: string | null; is_primary: boolean; is_billing_contact: boolean;
  is_shipping_contact: boolean; is_order_contact: boolean; is_active: boolean; created_at: string;
};

export type CustomerAddress = {
  id: string; customer_id: string; address_name: string; company_name: string | null; contact_name: string | null;
  address_line_1: string; address_line_2: string | null; postal_code: string | null; city: string; state_region: string | null;
  country_code: string; phone: string | null; address_type: "billing" | "shipping" | "both";
  is_default_billing: boolean; is_default_shipping: boolean; is_active: boolean; created_at: string;
};

export type CustomerCommercialSettings = {
  customer_id: string; payment_term_id: string | null; credit_limit: string | number | null; minimum_order_amount: string | number | null;
  tax_exempt: boolean; tax_exemption_number: string | null; credit_hold: boolean; credit_hold_reason: string | null;
  discount_notes: string | null; order_notes: string | null;
};

export type CustomerPortalUser = {
  id: string; customer_id: string; contact_id: string | null; auth_user_id: string | null; full_name: string | null; login_email: string;
  portal_role: "admin" | "buyer" | "viewer"; status: "never_invited" | "invited" | "active" | "suspended"; is_primary: boolean;
  invited_at: string | null; activated_at: string | null; last_login_at: string | null; created_at: string;
};

export type CustomerNote = { id: string; customer_id: string; note: string; category: string | null; is_pinned: boolean; created_by: string | null; created_at: string; updated_at: string; };
export type CustomerDocument = { id: string; customer_id: string; document_type: string | null; file_name: string; storage_bucket: string; storage_path: string; mime_type: string | null; file_size_bytes: number | null; description: string | null; is_active: boolean; created_at: string; };
export type CustomerActivity = { id: string; customer_id: string; activity_type: string; title: string; description: string | null; metadata: Record<string, unknown>; actor_user_id: string | null; created_at: string; };

export type CustomerOrderStatus =
  | "draft" | "confirmed" | "in_preparation" | "ready_for_shipment" | "shipped" | "delivered"
  | "installation_scheduled" | "installation_in_progress" | "completed" | "cancelled";

export type CustomerOrder = {
  id: string; order_number: string; customer_id: string; status: CustomerOrderStatus; order_date: string; expected_delivery_date: string | null;
  price_group_id: string | null; price_group_name_snapshot: string | null; currency_code: string;
  payment_method_id: string | null; payment_method_name_snapshot: string | null;
  payment_commission_default_percent: string | number; payment_commission_percent: string | number; payment_commission_amount: string | number; grand_total: string | number;
  billing_address_id: string | null; shipping_address_id: string | null; billing_address_snapshot: Record<string, unknown> | null; shipping_address_snapshot: Record<string, unknown> | null;
  customer_reference: string | null; customer_notes: string | null; internal_notes: string | null;
  item_count: number; subtotal: string | number; discount_amount: string | number; tax_rate: string | number; tax_amount: string | number; total_amount: string | number;
  confirmed_at: string | null; completed_at: string | null; cancelled_at: string | null; created_at: string; updated_at: string;
};

export type CustomerOrderItem = {
  id: string; order_id: string; product_id: string | null; line_no: number; sku_snapshot: string; product_name_snapshot: string;
  quantity: string | number; unit_price: string | number; discount_percent: string | number; discount_amount: string | number;
  line_subtotal: string | number; line_total: string | number; price_source: "price_group" | "manual"; created_at: string;
};

export type CustomerOrderStatusHistory = { id: string; order_id: string; from_status: CustomerOrderStatus | null; to_status: CustomerOrderStatus; note: string | null; changed_by: string | null; created_at: string; };

export type CustomerOrderRevision = {
  id: string;
  order_id: string;
  revision_number: number;
  reason: string | null;
  order_snapshot: Record<string, unknown>;
  items_snapshot: Record<string, unknown>[];
  revised_by: string | null;
  created_at: string;
};

export type CustomerInvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";

export type CustomerInvoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
  order_id: string | null;
  status: CustomerInvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  currency_code: string;
  customer_reference: string | null;
  order_number_snapshot: string | null;
  billing_address_snapshot: Record<string, unknown> | null;
  subtotal: string | number;
  discount_amount: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  payment_commission_percent: string | number;
  payment_commission_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  notes: string | null;
  internal_notes: string | null;
  issued_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerInvoiceItem = {
  id: string;
  invoice_id: string;
  order_item_id: string | null;
  product_id: string | null;
  line_no: number;
  sku_snapshot: string;
  product_name_snapshot: string;
  quantity: string | number;
  unit_price: string | number;
  discount_percent: string | number;
  discount_amount: string | number;
  line_subtotal: string | number;
  line_total: string | number;
  created_at: string;
};
