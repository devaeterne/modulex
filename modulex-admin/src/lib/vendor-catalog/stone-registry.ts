import {
  stoneVendorCatalogLabels as foundationLabels,
  stoneVendorCatalogRegistry as foundationRegistry,
} from "@/lib/vendor-catalog/stone-adapters";
import {
  MarbleSystemsStoneAdapter,
  MsiStoneAdapter,
} from "@/lib/vendor-catalog/stone-adapters-msi-marble-systems";
import type { StoneVendorAdapter } from "@/lib/vendor-catalog/stone-domain";

export const stoneVendorCatalogRegistry = {
  ...foundationRegistry,
  msi: () => new MsiStoneAdapter(),
  marble_systems: () => new MarbleSystemsStoneAdapter(),
} satisfies Record<string, () => StoneVendorAdapter>;

export const stoneVendorCatalogLabels = {
  ...foundationLabels,
  msi: "MSI Surfaces",
  marble_systems: "Marble Systems",
} as const;

export function getStoneVendorCatalogAdapter(vendorCode: string) {
  const factory =
    stoneVendorCatalogRegistry[
      vendorCode.toLowerCase() as keyof typeof stoneVendorCatalogRegistry
    ];
  if (!factory) throw new Error(`Unknown stone vendor catalog adapter: ${vendorCode}`);
  return factory();
}
