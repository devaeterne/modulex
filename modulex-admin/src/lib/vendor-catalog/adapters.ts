import type { VendorCatalogAdapter } from "@/lib/vendor-catalog/domain";
import { KarranAdapter, RuvatiAdapter } from "@/lib/vendor-catalog/base-adapters";
import { DynamicStoneAdapter } from "@/lib/vendor-catalog/dynamic-stone-adapter";

export {
  KARRAN_COLOR_SUFFIXES,
  extractDocumentAssets,
  KarranAdapter,
  RuvatiAdapter,
} from "@/lib/vendor-catalog/base-adapters";
export { DynamicStoneAdapter } from "@/lib/vendor-catalog/dynamic-stone-adapter";

export const vendorCatalogLabels: Record<string, string> = {
  karran: "Karran",
  ruvati: "Ruvati",
  dynamicstone: "Dynamic Stone Tools",
};

export const vendorCatalogImageHosts: Record<string, string[]> = {
  karran: ["karran.com", "www.karran.com", "cdn.shopify.com"],
  ruvati: ["ruvati.com", "www.ruvati.com"],
  dynamicstone: ["dynamicstonetools.net", "www.dynamicstonetools.net"],
};

export const vendorCatalogRegistry: Record<string, () => VendorCatalogAdapter> = {
  karran: () => new KarranAdapter(),
  ruvati: () => new RuvatiAdapter(),
  dynamicstone: () => new DynamicStoneAdapter(),
};

export function getVendorCatalogAdapter(vendorCode: string) {
  const factory = vendorCatalogRegistry[vendorCode.toLowerCase()];
  if (!factory) throw new Error(`Unknown vendor catalog adapter: ${vendorCode}`);
  return factory();
}
