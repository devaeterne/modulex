export type StoreLeadType = "contact" | "dealer_application";
export type StoreLeadRequestKind = "general_inquiry" | "project_consultation";
export type StoreLeadStatus =
  | "new"
  | "under_review"
  | "contacted"
  | "qualified"
  | "approved"
  | "rejected"
  | "closed";

export type StoreLead = {
  id: string;
  reference_code: string;
  lead_type: StoreLeadType;
  request_kind: StoreLeadRequestKind;
  status: StoreLeadStatus;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  company_website: string | null;
  country_code: string | null;
  city: string | null;
  address: string | null;
  business_type: string | null;
  has_showroom: boolean | null;
  sales_channels: string[];
  estimated_annual_volume: string | null;
  product_interests: string[];
  message: string | null;
  marketing_consent: boolean;
  privacy_accepted: boolean;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  project_type: string | null;
  consultation_intent: string | null;
  project_address: string | null;
  project_city: string | null;
  project_postal_code: string | null;
  preferred_consultation_date: string | null;
  assigned_to: string | null;
  internal_notes: string | null;
  converted_customer_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type StoreLeadFormOption = {
  id: string;
  option_group: "project_type" | "consultation_intent";
  option_key: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type StoreLeadActivity = {
  id: string;
  lead_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export type LeadAssignee = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};
