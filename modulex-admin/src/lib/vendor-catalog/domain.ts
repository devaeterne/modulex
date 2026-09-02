import { createHash } from "node:crypto";

export type VendorCatalogChangeState = "NEW" | "UPDATED" | "UNCHANGED";
export type VendorCatalogReviewStatus = "PENDING" | "APPROVED" | "IGNORED";
export type VendorAssetKind = "image" | "specification" | "cad" | "document";
export type VendorAvailabilityStatus =
  | "AVAILABLE"
  | "OUT_OF_STOCK"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "MISSING";

export type NormalizedVendorAvailability = {
  status: VendorAvailabilityStatus;
  available: boolean | null;
  purchasable: boolean | null;
  stockQuantity: number | null;
};

export type VendorCatalogCategory = {
  key: string;
  label: string;
  productCount: number | null;
};

export type VendorCatalogDiscoveryScope = {
  categoryKey?: string | null;
  categoryLabel?: string | null;
};

export type VendorAsset = {
  kind: VendorAssetKind;
  url: string;
  label?: string | null;
  fileType?: string | null;
};

export type NormalizedVendorProduct = {
  vendorCode: string;
  externalId: string;
  sku: string | null;
  title: string;
  description: string | null;
  productUrl: string;
  vendorPriceReference: number | null;
  vendorCurrency: string | null;
  vendorCategoryKey: string | null;
  vendorCategoryLabel: string | null;
  familyKey: string;
  variantCode: string | null;
  variantLabel: string | null;
  availability: NormalizedVendorAvailability;
  assets: VendorAsset[];
  sourcePayload: unknown;
};

export interface VendorCatalogAdapter {
  readonly vendorCode: string;
  listCategories?(): Promise<VendorCatalogCategory[]>;
  discover(scope?: VendorCatalogDiscoveryScope): Promise<NormalizedVendorProduct[]>;
  enrich?(product: NormalizedVendorProduct): Promise<NormalizedVendorProduct>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function hashSnapshot(snapshot: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(snapshot)))
    .digest("hex");
}

function normalizedAssets(product: NormalizedVendorProduct) {
  return [...product.assets]
    .map((asset) => ({
      kind: asset.kind,
      url: asset.url,
      label: asset.label ?? null,
      fileType: asset.fileType ?? null,
    }))
    .sort((left, right) =>
      `${left.kind}:${left.url}`.localeCompare(`${right.kind}:${right.url}`)
    );
}

function normalizedProductSnapshot(
  product: NormalizedVendorProduct,
  options: { includeDiscoveryScope: boolean }
) {
  return {
    vendorCode: product.vendorCode,
    externalId: product.externalId,
    sku: product.sku,
    title: product.title,
    description: product.description,
    productUrl: product.productUrl,
    vendorPriceReference: product.vendorPriceReference,
    vendorCurrency: product.vendorCurrency,
    ...(options.includeDiscoveryScope
      ? {
          vendorCategoryKey: product.vendorCategoryKey,
          vendorCategoryLabel: product.vendorCategoryLabel,
        }
      : {}),
    familyKey: product.familyKey,
    variantCode: product.variantCode,
    variantLabel: product.variantLabel,
    assets: normalizedAssets(product),
  };
}

export function stableDiscoveryHash(product: NormalizedVendorProduct) {
  return hashSnapshot(
    normalizedProductSnapshot(product, { includeDiscoveryScope: false })
  );
}

export function stableProductHash(product: NormalizedVendorProduct) {
  return hashSnapshot(
    normalizedProductSnapshot(product, { includeDiscoveryScope: true })
  );
}

export function stableNormalizedAvailabilityHash(
  availability: NormalizedVendorAvailability
) {
  return hashSnapshot({
    status: availability.status,
    available: availability.available,
    purchasable: availability.purchasable,
    stockQuantity: availability.stockQuantity,
  });
}

export function stableAvailabilityHash(product: NormalizedVendorProduct) {
  return stableNormalizedAvailabilityHash(product.availability);
}

export function isVendorApprovalEligible(status: VendorAvailabilityStatus) {
  return status !== "MISSING";
}

export function classifyVendorProduct(
  previousHash: string | null | undefined,
  nextHash: string
): VendorCatalogChangeState {
  if (!previousHash) return "NEW";
  return previousHash === nextHash ? "UNCHANGED" : "UPDATED";
}

export function canPublishWithModulexPrice(modulexPrice: number | null | undefined) {
  return typeof modulexPrice === "number" && Number.isFinite(modulexPrice) && modulexPrice > 0;
}

export function assertPublishableWithModulexPrice(
  modulexPrice: number | null | undefined
) {
  if (!canPublishWithModulexPrice(modulexPrice)) {
    throw new Error("Store publication requires a Modulex selling price greater than zero.");
  }
}
