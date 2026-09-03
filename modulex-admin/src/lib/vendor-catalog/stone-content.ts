export type StoneVariantLike = {
  thickness?: string | null;
  finish?: string | null;
  dimensions?: string | null;
  slabSizeClass?: string | null;
};

export type StoneInventoryLike = {
  lotNumber?: string | null;
  batchNumber?: string | null;
  location?: string | null;
};

export type StoneDataLike = {
  stoneTypeName?: string | null;
  brand?: string | null;
  collection?: string | null;
  colors?: string[] | null;
  backgroundColor?: string | null;
  veinColors?: string[] | null;
  features?: string[] | null;
  variant?: StoneVariantLike | null;
  vendorInventory?: StoneInventoryLike[] | null;
};

export type StoneDescriptionInput = {
  title: string;
  description: string | null;
  stone_data: StoneDataLike | null;
};

function clean(value: string | null | undefined) {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(clean).filter((value): value is string => Boolean(value)))];
}

export function buildStoneProductDescription(item: StoneDescriptionInput) {
  const vendorDescription = clean(item.description);
  if (vendorDescription) return vendorDescription;

  const data = item.stone_data ?? {};
  const variant = data.variant ?? {};
  const inventory = data.vendorInventory?.[0] ?? {};
  const parts: string[] = [];

  const stoneType = clean(data.stoneTypeName);
  if (stoneType) parts.push(`${stoneType} slab.`);
  else parts.push("Stone slab.");

  const collection = clean(data.collection);
  if (collection) parts.push(`Collection: ${collection}.`);

  const colors = unique(data.colors ?? []);
  if (colors.length) parts.push(`Colors: ${colors.join(", ")}.`);

  const thickness = clean(variant.thickness);
  if (thickness) parts.push(`Thickness: ${thickness}.`);

  const finish = clean(variant.finish);
  if (finish) parts.push(`Finish: ${finish}.`);

  const dimensions = clean(variant.dimensions);
  if (dimensions) parts.push(`Dimensions: ${dimensions}.`);

  const slabSizeClass = clean(variant.slabSizeClass);
  if (slabSizeClass) parts.push(`Slab size: ${slabSizeClass}.`);

  const lot = clean(inventory.lotNumber);
  if (lot) parts.push(`Lot: ${lot}.`);

  const batch = clean(inventory.batchNumber);
  if (batch) parts.push(`Batch: ${batch}.`);

  const location = clean(inventory.location);
  if (location) parts.push(`Location: ${location}.`);

  const features = unique(data.features ?? []);
  if (features.length) parts.push(`Features: ${features.join(", ")}.`);

  return parts.join(" ");
}

function looksLikeIp(hostname: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(":");
}

function siteDomain(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function isTrustedStoneImageUrl(productUrl: string, assetUrl: string) {
  let product: URL;
  let asset: URL;
  try {
    product = new URL(productUrl);
    asset = new URL(assetUrl);
  } catch {
    return false;
  }

  if (product.protocol !== "https:" || asset.protocol !== "https:") return false;
  if (asset.hostname === "localhost" || looksLikeIp(asset.hostname)) return false;

  const root = siteDomain(product.hostname);
  const assetHost = siteDomain(asset.hostname);
  return assetHost === root || assetHost.endsWith(`.${root}`);
}
