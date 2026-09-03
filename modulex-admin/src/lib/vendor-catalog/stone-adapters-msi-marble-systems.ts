import {
  normalizeStoneTypeName,
  type NormalizedStoneVendorProduct,
  type StoneVendorAdapter,
  type StoneVendorAsset,
  type StoneVendorAvailabilityStatus,
  type StoneVendorCategory,
  type StoneVendorDiscoveryScope,
  type StoneVendorVariant,
} from "@/lib/vendor-catalog/stone-domain";

type FetchLike = typeof fetch;
type AdapterOptions = { baseUrl?: string; fetchImpl?: FetchLike };

function absoluteUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
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

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "stone";
}

function imageAssets(html: string, baseUrl: string, title: string): StoneVendorAsset[] {
  const byUrl = new Map<string, StoneVendorAsset>();
  const firstWord = title.toLowerCase().split(/\s+/)[0] ?? "";
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const url = absoluteUrl(baseUrl, match[1]);
    if (!url || !/^https:/i.test(url)) continue;
    const tag = match[0];
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1];
    const label = alt ? decodeHtml(alt).trim() : null;
    if (label && firstWord && !label.toLowerCase().includes(firstWord)) continue;
    const lower = `${label ?? ""} ${url}`.toLowerCase();
    const role: StoneVendorAsset["role"] = lower.includes("room") || lower.includes("vignette")
      ? "ROOM"
      : lower.includes("close") || lower.includes("detail")
        ? "CLOSE_UP"
        : "SLAB";
    byUrl.set(url, { kind: "image", url, label, role });
  }
  return [...byUrl.values()];
}

function unknownAvailability(stockQuantity: number | null = null) {
  return {
    status: "UNKNOWN" as const,
    available: null,
    purchasable: null,
    stockQuantity,
  };
}

function availabilityFromText(value: string | null, quantity: number | null) {
  const lower = value?.toLowerCase() ?? "";
  let status: StoneVendorAvailabilityStatus = "UNKNOWN";
  if ((quantity ?? 0) > 0 || /\bin\s*stock\b|\bavailable\b/.test(lower)) status = "AVAILABLE";
  else if (/out\s*of\s*stock/.test(lower)) status = "OUT_OF_STOCK";
  else if (/unavailable/.test(lower)) status = "UNAVAILABLE";
  return {
    status,
    available: status === "AVAILABLE" ? true : status === "OUT_OF_STOCK" || status === "UNAVAILABLE" ? false : null,
    purchasable: status === "UNAVAILABLE" ? false : status === "AVAILABLE" ? true : null,
    stockQuantity: quantity,
  };
}

function familyName(title: string, stoneType: string) {
  return title
    .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, "")
    .replace(/\b\d+\s*mm\b/gi, "")
    .replace(/\b\d+\s*\/\s*\d+\s*["”]\s*(?:thick)?\b/gi, "")
    .replace(/\b(polished|honed|brushed|leathered?|matte|textured|multifinish)\b/gi, "")
    .replace(/\bslab\b|\brandom\b|\bfinish\b/gi, "")
    .replace(new RegExp(`\\b${stoneType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), "")
    .replace(/\s+/g, " ")
    .trim() || title.trim();
}

function discoverLinks(
  html: string,
  baseUrl: string,
  accept: (pathname: string, label: string) => boolean
) {
  const byUrl = new Map<string, string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(baseUrl, match[1]);
    if (!url) continue;
    const label = stripHtml(match[2]);
    if (!accept(new URL(url).pathname, label)) continue;
    byUrl.set(url, label);
  }
  return [...byUrl.entries()].map(([url, label]) => ({ url, label }));
}

async function fetchHtml(fetchImpl: FetchLike, url: string) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Stone vendor request failed (${response.status}): ${url}`);
  return response.text();
}

async function fetchOptionalDetailHtml(fetchImpl: FetchLike, url: string) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Stone vendor request failed (${response.status}): ${url}`);
  return response.text();
}

async function fetchPaginationHtml(fetchImpl: FetchLike, url: string, page: number) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (page > 1 && response.status === 404) return null;
  if (page > 2 && response.status >= 500) return null;
  if (!response.ok) throw new Error(`Stone vendor request failed (${response.status}): ${url}`);
  return response.text();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
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

function metaDescription(html: string) {
  return firstMatch(html, [
    /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']description["'][^>]*>/i,
  ]);
}

function commaValues(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function msiField(text: string, label: string, nextLabels: string[]) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const next = nextLabels
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return text.match(new RegExp(`${escaped}\\s*:?(.*?)\\s*(?=${next ? `(?:${next})\\s*:?'?` : "$"})`, "i"))?.[1]?.trim() || null;
}

function msiPaginationProgress(html: string) {
  const text = stripHtml(html);
  const match = text.match(/\bShowing\s+(\d+)(?:\s*[-–—]\s*(\d+))?\s+of\s+(\d+)\b/i);
  if (!match) return null;
  const shown = Number(match[2] ?? match[1]);
  const total = Number(match[3]);
  if (!Number.isFinite(shown) || !Number.isFinite(total) || total < 0) return null;
  return { shown, total };
}

function inferMsiMaterial(text: string, productUrl: string, categoryLabel?: string | null) {
  const explicit = text.match(/Material Type\s*:?[\s-]*(Glazed Porcelain|Porcelain|Quartzite|Granite|Marble|Travertine|Soapstone|Quartz)\b/i)?.[1];
  if (explicit) return explicit;
  const path = new URL(productUrl).pathname.toLowerCase();
  if (path.includes("/quartz-countertops/")) return "Quartz";
  if (path.includes("/porcelain-slabs/")) return "Porcelain";
  if (path.includes("/quartzite/")) return "Quartzite";
  if (path.includes("/granite/")) return "Granite";
  if (path.includes("/marble/")) return "Marble";
  return categoryLabel || "Unknown";
}

function inferMsiFinish(title: string, sku: string, fallback: string | null) {
  const titleFinish = title.match(/\b(polished|honed|brushed|matte|textured)\b/i)?.[1];
  if (titleFinish) return titleFinish[0].toUpperCase() + titleFinish.slice(1).toLowerCase();
  if (/-BR\*?$/i.test(sku)) return "Brushed";
  if (/-H\*?$/i.test(sku)) return "Honed";
  if (/-MAT\*?$/i.test(sku)) return "Matte";
  if (/-POL\*?$/i.test(sku)) return "Polished";
  return fallback;
}

function msiVariants(text: string, title: string, fallbackFinish: string | null): StoneVendorVariant[] {
  const variants: StoneVendorVariant[] = [];
  for (const match of text.matchAll(/ID#:\s*([A-Z0-9*._-]+)/gi)) {
    const rawSku = match[1];
    const sku = rawSku.replace(/\*+$/, "");
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 190), index);
    const suffix = text.slice(index + match[0].length, index + match[0].length + 180);
    const sizes = [...prefix.matchAll(/(\d{1,3}(?:\.\d+)?\s*(?:CM|MM)|\d{2,3}\s*[xX]\s*\d{2,3}\s*[xX]\s*\d+(?:\.\d+)?\s*CM)/gi)];
    const thickness = sizes.at(-1)?.[1]?.replace(/\s+/g, " ") ?? null;
    const explicitFinish = suffix.match(/Finish\s*:\s*([A-Za-z ]+?)(?=Dimensions|Size|ID#|Applications|$)/i)?.[1]?.trim() ?? null;
    const dimensions = suffix.match(/Dimensions\s*:\s*([0-9.xX"' ]+)/i)?.[1]?.trim() ?? null;
    const form: StoneVendorVariant["form"] = /^PSL-/i.test(sku) ? "PREFAB" : "SLAB";
    variants.push({
      vendorSku: sku,
      form,
      thickness,
      finish: inferMsiFinish(title, rawSku, explicitFinish || fallbackFinish),
      dimensions,
      slabSizeClass: /jumbo/i.test(`${prefix} ${title}`) ? "Jumbo" : null,
      bookMatch: null,
    });
  }
  return variants.filter((variant) => variant.form === "SLAB");
}

export function parseMsiDetailVariants(
  html: string,
  productUrl: string,
  categoryLabel?: string | null
): NormalizedStoneVendorProduct[] {
  const text = stripHtml(html);
  const title = firstMatch(html, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, /<title\b[^>]*>([\s\S]*?)<\/title>/i]) ?? "Untitled stone";
  const rawType = inferMsiMaterial(text, productUrl, categoryLabel);
  const stoneType = normalizeStoneTypeName(rawType);
  const primaryColors = commaValues(msiField(text, "Primary Color(s)", ["Accent Color(s)", "Other Industry Names", "Style", "Available Finishes", "Price Range", "Material Type", "Country"]));
  const accentColors = commaValues(msiField(text, "Accent Color(s)", ["Other Industry Names", "Style", "Available Finishes", "Price Range", "Material Type", "Country"]));
  const availableFinishes = commaValues(msiField(text, "Available Finishes", ["Price Range", "Body Type", "Book Match", "Variations", "SLABS", "Slabs & Countertops", "Additional Resources"]));
  const bookMatchText = msiField(text, "Book Match", ["Variations", "SLABS", "Slabs & Countertops", "Additional Resources"]);
  const bookMatch = bookMatchText && /^yes$/i.test(bookMatchText)
    ? true
    : bookMatchText && /^(?:no|n\/a)$/i.test(bookMatchText)
      ? false
      : null;
  const collection = text.match(/(?:part of|from)\s+(?:the\s+)?([^.!]{1,80}?\s+Collection)\b/i)?.[1]?.trim() ?? null;
  const slug = new URL(productUrl).pathname.split("/").filter(Boolean).at(-1) || slugify(title);
  const family = familyName(title, stoneType);
  const parsedVariants = msiVariants(text, title, availableFinishes[0] ?? null);
  const variants = parsedVariants.length > 0
    ? parsedVariants
    : [{
        vendorSku: null,
        form: "SLAB" as const,
        thickness: text.match(/\b(\d+(?:\.\d+)?\s*(?:CM|MM))\b/i)?.[1] ?? null,
        finish: availableFinishes[0] ?? title.match(/\b(polished|honed|brushed|matte)\b/i)?.[1] ?? null,
        dimensions: text.match(/Dimensions\s*:\s*([0-9.xX"' ]+)/i)?.[1]?.trim() ?? null,
        slabSizeClass: /jumbo/i.test(text) ? "Jumbo" : null,
        bookMatch,
      }];

  return variants.map((variant) => {
    const externalId = variant.vendorSku || `${slug}:${slugify([variant.thickness, variant.finish].filter(Boolean).join("-"))}`;
    const finish = variant.finish;
    const hydratedVariant = { ...variant, bookMatch };
    return {
      vendorCode: "msi",
      externalId,
      sku: variant.vendorSku,
      title: parsedVariants.length > 1
        ? `${title} — ${[variant.thickness, finish].filter(Boolean).join(" / ")}`
        : title,
      description: metaDescription(html),
      productUrl,
      familyKey: `MSI:${slugify(family)}`,
      variantCode: variant.vendorSku || slugify([variant.thickness, finish].filter(Boolean).join("-")) || null,
      variantLabel: [variant.thickness, finish].filter(Boolean).join(" / ") || null,
      sourceStoneTypeName: rawType,
      stoneTypeName: stoneType,
      brand: "MSI Surfaces",
      collection,
      colors: primaryColors,
      backgroundColor: primaryColors[0] ?? null,
      veinColors: accentColors,
      colorTone: null,
      features: [],
      variant: hydratedVariant,
      vendorInventory: [],
      availability: unknownAvailability(),
      assets: imageAssets(html, productUrl, title),
      sourcePayload: {
        source: "html",
        rawStoneType: rawType,
        productId: variant.vendorSku,
        availableFinishes,
        bookMatch: bookMatchText,
      },
    } satisfies NormalizedStoneVendorProduct;
  });
}

const MSI_CATEGORIES = [
  { key: "quartz", label: "Quartz", path: "/quartz-countertops/quartz-collections/" },
  { key: "granite", label: "Granite", path: "/granite-countertops/" },
  { key: "quartzite", label: "Quartzite", path: "/quartzite-countertops/" },
  { key: "marble", label: "Marble", path: "/marble-countertops/" },
  { key: "porcelain", label: "Porcelain", path: "/stile/porcelain-countertops-colors/" },
] as const;

function isMsiProductPath(pathname: string, categoryKey: string) {
  if (categoryKey === "quartz") {
    return /^\/quartz-countertops\/[^/]+\/?$/i.test(pathname)
      && !/\/(?:quartz-collections|marble-look-quartz|quartz-resources-downloads)\/?$/i.test(pathname);
  }
  if (categoryKey === "granite") return /^\/(?:granite|hdis\/granite)\/[^/]+\/?$/i.test(pathname);
  if (categoryKey === "quartzite") return /^\/(?:quartzite|hdis\/quartzite)\/[^/]+\/?$/i.test(pathname);
  if (categoryKey === "marble") return /^\/(?:marble|hdis\/marble)\/[^/]+\/?$/i.test(pathname);
  if (categoryKey === "porcelain") return /^\/porcelain-slabs\/[^/]+\/?$/i.test(pathname);
  return false;
}

export class MsiStoneAdapter implements StoneVendorAdapter {
  readonly vendorCode = "msi" as const;
  readonly displayName = "MSI Surfaces";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://www.msisurfaces.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listCategories(): Promise<StoneVendorCategory[]> {
    return MSI_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      productCount: null,
    }));
  }

  async discover(scope: StoneVendorDiscoveryScope = {}) {
    const categories = scope.categoryKey
      ? MSI_CATEGORIES.filter((category) => category.key === scope.categoryKey)
      : [...MSI_CATEGORIES];
    if (scope.categoryKey && categories.length === 0) {
      throw new Error(`Unknown MSI Stone category: ${scope.categoryKey}`);
    }

    const links: Array<{ url: string; categoryLabel: string }> = [];
    for (const category of categories) {
      let previousCount = -1;
      for (let page = 1; page <= 6; page += 1) {
        const separator = category.path.includes("?") ? "&" : "?";
        const listUrl = `${this.baseUrl}${category.path}${page > 1 ? `${separator}page=${page}` : ""}`;
        const html = await fetchPaginationHtml(this.fetchImpl, listUrl, page);
        if (html === null) break;
        const pageLinks = discoverLinks(
          html,
          this.baseUrl,
          (pathname) => isMsiProductPath(pathname, category.key)
        );
        for (const link of pageLinks) links.push({ url: link.url, categoryLabel: category.label });
        const progress = msiPaginationProgress(html);
        if (progress && progress.shown >= progress.total) break;
        const uniqueCount = new Set(links.map((item) => item.url)).size;
        if (uniqueCount === previousCount || pageLinks.length === 0) break;
        previousCount = uniqueCount;
      }
    }

    const unique = [...new Map(links.map((item) => [item.url, item])).values()];
    const groups = await mapWithConcurrency(unique, 3, async (item) =>
      parseMsiDetailVariants(await fetchHtml(this.fetchImpl, item.url), item.url, item.categoryLabel)
    );
    return groups.flat();
  }
}

function marbleSystemsMaterial(text: string, title: string, categoryLabel?: string | null) {
  const explicit = text.match(/\bMaterial\s*:?[\s-]*(Quartzite|Granite|Marble|Limestone|Travertine|Soapstone|Onyx|Quartz|Porcelain)\b/i)?.[1];
  if (explicit) return explicit;
  return title.match(/\b(Quartzite|Granite|Marble|Limestone|Travertine|Soapstone|Onyx|Quartz|Porcelain)\b/i)?.[1]
    || categoryLabel
    || "Unknown";
}

export function parseMarbleSystemsDetail(
  html: string,
  productUrl: string,
  categoryLabel?: string | null
): NormalizedStoneVendorProduct {
  const text = stripHtml(html);
  const title = firstMatch(html, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, /<title\b[^>]*>([\s\S]*?)<\/title>/i]) ?? "Untitled stone";
  const itemCode = text.match(/Item Code\s*:\s*([A-Z0-9._-]+)/i)?.[1] ?? null;
  const rawType = marbleSystemsMaterial(text, title, categoryLabel);
  const stoneType = normalizeStoneTypeName(rawType);
  const thickness = text.match(/Thickness\s*:\s*([^:]{1,40}?)(?=Stock|Weight|Current inventory|$)/i)?.[1]?.trim()
    || title.match(/(\d+\s*\/\s*\d+\s*["”]\s*thick)/i)?.[1]
    || null;
  const finish = text.match(/\bFinish\s*:?[\s-]*(Polished|Honed|Brushed|Leather(?:ed)?|Textured|Multifinish|Matte)\b/i)?.[1]
    || title.match(/\b(Polished|Honed|Brushed|Leather(?:ed)?|Textured|Multifinish|Matte)\b/i)?.[1]
    || null;
  const color = text.match(/\bColor\s*:?[\s-]*([A-Za-z][A-Za-z /-]{0,50}?)(?=Finish|At Marble Systems|Weight|Coverage|$)/i)?.[1]?.trim() ?? null;
  const dimensions = text.match(/Dimensions\s*:?[\s-]*([0-9.]+\s*[xX]\s*[0-9.]+\s*(?:inches|inch|["”])?)/i)?.[1]?.trim() ?? null;
  const quantityValue = text.match(/Available Quantity\s*:?[\s-]*(\d+(?:\.\d+)?)\s*(?:pcs|pieces)?/i)?.[1];
  const quantity = quantityValue ? Number(quantityValue) : null;
  const location = text.match(/Location\s*:?[\s-]*([A-Za-z .'-]+,\s*[A-Z]{2})\b/i)?.[1]?.trim() ?? null;
  const statusText = text.match(/(?:Product )?Status\s*:?[\s-]*(Available|Unavailable|In Stock|Out of Stock|Loft Group)/i)?.[1]
    || text.match(/Stock\s*:?[\s-]*(In Stock|Out of Stock|Currently Unavailable)/i)?.[1]
    || null;
  const availability = availabilityFromText(statusText, quantity);
  const slug = new URL(productUrl).pathname.split("/").filter(Boolean).at(-1) || slugify(title);
  const family = familyName(title, stoneType);
  return {
    vendorCode: "marble_systems",
    externalId: itemCode || slug,
    sku: itemCode,
    title,
    description: metaDescription(html),
    productUrl,
    familyKey: `MARBLE-SYSTEMS:${slugify(family)}`,
    variantCode: itemCode || slugify([thickness, finish].filter(Boolean).join("-")) || null,
    variantLabel: [thickness, finish].filter(Boolean).join(" / ") || null,
    sourceStoneTypeName: rawType,
    stoneTypeName: stoneType,
    brand: "Marble Systems",
    collection: null,
    colors: color ? [color] : [],
    backgroundColor: color,
    veinColors: [],
    colorTone: null,
    features: [],
    variant: {
      vendorSku: itemCode,
      form: "SLAB",
      thickness,
      finish,
      dimensions,
      slabSizeClass: null,
      bookMatch: null,
    },
    vendorInventory: [{
      lotNumber: null,
      batchNumber: null,
      location,
      dimensions,
      quantity,
      availability: availability.status,
    }],
    availability,
    assets: imageAssets(html, productUrl, title),
    sourcePayload: {
      source: "html",
      itemCode,
      rawStoneType: rawType,
      status: statusText,
      location,
      availableQuantity: quantity,
    },
  };
}

export class MarbleSystemsStoneAdapter implements StoneVendorAdapter {
  readonly vendorCode = "marble_systems" as const;
  readonly displayName = "Marble Systems";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://www.marblesystems.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listCategories(): Promise<StoneVendorCategory[]> {
    const html = await fetchHtml(this.fetchImpl, `${this.baseUrl}/slabs/`);
    return discoverLinks(
      html,
      this.baseUrl,
      (pathname) => /^\/slabs\/[^/]+-slabs\/?$/i.test(pathname)
    )
      .map(({ url, label }) => {
        const key = new URL(url).pathname.split("/").filter(Boolean).at(-1)!;
        const normalizedLabel = label.replace(/countertops?\s*&?\s*slabs?/i, "").replace(/slabs?/i, "").trim();
        return { key, label: normalizedLabel || key.replace(/-slabs$/i, ""), productCount: null };
      })
      .filter((value, index, all) => all.findIndex((candidate) => candidate.key === value.key) === index);
  }

  async discover(scope: StoneVendorDiscoveryScope = {}) {
    const categories = scope.categoryKey
      ? [{ key: scope.categoryKey, label: scope.categoryLabel || scope.categoryKey, productCount: null }]
      : await this.listCategories();
    const links: Array<{ url: string; categoryLabel: string }> = [];

    for (const category of categories) {
      const seenInCategory = new Set<string>();
      for (let page = 1; page <= 100; page += 1) {
        const path = page === 1
          ? `/slabs/${encodeURIComponent(category.key)}/`
          : `/slabs/${encodeURIComponent(category.key)}/page/${page}/`;
        const html = await fetchPaginationHtml(this.fetchImpl, `${this.baseUrl}${path}`, page);
        if (html === null) break;
        const pageLinks = discoverLinks(
          html,
          this.baseUrl,
          (pathname) => /^\/product\/[^/]+\/?$/i.test(pathname)
        );
        let added = 0;
        for (const link of pageLinks) {
          if (seenInCategory.has(link.url)) continue;
          seenInCategory.add(link.url);
          links.push({ url: link.url, categoryLabel: category.label });
          added += 1;
        }
        if (added === 0) break;
      }
    }

    const unique = [...new Map(links.map((item) => [item.url, item])).values()];
    const products = await mapWithConcurrency(unique, 3, async (item) => {
      const html = await fetchOptionalDetailHtml(this.fetchImpl, item.url);
      return html === null ? null : parseMarbleSystemsDetail(html, item.url, item.categoryLabel);
    });
    return products.filter(
      (product): product is NormalizedStoneVendorProduct =>
        product !== null && /^SL/i.test(product.sku ?? "") && product.stoneTypeName !== "Unknown"
    );
  }
}
