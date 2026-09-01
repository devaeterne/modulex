import type {
  NormalizedVendorProduct,
  VendorAsset,
  VendorAssetKind,
  VendorCatalogAdapter,
} from "@/lib/vendor-catalog/domain";

type FetchLike = typeof fetch;

type AdapterOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

const DOCUMENT_EXTENSIONS = ["pdf", "dxf", "dwg", "step", "stp", "zip"] as const;

function stripHtml(value: string | null | undefined) {
  if (!value) return null;
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}

function absoluteUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function documentKind(url: string): VendorAssetKind {
  const normalized = url.toLowerCase();
  if (/\.(dxf|dwg|step|stp)(?:$|[?#])/.test(normalized)) return "cad";
  if (/\.pdf(?:$|[?#])/.test(normalized)) return "specification";
  return "document";
}

function mergeAssets(...groups: VendorAsset[][]) {
  const byIdentity = new Map<string, VendorAsset>();
  for (const asset of groups.flat()) {
    byIdentity.set(`${asset.kind}:${asset.url}`, asset);
  }
  return [...byIdentity.values()];
}

export function extractDocumentAssets(html: string, baseUrl: string): VendorAsset[] {
  const assets = new Map<string, VendorAsset>();
  const hrefPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html))) {
    const href = match[1];
    const extensionPattern = new RegExp(`\\.(${DOCUMENT_EXTENSIONS.join("|")})(?:$|[?#])`, "i");
    const extension = href.match(extensionPattern)?.[1]?.toLowerCase();
    if (!extension) continue;

    const url = absoluteUrl(baseUrl, href);
    if (!url) continue;

    assets.set(url, {
      kind: documentKind(url),
      url,
      label: stripHtml(match[2]) ?? null,
      fileType: extension,
    });
  }

  return [...assets.values()];
}

async function fetchDetailAssets(fetchImpl: FetchLike, productUrl: string) {
  try {
    const response = await fetchImpl(productUrl, {
      headers: { accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    return extractDocumentAssets(await response.text(), productUrl);
  } catch {
    return [];
  }
}

function normalizePrice(value: unknown, minorUnit = 0) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return minorUnit > 0 ? numeric / 10 ** minorUnit : numeric;
}

type ShopifyProduct = {
  id: number | string;
  title?: string;
  handle?: string;
  body_html?: string;
  images?: Array<{ src?: string; alt?: string | null }>;
  variants?: Array<{
    id: number | string;
    sku?: string | null;
    title?: string | null;
    price?: string | number | null;
  }>;
};

export class KarranAdapter implements VendorCatalogAdapter {
  readonly vendorCode = "karran";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://karran.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async discover(): Promise<NormalizedVendorProduct[]> {
    const products: ShopifyProduct[] = [];

    for (let page = 1; page <= 100; page += 1) {
      const url = `${this.baseUrl}/products.json?limit=250&page=${page}`;
      const response = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Karran catalog request failed (${response.status})`);
      }

      const payload = (await response.json()) as { products?: ShopifyProduct[] };
      const batch = payload.products ?? [];
      products.push(...batch);
      if (batch.length < 250) break;
    }

    const normalized: NormalizedVendorProduct[] = [];
    for (const product of products) {
      const productUrl = `${this.baseUrl}/products/${product.handle ?? product.id}`;
      const images: VendorAsset[] = (product.images ?? [])
        .filter((image): image is { src: string; alt?: string | null } => Boolean(image.src))
        .map((image) => ({
          kind: "image",
          url: image.src,
          label: image.alt ?? null,
          fileType: null,
        }));
      const variants = product.variants?.length
        ? product.variants
        : [{ id: product.id, sku: null, title: null, price: null }];

      for (const variant of variants) {
        normalized.push({
          vendorCode: this.vendorCode,
          externalId: `${product.id}:${variant.id}`,
          sku: variant.sku?.trim() || null,
          title:
            variant.title && variant.title !== "Default Title"
              ? `${product.title ?? "Untitled product"} — ${variant.title}`
              : product.title ?? "Untitled product",
          description: stripHtml(product.body_html),
          productUrl,
          vendorPriceReference: normalizePrice(variant.price),
          vendorCurrency: "USD",
          assets: images,
          sourcePayload: { product, variant },
        });
      }
    }

    return normalized;
  }

  async enrich(product: NormalizedVendorProduct) {
    const detailAssets = await fetchDetailAssets(this.fetchImpl, product.productUrl);
    return { ...product, assets: mergeAssets(product.assets, detailAssets) };
  }
}

type WooProduct = {
  id: number | string;
  name?: string;
  permalink?: string;
  sku?: string | null;
  description?: string;
  short_description?: string;
  prices?: {
    price?: string | number | null;
    currency_code?: string | null;
    currency_minor_unit?: number | null;
  };
  images?: Array<{ src?: string; alt?: string | null }>;
};

function extractSitemapUrls(xml: string) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function titleFromSlug(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export class RuvatiAdapter implements VendorCatalogAdapter {
  readonly vendorCode = "ruvati";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://www.ruvati.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async discover(): Promise<NormalizedVendorProduct[]> {
    const products = await this.discoverFromStoreApi();
    if (products) return products;
    return this.discoverFromSitemap();
  }

  async enrich(product: NormalizedVendorProduct) {
    const detailAssets = await fetchDetailAssets(this.fetchImpl, product.productUrl);
    return { ...product, assets: mergeAssets(product.assets, detailAssets) };
  }

  private async discoverFromStoreApi(): Promise<NormalizedVendorProduct[] | null> {
    const products: WooProduct[] = [];

    for (let page = 1; page <= 100; page += 1) {
      const url = `${this.baseUrl}/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
      } catch {
        return page === 1 ? null : this.normalizeWooProducts(products);
      }

      if (!response.ok) return page === 1 ? null : this.normalizeWooProducts(products);
      const batch = (await response.json()) as WooProduct[];
      products.push(...batch);
      if (batch.length < 100) break;
    }

    return this.normalizeWooProducts(products);
  }

  private normalizeWooProducts(products: WooProduct[]) {
    return products.map<NormalizedVendorProduct>((product) => {
      const productUrl = product.permalink ?? `${this.baseUrl}/?p=${product.id}`;
      const images: VendorAsset[] = (product.images ?? [])
        .filter((image): image is { src: string; alt?: string | null } => Boolean(image.src))
        .map((image) => ({ kind: "image", url: image.src, label: image.alt ?? null, fileType: null }));
      const minorUnit = product.prices?.currency_minor_unit ?? 0;

      return {
        vendorCode: this.vendorCode,
        externalId: String(product.id),
        sku: product.sku?.trim() || null,
        title: product.name ?? "Untitled product",
        description: stripHtml(product.description ?? product.short_description),
        productUrl,
        vendorPriceReference: normalizePrice(product.prices?.price, minorUnit),
        vendorCurrency: product.prices?.currency_code ?? "USD",
        assets: images,
        sourcePayload: product,
      };
    });
  }

  private async discoverFromSitemap(): Promise<NormalizedVendorProduct[]> {
    const sitemapUrl = `${this.baseUrl}/product-sitemap.xml`;
    const response = await this.fetchImpl(sitemapUrl, {
      headers: { accept: "application/xml,text/xml" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Ruvati catalog discovery failed (${response.status})`);
    }

    return extractSitemapUrls(await response.text()).map((productUrl) => {
      const slug = new URL(productUrl).pathname.split("/").filter(Boolean).at(-1) ?? productUrl;
      return {
        vendorCode: this.vendorCode,
        externalId: `sitemap:${slug}`,
        sku: null,
        title: titleFromSlug(slug),
        description: null,
        productUrl,
        vendorPriceReference: null,
        vendorCurrency: null,
        assets: [],
        sourcePayload: { source: "product-sitemap.xml", productUrl },
      } satisfies NormalizedVendorProduct;
    });
  }
}

export const vendorCatalogLabels: Record<string, string> = {
  karran: "Karran",
  ruvati: "Ruvati",
};

export const vendorCatalogImageHosts: Record<string, string[]> = {
  karran: ["karran.com", "www.karran.com", "cdn.shopify.com"],
  ruvati: ["ruvati.com", "www.ruvati.com"],
};

export const vendorCatalogRegistry: Record<string, () => VendorCatalogAdapter> = {
  karran: () => new KarranAdapter(),
  ruvati: () => new RuvatiAdapter(),
};

export function getVendorCatalogAdapter(vendorCode: string) {
  const factory = vendorCatalogRegistry[vendorCode.toLowerCase()];
  if (!factory) throw new Error(`Unknown vendor catalog adapter: ${vendorCode}`);
  return factory();
}