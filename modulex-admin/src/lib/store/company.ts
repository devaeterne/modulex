import { normalizeCountryCode, normalizeOptional } from "@/lib/validation";

export type CompanyContactChannelType = "email" | "phone" | "website" | "other";
export type CompanyLocationType = "office" | "showroom" | "warehouse" | "other";

export type CompanyContactChannel = {
  id: string;
  channel_type: CompanyContactChannelType;
  label: string;
  value: string;
  href: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyLocation = {
  id: string;
  location_type: CompanyLocationType;
  name: string;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country_code: string | null;
  map_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyLocationHour = {
  id: string;
  location_id: string;
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
  note: string | null;
};

export function normalizeCompanyLocationInput(location: CompanyLocation) {
  return {
    location_type: location.location_type,
    name: location.name.trim(),
    email: normalizeOptional(location.email),
    phone: normalizeOptional(location.phone),
    address_line_1: normalizeOptional(location.address_line_1),
    address_line_2: normalizeOptional(location.address_line_2),
    city: normalizeOptional(location.city),
    state_region: normalizeOptional(location.state_region),
    postal_code: normalizeOptional(location.postal_code),
    country_code: normalizeOptional(location.country_code)
      ? normalizeCountryCode(location.country_code ?? "")
      : null,
    map_url: normalizeOptional(location.map_url),
    sort_order: Number.isFinite(location.sort_order) ? location.sort_order : 0,
    is_active: location.is_active,
  };
}

export function normalizeCompanyContactInput(channel: CompanyContactChannel) {
  return {
    channel_type: channel.channel_type,
    label: channel.label.trim(),
    value: channel.value.trim(),
    href: normalizeOptional(channel.href),
    sort_order: Number.isFinite(channel.sort_order) ? channel.sort_order : 0,
    is_active: channel.is_active,
  };
}
