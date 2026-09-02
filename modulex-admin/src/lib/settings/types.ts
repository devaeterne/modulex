export type GeneralSettings = {
  id: number;
  company_name: string;
  legal_name: string | null;
  logo_url: string | null;
  primary_logo_on_light_url: string | null;
  primary_logo_on_dark_url: string | null;
  secondary_logo_on_light_url: string | null;
  secondary_logo_on_dark_url: string | null;
  tax_number: string | null;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  postal_code: string | null;
  city: string | null;
  state_region: string | null;
  country_code: string | null;
  default_currency: string;
  locale: string;
  timezone: string;
  order_document_title: string;
  order_footer_note: string | null;
  invoice_document_title: string;
  invoice_footer_note: string | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  id: 1,
  company_name: "Your Company",
  legal_name: null,
  logo_url: null,
  primary_logo_on_light_url: null,
  primary_logo_on_dark_url: null,
  secondary_logo_on_light_url: null,
  secondary_logo_on_dark_url: null,
  tax_number: null,
  registration_number: null,
  email: null,
  phone: null,
  website: null,
  address_line_1: null,
  address_line_2: null,
  postal_code: null,
  city: null,
  state_region: null,
  country_code: "US",
  default_currency: "USD",
  locale: "en-US",
  timezone: "America/New_York",
  order_document_title: "Sales Order / Order Confirmation",
  order_footer_note: null,
  invoice_document_title: "Invoice",
  invoice_footer_note: null,
};
