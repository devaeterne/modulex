export type StoreLeadType = "contact" | "dealer_application";

export type StoreLeadSubmission = {
  lead_type: StoreLeadType;
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
};

export type StoreLeadSubmissionResult = {
  id: string;
  reference_code: string;
};
