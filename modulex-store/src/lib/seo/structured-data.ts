import { siteConfig } from "@/config/site";
import type {
  StorePublicCompanyLocation,
  StorePublicCompanyProfile,
} from "@/lib/store/company/queries";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function buildPostalAddress(
  source: Pick<
    StorePublicCompanyProfile,
    "addressLine1" | "addressLine2" | "city" | "stateRegion" | "postalCode" | "countryCode"
  >
) {
  const streetAddress = [source.addressLine1, source.addressLine2].filter(Boolean).join(", ") || undefined;
  const hasAddress = Boolean(
    streetAddress || source.city || source.stateRegion || source.postalCode || source.countryCode
  );

  if (!hasAddress) return undefined;

  return {
    "@type": "PostalAddress",
    streetAddress,
    addressLocality: source.city || undefined,
    addressRegion: source.stateRegion || undefined,
    postalCode: source.postalCode || undefined,
    addressCountry: source.countryCode || undefined,
  } as const;
}

function buildLocationPostalAddress(location: StorePublicCompanyLocation) {
  const streetAddress = [location.addressLine1, location.addressLine2].filter(Boolean).join(", ") || undefined;
  const hasAddress = Boolean(
    streetAddress || location.city || location.stateRegion || location.postalCode || location.countryCode
  );

  if (!hasAddress) return undefined;

  return {
    "@type": "PostalAddress",
    streetAddress,
    addressLocality: location.city || undefined,
    addressRegion: location.stateRegion || undefined,
    postalCode: location.postalCode || undefined,
    addressCountry: location.countryCode || undefined,
  } as const;
}

export function createOrganizationJsonLd(company: StorePublicCompanyProfile | null = null) {
  const brandName = company?.companyName?.trim() || siteConfig.name;
  const parentName = company?.legalName?.trim() || undefined;
  const hasDistinctParent = Boolean(parentName && parentName.toLocaleLowerCase() !== brandName.toLocaleLowerCase());
  const logo = company?.logoUrl?.trim() || undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": new URL("#organization", siteConfig.url).toString(),
    name: brandName,
    url: siteConfig.url,
    logo,
    email: company?.email?.trim() || undefined,
    telephone: company?.phone?.trim() || undefined,
    address: company ? buildPostalAddress(company) : undefined,
    parentOrganization: hasDistinctParent
      ? {
          "@type": "Organization",
          name: parentName,
        }
      : undefined,
    brand: {
      "@type": "Brand",
      name: brandName,
      url: siteConfig.url,
      logo,
    },
  } as const;
}

export function createWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: siteConfig.language,
    description: siteConfig.description,
    publisher: {
      "@id": new URL("#organization", siteConfig.url).toString(),
    },
  } as const;
}

export function createLocalBusinessJsonLd(
  location: StorePublicCompanyLocation,
  company: StorePublicCompanyProfile | null = null
) {
  const brandName = company?.companyName?.trim() || siteConfig.name;
  const openingHoursSpecification = location.hours
    .filter((hour) => !hour.isClosed && hour.opensAt && hour.closesAt)
    .map((hour) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES[hour.dayOfWeek] || undefined,
      opens: hour.opensAt || undefined,
      closes: hour.closesAt || undefined,
    }));

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${new URL("/showroom", siteConfig.url).toString()}#${location.id}`,
    name: location.name,
    url: new URL("/showroom", siteConfig.url).toString(),
    email: location.email?.trim() || company?.email?.trim() || undefined,
    telephone: location.phone?.trim() || company?.phone?.trim() || undefined,
    address: buildLocationPostalAddress(location),
    openingHoursSpecification:
      openingHoursSpecification.length > 0 ? openingHoursSpecification : undefined,
    parentOrganization: {
      "@id": new URL("#organization", siteConfig.url).toString(),
    },
    brand: {
      "@type": "Brand",
      name: brandName,
    },
  } as const;
}

export function createBreadcrumbJsonLd(
  items: Array<{ name: string; path: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, siteConfig.url).toString(),
    })),
  } as const;
}
