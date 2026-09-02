import {
  normalizeStoneTypeName,
  type NormalizedStoneVendorProduct,
  type StoneVendorAdapter,
  type StoneVendorAsset,
  type StoneVendorAvailabilityStatus,
  type StoneVendorCategory,
  type StoneVendorDiscoveryScope,
} from "@/lib/vendor-catalog/stone-domain";
import {
  MarbleSystemsStoneAdapter,
  MsiStoneAdapter,
} from "@/lib/vendor-catalog/stone-adapters-msi-marble-systems";

type FetchLike = typeof fetch;
type AdapterOptions = { baseUrl?: string; fetchImpl?: FetchLike };

function absoluteUrl(baseUrl: string, href: string) {
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return stripHtml(match[1]);
  }
  return null;
}

function labeledValue(text: string, label: string, nextLabels: string[]) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = nextLabels.length
    ? `(?=${nextLabels.map((next) => `${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`).join("|")}|$)`
    : "$";
  return text.match(new RegExp(`${escaped}:\\s*(.*?)\\s*${tail}`, "i"))?.[1]?.trim() || null;
}

function imageAssets(html: string, baseUrl: string, title: string): StoneVendorAsset[] {
  const byUrl = new Map<string, StoneVendorAsset>();
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const url = absoluteUrl(baseUrl, match[1]);
    if (!url || !/^https:/i.test(url)) continue;
    const tag = match[0];
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1];
    const label = alt ? decodeHtml(alt).trim() : null;
    if (label && !label.toLowerCase().includes(title.toLowerCase().split(" ")[0])) continue;
    byUrl.set(url, { kind: "image", url, label, role: "SLAB" });
  }
  return [...byUrl.values()];
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "stone";
}

function inferThickness(title: string, text: string) {
  return firstMatch(`${title} ${text}`, [/(\d+(?:\.\d+)?\s*cm)\b/i, /(\d+\s*\/\s*\d+\s*["”])/i]);
}

function inferFinish(title: string) {
  return title.match(/\b(polished|honed|leathered?|matte|suede|satin|textured|volcano)\b/i)?.[1] ?? null;
}

function familyName(title: string, stoneType: string) {
  return title
    .replace(/\blot\s*:?.*$/i, "")
    .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, "")
    .replace(/\b\d+\s*\/\s*\d+\s*["”]/gi, "")
    .replace(/\b(polished|honed|leathered?|matte|suede|satin|textured|volcano)\b/gi, "")
    .replace(new RegExp(`\\b${stoneType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), "")
    .replace(/\s+/g, " ")
    .trim() || title.trim();
}

function normalizedAvailability(value: string | null) {
  const lower = value?.toLowerCase() ?? "";
  let status: StoneVendorAvailabilityStatus = "UNKNOWN";
  if (/in\s*stock|limited availability/.test(lower)) status = "AVAILABLE";
  else if (/out\s*of\s*stock/.test(lower)) status = "OUT_OF_STOCK";
  else if (/unavailable/.test(lower)) status = "UNAVAILABLE";
  return {
    status,
    available: status === "AVAILABLE" ? true : status === "OUT_OF_STOCK" || status === "UNAVAILABLE" ? false : null,
    purchasable: status === "UNAVAILABLE" ? false : status === "AVAILABLE" ? true : null,
    stockQuantity: null,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function fetchHtml(fetchImpl: FetchLike, url: string) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Stone vendor request failed (${response.status}): ${url}`);
  return response.text();
}

export function parseEwMarbleDetail(html: string, productUrl: string, categoryLabel?: string | null): NormalizedStoneVendorProduct {
  const text = stripHtml(html);
  const title = firstMatch(html, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, /<title\b[^>]*>([\s\S]*?)<\/title>/i]) ?? "Untitled stone";
  const rawType = text.match(/Category:\s*(.*?)\s*(?=Inventory data|Lot Number:|Size:|Availability:|$)/i)?.[1]?.trim() || categoryLabel || "Unknown";
  const stoneType = normalizeStoneTypeName(rawType);
  const lot = text.match(/Lot Number:\s*(.*?)\s*(?=Size:|Availability:|$)/i)?.[1]?.trim().replace(/^lot\s*:\s*/i, "") ?? null;
  const dimensions = text.match(/Size:\s*(.*?)\s*(?=Availability:|$)/i)?.[1]?.trim().replace(/^approx(?:imate)?\s*size\s*:\s*/i, "") ?? null;
  const availabilityLabel = text.match(/Availability:\s*(In stock|limited availability|out of stock|unavailable)/i)?.[1] ?? null;
  const colors = (text.match(/Color:\s*(.*?)\s*(?=Category:|Inventory data|Lot Number:|Size:|Availability:|$)/i)?.[1] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const thickness = inferThickness(title, text);
  const finish = inferFinish(title);
  const family = familyName(title, stoneType);
  const path = new URL(productUrl).pathname.split("/").filter(Boolean);
  const externalId = path.slice(-2).join(":") || slugify(title);
  const availability = normalizedAvailability(availabilityLabel);
  return {
    vendorCode: "ew_marble",
    externalId,
    sku: lot,
    title,
    description: null,
    productUrl,
    familyKey: `EW:${slugify(family)}`,
    variantCode: slugify([thickness, finish, lot].filter(Boolean).join("-")) || null,
    variantLabel: [thickness, finish, lot ? `Lot ${lot}` : null].filter(Boolean).join(" / ") || null,
    sourceStoneTypeName: rawType,
    stoneTypeName: stoneType,
    brand: "East West Marble",
    collection: null,
    colors,
    backgroundColor: colors[0] ?? null,
    veinColors: [],
    colorTone: null,
    features: [],
    variant: { vendorSku: lot, form: "SLAB", thickness, finish, dimensions, slabSizeClass: null, bookMatch: null },
    vendorInventory: [{ lotNumber: lot, batchNumber: null, location: "Chantilly, VA", dimensions, quantity: null, availability: availability.status }],
    availability,
    assets: imageAssets(html, productUrl, title),
    sourcePayload: { source: "html", rawStoneType: rawType, lotNumber: lot, dimensions, availability: availabilityLabel },
  };
}

export function parseVeneziaDetail(html: string, productUrl: string, categoryLabel?: string | null): NormalizedStoneVendorProduct {
  const text = stripHtml(html);
  const title = firstMatch(html, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, /<title\b[^>]*>([\s\S]*?)<\/title>/i]) ?? "Untitled stone";
  const labels = ["Location", "Color", "Category", "Thickness", "Country", "Rating", "Contact Us"];
  const rawType = labeledValue(text, "Category", labels) || categoryLabel || "Unknown";
  const stoneType = normalizeStoneTypeName(rawType);
  const location = labeledValue(text, "Location", labels);
  const colors = (labeledValue(text, "Color", labels) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const thickness = labeledValue(text, "Thickness", labels) || inferThickness(title, text);
  const finish = inferFinish(title);
  const country = labeledValue(text, "Country", labels);
  const inStock = /(?:✓|\b)\s*in\s*stock\b/i.test(text);
  const availability = normalizedAvailability(inStock ? "In stock" : null);
  const slug = new URL(productUrl).pathname.split("/").filter(Boolean).at(-1) || slugify(title);
  const family = familyName(title.replace(/\b(jumbo|sjq|psjq|outdoor)\b/gi, ""), stoneType);
  return {
    vendorCode: "venezia",
    externalId: slug,
    sku: null,
    title,
    description: firstMatch(html, [/About\s+[^:]+:\s*<[^>]*>([\s\S]*?)<\/[^>]+>/i]) ?? null,
    productUrl,
    familyKey: `VENEZIA:${slugify(family)}`,
    variantCode: slugify([thickness, finish, /jumbo/i.test(title) ? "jumbo" : null].filter(Boolean).join("-")) || null,
    variantLabel: [thickness, finish, /jumbo/i.test(title) ? "Jumbo" : null].filter(Boolean).join(" / ") || null,
    sourceStoneTypeName: rawType,
    stoneTypeName: stoneType,
    brand: "Venezia Surfaces",
    collection: null,
    colors,
    backgroundColor: colors[0] ?? null,
    veinColors: [],
    colorTone: null,
    features: [],
    variant: { vendorSku: null, form: "SLAB", thickness, finish, dimensions: null, slabSizeClass: /jumbo/i.test(title) ? "Jumbo" : null, bookMatch: null },
    vendorInventory: location ? location.split(",").map((value) => ({ lotNumber: null, batchNumber: null, location: value.trim(), dimensions: null, quantity: null, availability: value.toLowerCase().includes("in transit") ? "UNKNOWN" as const : inStock ? "AVAILABLE" as const : "UNKNOWN" as const })) : [],
    availability,
    assets: imageAssets(html, productUrl, title),
    sourcePayload: { source: "html", rawStoneType: rawType, location, country },
  };
}

function discoverLinks(html: string, baseUrl: string, pattern: RegExp) {
  const byUrl = new Map<string, string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(baseUrl, match[1]);
    if (!url || !pattern.test(new URL(url).pathname)) continue;
    byUrl.set(url, stripHtml(match[2]));
  }
  return [...byUrl.entries()].map(([url, label]) => ({ url, label }));
}

export class EwMarbleStoneAdapter implements StoneVendorAdapter {
  readonly vendorCode = "ew_marble" as const;
  readonly displayName = "East West Marble";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://www.ewmarble.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async listCategories(): Promise<StoneVendorCategory[]> {
    const html = await fetchHtml(this.fetchImpl, `${this.baseUrl}/products`);
    return discoverLinks(html, this.baseUrl, /^\/products\/category\/view\/\d+\/?$/i)
      .map(({ url, label }) => ({ key: new URL(url).pathname.split("/").filter(Boolean).at(-1)!, label: label || "Stone", productCount: null }))
      .filter((value, index, all) => all.findIndex((candidate) => candidate.key === value.key) === index);
  }
  async discover(scope: StoneVendorDiscoveryScope = {}) {
    const categories = scope.categoryKey
      ? [{ key: scope.categoryKey, label: scope.categoryLabel || scope.categoryKey, productCount: null }]
      : await this.listCategories();
    const products: Array<{ url: string; categoryLabel: string }> = [];
    for (const category of categories) {
      const html = await fetchHtml(this.fetchImpl, `${this.baseUrl}/products/category/view/${encodeURIComponent(category.key)}`);
      for (const link of discoverLinks(html, this.baseUrl, /^\/products\/product\/view\/\d+\/\d+\/?$/i)) {
        products.push({ url: link.url, categoryLabel: category.label });
      }
    }
    const unique = [...new Map(products.map((item) => [item.url, item])).values()];
    return mapWithConcurrency(unique, 3, async (item) => parseEwMarbleDetail(await fetchHtml(this.fetchImpl, item.url), item.url, item.categoryLabel));
  }
}

export class VeneziaStoneAdapter implements StoneVendorAdapter {
  readonly vendorCode = "venezia" as const;
  readonly displayName = "Venezia Surfaces";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://www.veneziasurfaces.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async listCategories(): Promise<StoneVendorCategory[]> {
    const html = await fetchHtml(this.fetchImpl, `${this.baseUrl}/catalog`);
    return discoverLinks(html, this.baseUrl, /^\/catalog\/[^/]+\/?$/i)
      .map(({ url, label }) => ({ key: new URL(url).pathname.split("/").filter(Boolean).at(-1)!, label: label || "Stone", productCount: null }))
      .filter((value, index, all) => all.findIndex((candidate) => candidate.key === value.key) === index);
  }
  async discover(scope: StoneVendorDiscoveryScope = {}) {
    const categories = scope.categoryKey
      ? [{ key: scope.categoryKey, label: scope.categoryLabel || scope.categoryKey, productCount: null }]
      : await this.listCategories();
    const products: Array<{ url: string; categoryLabel: string }> = [];
    for (const category of categories) {
      const html = await fetchHtml(this.fetchImpl, `${this.baseUrl}/catalog/${encodeURIComponent(category.key)}`);
      const pattern = new RegExp(`^/catalog/${category.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+/?$`, "i");
      for (const link of discoverLinks(html, this.baseUrl, pattern)) products.push({ url: link.url, categoryLabel: category.label });
    }
    const unique = [...new Map(products.map((item) => [item.url, item])).values()];
    return mapWithConcurrency(unique, 3, async (item) => parseVeneziaDetail(await fetchHtml(this.fetchImpl, item.url), item.url, item.categoryLabel));
  }
}

export const stoneVendorCatalogRegistry = {
  ew_marble: () => new EwMarbleStoneAdapter(),
  venezia: () => new VeneziaStoneAdapter(),
  msi: () => new MsiStoneAdapter(),
  marble_systems: () => new MarbleSystemsStoneAdapter(),
} satisfies Record<string, () => StoneVendorAdapter>;

export const stoneVendorCatalogLabels = {
  ew_marble: "East West Marble",
  venezia: "Venezia Surfaces",
  msi: "MSI Surfaces",
  marble_systems: "Marble Systems",
} as const;

export function getStoneVendorCatalogAdapter(vendorCode: string) {
  const factory = stoneVendorCatalogRegistry[vendorCode.toLowerCase() as keyof typeof stoneVendorCatalogRegistry];
  if (!factory) throw new Error(`Unknown stone vendor catalog adapter: ${vendorCode}`);
  return factory();
}
