export type StoreChromePlacement =
  | "primary_nav"
  | "footer_products"
  | "footer_company";

export type StoreChromeDestinationKey =
  | "home"
  | "about"
  | "products"
  | "showroom"
  | "cabinet_process"
  | "gallery"
  | "contact"
  | "dealer_apply";

export type StoreChromeItem = {
  id: string;
  placement: StoreChromePlacement;
  destinationKey: StoreChromeDestinationKey;
  label: string;
  sortOrder: number;
};

export type ResolvedStoreChromeItem = StoreChromeItem & {
  href: string;
};

export const STORE_CHROME_DESTINATIONS: Record<StoreChromeDestinationKey, string> = {
  home: "/",
  about: "/about",
  products: "/products",
  showroom: "/showroom",
  cabinet_process: "/cabinet-process",
  gallery: "/gallery",
  contact: "/contact",
  dealer_apply: "/dealers/apply",
};

const STORE_CHROME_PLACEMENTS = new Set<StoreChromePlacement>([
  "primary_nav",
  "footer_products",
  "footer_company",
]);

export function resolveStoreChromeDestination(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(STORE_CHROME_DESTINATIONS, key)
    ? STORE_CHROME_DESTINATIONS[key as StoreChromeDestinationKey]
    : null;
}

export function resolveStoreChromeItems(items: StoreChromeItem[]): ResolvedStoreChromeItem[] {
  return items
    .flatMap((item) => {
      const label = item.label.trim();
      const href = resolveStoreChromeDestination(item.destinationKey);
      if (!label || !href || !STORE_CHROME_PLACEMENTS.has(item.placement)) return [];
      return [{ ...item, label, href }];
    })
    .sort((left, right) =>
      left.sortOrder - right.sortOrder
      || left.label.localeCompare(right.label)
      || left.id.localeCompare(right.id),
    );
}

export const SAFE_STORE_CHROME_FALLBACK: StoreChromeItem[] = [
  { id: "fallback-primary-home", placement: "primary_nav", destinationKey: "home", label: "Home", sortOrder: 10 },
  { id: "fallback-primary-about", placement: "primary_nav", destinationKey: "about", label: "About", sortOrder: 20 },
  { id: "fallback-primary-products", placement: "primary_nav", destinationKey: "products", label: "Products", sortOrder: 30 },
  { id: "fallback-primary-showroom", placement: "primary_nav", destinationKey: "showroom", label: "Showroom", sortOrder: 40 },
  { id: "fallback-primary-gallery", placement: "primary_nav", destinationKey: "gallery", label: "Gallery", sortOrder: 50 },
  { id: "fallback-primary-dealers", placement: "primary_nav", destinationKey: "dealer_apply", label: "Dealers", sortOrder: 60 },
  { id: "fallback-footer-products-catalog", placement: "footer_products", destinationKey: "products", label: "Product Catalog", sortOrder: 10 },
  { id: "fallback-footer-products-support", placement: "footer_products", destinationKey: "contact", label: "Product Support", sortOrder: 20 },
  { id: "fallback-footer-company-about", placement: "footer_company", destinationKey: "about", label: "About Us", sortOrder: 10 },
  { id: "fallback-footer-company-showroom", placement: "footer_company", destinationKey: "showroom", label: "Showroom", sortOrder: 20 },
  { id: "fallback-footer-company-contact", placement: "footer_company", destinationKey: "contact", label: "Contact", sortOrder: 30 },
];
