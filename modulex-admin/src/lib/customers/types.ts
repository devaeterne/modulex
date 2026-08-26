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

export type CustomerType = {
  id: string;
  system_key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type PriceGroupLookup = {
  id: string;
  name: string;
  system_key: string;
  sort_order: number;
  is_base_price: boolean;
  is_active: boolean;
};

export type ProfileLookup = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

export type PaymentTerm = {
  id: string;
  system_key: string;
  name: string;
  days: number | null;
  sort_order: number;
  is_active: boolean;
};

export type CustomerContact = {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  is_primary: boolean;
  is_billing_contact: boolean;
  is_shipping_contact: boolean;
  is_order_contact: boolean;
  is_active: boolean;
  created_at: string;
};

export type CustomerAddress = {
  id: string;
  customer_id: string;
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
  address_type: "billing" | "shipping" | "both";
  is_default_billing: boolean;
  is_default_shipping: boolean;
  is_active: boolean;
  created_at: string;
};

export type CustomerCommercialSettings = {
  customer_id: string;
  payment_term_id: string | null;
  credit_limit: string | number | null;
  minimum_order_amount: string | number | null;
  tax_exempt: boolean;
  tax_exemption_number: string | null;
  credit_hold: boolean;
  credit_hold_reason: string | null;
  discount_notes: string | null;
  order_notes: string | null;
};

export type CustomerPortalUser = {
  id: string;
  customer_id: string;
  contact_id: string | null;
  auth_user_id: string | null;
  full_name: string | null;
  login_email: string;
  portal_role: "admin" | "buyer" | "viewer";
  status: "never_invited" | "invited" | "active" | "suspended";
  is_primary: boolean;
  invited_at: string | null;
  activated_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type CustomerNote = {
  id: string;
  customer_id: string;
  note: string;
  category: string | null;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerDocument = {
  id: string;
  customer_id: string;
  document_type: string | null;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type CustomerActivity = {
  id: string;
  customer_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  actor_user_id: string | null;
  created_at: string;
};
