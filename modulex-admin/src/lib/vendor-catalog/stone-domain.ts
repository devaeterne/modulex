import { createHash } from "node:crypto";

export type StoneVendorCode =
  | "ew_marble"
  | "venezia"
  | "msi"
  | "marble_systems"
  | "cosmos"
  | "emerstone"
  | "cosentino"
  | "cambria";

export type StoneVendorAssetKind = "image" | "specification" | "cad" | "document";
export type StoneVendorAvailabilityStatus =
  | "AVAILABLE"
  | "OUT_OF_STOCK"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type StoneVendorAsset = {
  kind: StoneVendorAssetKind;
  url: string;
  label?: string | null;
  fileType?: string | null;
  role?: "SLAB" | "CLOSE_UP" | "ROOM" | "DETAIL" | "BOOKMATCH" | "OTHER";
};

export type StoneVendorVariant = {
  vendorSku: string | null;
  form: "SLAB" | "PREFAB" | null;
  thickness: string | null;
  finish: string | null;
  dimensions: string | null;
  slabSizeClass: string | null;
  bookMatch: boolean | null;
};

export type StoneVendorInventory = {
  lotNumber: string | null;
  batchNumber: string | null;
  location: string | null;
  dimensions: string | null;
  quantity: number | null;
  availability: StoneVendorAvailabilityStatus;
};

export type NormalizedStoneVendorProduct = {
  vendorCode: StoneVendorCode;
  externalId: string;
  sku: string | null;
  title: string;
  description: string | null;
  productUrl: string;
  familyKey: string;
  variantCode: string | null;
  variantLabel: string | null;
  sourceStoneTypeName: string;
  stoneTypeName: string;
  brand: string | null;
  collection: string | null;
  colors: string[];
  backgroundColor: string | null;
  veinColors: string[];
  colorTone: string | null;
  features: string[];
  variant: StoneVendorVariant;
  vendorInventory: StoneVendorInventory[];
  availability: {
    status: StoneVendorAvailabilityStatus;
    available: boolean | null;
    purchasable: boolean | null;
    stockQuantity: number | null;
  };
  assets: StoneVendorAsset[];
  sourcePayload: unknown;
};

export type StoneVendorCategory = {
  key: string;
  label: string;
  productCount: number | null;
};

export type StoneVendorDiscoveryScope = {
  categoryKey?: string | null;
  categoryLabel?: string | null;
};

export interface StoneVendorAdapter {
  readonly vendorCode: StoneVendorCode;
  readonly displayName: string;
  listCategories(): Promise<StoneVendorCategory[]>;
  discover(scope?: StoneVendorDiscoveryScope): Promise<NormalizedStoneVendorProduct[]>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function stableStoneVendorHash(product: NormalizedStoneVendorProduct) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({
      vendorCode: product.vendorCode,
      externalId: product.externalId,
      sku: product.sku,
      title: product.title,
      description: product.description,
      productUrl: product.productUrl,
      familyKey: product.familyKey,
      variantCode: product.variantCode,
      variantLabel: product.variantLabel,
      sourceStoneTypeName: product.sourceStoneTypeName,
      stoneTypeName: product.stoneTypeName,
      brand: product.brand,
      collection: product.collection,
      colors: product.colors,
      backgroundColor: product.backgroundColor,
      veinColors: product.veinColors,
      colorTone: product.colorTone,
      features: product.features,
      variant: product.variant,
      vendorInventory: product.vendorInventory,
      availability: product.availability,
      assets: product.assets,
    })))
    .digest("hex");
}

export function normalizeStoneTypeName(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  if (lower.includes("printed quartz") || lower.includes("vision quartz") || lower === "quartz") return "Quartz";
  if (lower.includes("quartzite")) return "Quartzite";
  if (lower.includes("granite")) return "Granite";
  if (lower.includes("marble")) return "Marble";
  if (lower.includes("travertine")) return "Travertine";
  if (lower.includes("porcelain")) return "Porcelain";
  if (lower.includes("soapstone")) return "Soapstone";
  if (lower.includes("dolomite")) return "Dolomite";
  if (lower.includes("onyx")) return "Onyx";
  if (lower.includes("limestone")) return "Limestone";
  if (lower.includes("slate")) return "Slate";
  if (lower.includes("sintered")) return "Sintered Stone";
  if (lower.includes("semi precious") || lower.includes("semiprecious")) return "Semiprecious";
  return normalized || "Unknown";
}
