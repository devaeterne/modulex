import { callPublicRpc } from "@/lib/supabase/public-rest";

export type StorePublicCompanyProfile = {
  companyName: string | null;
  legalName: string | null;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string | null;
  locale: string | null;
};

export type StorePublicCompanyHour = {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
  note: string | null;
};

export type StorePublicCompanyContactChannel = {
  id: string;
  channelType: "email" | "phone" | "website" | "other";
  label: string;
  value: string;
  href: string | null;
};

export type StorePublicCompanyLocation = {
  id: string;
  locationType: "office" | "showroom" | "warehouse" | "other";
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string | null;
  mapUrl: string | null;
  hours: StorePublicCompanyHour[];
};

export type StorePublicCompanyStructure = {
  contactChannels: StorePublicCompanyContactChannel[];
  locations: StorePublicCompanyLocation[];
};

export async function getStorePublicCompanyProfile(): Promise<StorePublicCompanyProfile | null> {
  return callPublicRpc<StorePublicCompanyProfile | null>(
    "get_store_public_profile",
    {},
    { revalidate: 900 }
  );
}

export async function getStorePublicCompanyLocations(): Promise<StorePublicCompanyStructure> {
  const structure = await callPublicRpc<StorePublicCompanyStructure | null>(
    "get_store_public_company_locations",
    {},
    { revalidate: 900 }
  );

  return {
    contactChannels: structure?.contactChannels ?? [],
    locations: structure?.locations ?? [],
  };
}
