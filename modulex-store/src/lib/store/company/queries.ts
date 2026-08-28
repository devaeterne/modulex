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

export async function getStorePublicCompanyProfile(): Promise<StorePublicCompanyProfile | null> {
  return callPublicRpc<StorePublicCompanyProfile | null>(
    "get_store_public_profile",
    {},
    { revalidate: 900 }
  );
}
