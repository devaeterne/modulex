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
  marketing_consent?: boolean;
  privacy_accepted?: boolean;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  project_type: string | null;
  consultation_intent: string | null;
  project_address: string | null;
  project_city: string | null;
  project_postal_code: string | null;
  preferred_consultation_date: string | null;
  assigned_to: string | null;
  internal_notes: string | null;
  converted_customer_id: string | null;
  converted_project_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type StoreLeadListItem = Pick<
  StoreLead,
  | "id"
  | "reference_code"
  | "lead_type"
  | "request_kind"
  | "status"
  | "first_name"
  | "last_name"
  | "email"
  | "company_name"
  | "assigned_to"
  | "source"
  | "utm_source"
  | "created_at"
  | "archived_at"
> & { total_count: number };

export type StoreLeadSummary = {
  total: number;
  new: number;
  dealer_applications: number;
  qualified_or_approved: number;
  archived: number;
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

export type StoreLeadConversion = {
  id: string;
  conversion_target: "customer" | "project" | "dealer";
  customer_id: string | null;
  project_id: string | null;
  created_at: string;
};

export type LeadAssignee = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

export type StoreLeadDetailPayload =
  | {
      ok: true;
      role: string;
      can_archive: boolean;
      lead: StoreLead;
      activity: StoreLeadActivity[];
      assignees: LeadAssignee[];
      conversions: StoreLeadConversion[];
      reason?: never;
    }
  | {
      ok: false;
      reason: string;
      role?: string;
      can_archive?: boolean;
      lead?: never;
      activity?: never;
      assignees?: LeadAssignee[];
      conversions?: never;
    };
