export type StoreLeadType = "contact" | "dealer_application";
export type StoreLeadRequestKind = "general_inquiry" | "project_consultation";
export type StoreLeadFormOptionGroup = "project_type" | "consultation_intent";

export type StoreLeadFormOption = {
  option_group: StoreLeadFormOptionGroup;
  option_key: string;
  label: string;
  sort_order: number;
};

export type StoreLeadSubmission = {
  lead_type: StoreLeadType;
  request_kind?: StoreLeadRequestKind;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company_name?: string;
  company_website?: string;
  country_code?: string;
  city?: string;
  address?: string;
  business_type?: string;
  has_showroom?: boolean;
  sales_channels?: string[];
  estimated_annual_volume?: string;
  product_interests?: string[];
  message?: string;
  marketing_consent?: boolean;
  privacy_accepted: boolean;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page?: string;
  referrer?: string;
  website_hp?: string;
  document_upload_token?: string;
  project_type?: string;
  consultation_intent?: string;
  project_address?: string;
  project_city?: string;
  project_postal_code?: string;
  preferred_consultation_date?: string;
};

export type StoreLeadSubmissionResult = {
  id: string;
  reference_code: string;
};
