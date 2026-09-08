import type {
  NormalizedVendorProduct,
  VendorAsset,
  VendorAssetKind,
  VendorCatalogAdapter,
  VendorCatalogCategory,
  VendorCatalogDiscoveryScope,
} from "@/lib/vendor-catalog/domain";

type FetchLike = typeof fetch;

type AdapterOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

const DOCUMENT_EXTENSIONS = ["pdf", "dxf", "dwg", "step", "stp", "zip"] as const;

export const KARRAN_COLOR_SUFFIXES = {
  BL: "Black",
  WH: "White",
  GR: "Grey",
  BI: "Bisque",
  BR: "Brown",
  CN: "Concrete",
  BU: "Blue",
  RD: "Red",
  OR: "Orange",
  GN: "Green",
  YL: "Yellow",
} as const;

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

function fallbackFamilyKey(vendorCode: string, externalId: string, sku: string | null) {
  const normalizedSku = sku?.trim().toUpperCase();
  return normalizedSku || `${vendorCode.toUpperCase()}:${externalId}`;
}

function inferKarranFamily(
  externalId: string,
  sku: string | null,
  title: string
): { familyKey: string; variantCode: string | null; variantLabel: string | null } {
  const normalizedSku = sku?.trim().toUpperCase();
  if (!normalizedSku) {
    return {
      familyKey: fallbackFamilyKey("karran", externalId, sku),
      variantCode: null,
      variantLabel: null,
    };
  }

  const titleLower = title.toLowerCase();
  for (const [code, label] of Object.entries(KARRAN_COLOR_SUFFIXES)) {
    const pattern = new RegExp(`(?:[-_]?${code})$`, "i");
    if (!pattern.test(normalizedSku)) continue;
    if (!titleLower.includes(label.toLowerCase())) continue;

    const familyKey = normalizedSku.replace(pattern, "").replace(/[-_]+$/, "");
    if (!familyKey) break;
    return { familyKey, variantCode: code, variantLabel: label };
  }

  return { familyKey: normalizedSku, variantCode: null, variantLabel: null };
}

function unknownAvailability(): NormalizedVendorProduct["availability"] {
  return {
    status: "UNKNOWN",
    available: null,
    purchasable: null,
    stockQuantity: null,
  };
}

function normalizeKarranAvailability(): NormalizedVendorProduct["availability"] {
  return { status: "AVAILABLE", available: true, purchasable: true, stockQuantity: null };
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
    available?: boolean;
  }>;
};

type ShopifyCollection = {
  id: number | string;
  title?: string;
  handle?: string;
  products_count?: number | null;
};

export class KarranAdapter implements VendorCatalogAdapter {
  readonly vendorCode = "karran";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://karran.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listCategories(): Promise<VendorCatalogCategory[]> {
    const categories: VendorCatalogCategory[] = [];

    for (let page = 1; page <= 100; page += 1) {
      const response = await this.fetchImpl(
        `${this.baseUrl}/collections.json?limit=250&page=${page}`,
        { headers: { accept: "application/json" }, cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(`Karran collection request failed (${response.status})`);
      }

      const payload = (await response.json()) as { collections?: ShopifyCollection[] };
      const batch = payload.collections ?? [];
      for (const collection of batch) {
        const key = collection.handle?.trim();
        if (!key) continue;
        categories.push({
          key,
          label: collection.title?.trim() || key,
          productCount:
            collection.products_count === null || collection.products_count === undefined
              ? null
              : Number(collection.products_count),
        });
      }
      if (batch.length < 250) break;
    }

    return categories.sort((left, right) => left.label.localeCompare(right.label));
  }

  async discover(scope: VendorCatalogDiscoveryScope = {}): Promise<NormalizedVendorProduct[]> {
    const products: ShopifyProduct[] = [];
    const categoryKey = scope.categoryKey?.trim() || null;
    const categoryLabel = scope.categoryLabel?.trim() || categoryKey;

    for (let page = 1; page <= 100; page += 1) {
      const path = categoryKey
        ? `/collections/${encodeURIComponent(categoryKey)}/products.json`
        : "/products.json";
      const url = `${this.baseUrl}${path}?limit=250&page=${page}`;
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
        : [{ id: product.id, sku: null, title: null, price: null, available: undefined }];

      for (const variant of variants) {
        const externalId = `${product.id}:${variant.id}`;
        const title =
          variant.title && variant.title !== "Default Title"
            ? `${product.title ?? "Untitled product"} — ${variant.title}`
            : product.title ?? "Untitled product";
        const family = inferKarranFamily(externalId, variant.sku?.trim() || null, title);

        normalized.push({
          vendorCode: this.vendorCode,
          externalId,
          sku: variant.sku?.trim() || null,
          title,
          description: stripHtml(product.body_html),
          productUrl,
          vendorPriceReference: normalizePrice(variant.price),
          vendorCurrency: "USD",
          vendorCategoryKey: categoryKey,
          vendorCategoryLabel: categoryLabel,
          familyKey: family.familyKey,
          variantCode: family.variantCode,
          variantLabel: family.variantLabel,
          availability: normalizeKarranAvailability(),
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
  categories?: Array<{ id?: number | string; name?: string; slug?: string }>;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
};

type WooCategory = {
  id: number | string;
  name?: string;
  slug?: string;
  count?: number | null;
};

function normalizeRuvatiAvailability(product: WooProduct): NormalizedVendorProduct["availability"] {
  if (product.is_in_stock === false) {
    return {
      status: "OUT_OF_STOCK",
      available: false,
      purchasable: product.is_purchasable ?? null,
      stockQuantity: null,
    };
  }
  if (product.is_in_stock === true) {
    return {
      status: "AVAILABLE",
      available: true,
      purchasable: product.is_purchasable ?? null,
      stockQuantity: null,
    };
  }
  return {
    status: "UNKNOWN",
    available: null,
    purchasable: product.is_purchasable ?? null,
    stockQuantity: null,
  };
}

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

  async listCategories(): Promise<VendorCatalogCategory[]> {
    const categories: VendorCatalogCategory[] = [];

    for (let page = 1; page <= 100; page += 1) {
      const response = await this.fetchImpl(
        `${this.baseUrl}/wp-json/wc/store/v1/products/categories?per_page=100&page=${page}&hide_empty=true`,
        { headers: { accept: "application/json" }, cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(`Ruvati category request failed (${response.status})`);
      }
      const batch = (await response.json()) as WooCategory[];
      for (const category of batch) {
        const key = category.slug?.trim() || String(category.id);
        categories.push({
          key,
          label: category.name?.trim() || key,
          productCount:
            category.count === null || category.count === undefined
              ? null
              : Number(category.count),
        });
      }
      if (batch.length < 100) break;
    }

    return categories.sort((left, right) => left.label.localeCompare(right.label));
  }

  async discover(scope: VendorCatalogDiscoveryScope = {}): Promise<NormalizedVendorProduct[]> {
    const products = await this.discoverFromStoreApi(scope);
    if (products) return products;
    if (scope.categoryKey) {
      throw new Error("Ruvati category-scoped discovery requires the WooCommerce Store API.");
    }
    return this.discoverFromSitemap();
  }

  async enrich(product: NormalizedVendorProduct) {
    const detailAssets = await fetchDetailAssets(this.fetchImpl, product.productUrl);
    return { ...product, assets: mergeAssets(product.assets, detailAssets) };
  }

  private async discoverFromStoreApi(
    scope: VendorCatalogDiscoveryScope
  ): Promise<NormalizedVendorProduct[] | null> {
    const products: WooProduct[] = [];

    for (let page = 1; page <= 100; page += 1) {
      const params = new URLSearchParams({ per_page: "100", page: String(page) });
      if (scope.categoryKey) params.set("category", scope.categoryKey);
      const url = `${this.baseUrl}/wp-json/wc/store/v1/products?${params.toString()}`;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
      } catch {
        return page === 1 ? null : this.normalizeWooProducts(products, scope);
      }

      if (!response.ok) return page === 1 ? null : this.normalizeWooProducts(products, scope);
      const batch = (await response.json()) as WooProduct[];
      products.push(...batch);
      if (batch.length < 100) break;
    }

    return this.normalizeWooProducts(products, scope);
  }

  private normalizeWooProducts(
    products: WooProduct[],
    scope: VendorCatalogDiscoveryScope
  ) {
    return products.map<NormalizedVendorProduct>((product) => {
      const productUrl = product.permalink ?? `${this.baseUrl}/?p=${product.id}`;
      const images: VendorAsset[] = (product.images ?? [])
        .filter((image): image is { src: string; alt?: string | null } => Boolean(image.src))
        .map((image) => ({ kind: "image", url: image.src, label: image.alt ?? null, fileType: null }));
      const minorUnit = product.prices?.currency_minor_unit ?? 0;
      const firstCategory = product.categories?.[0];
      const categoryKey = scope.categoryKey?.trim() || firstCategory?.slug?.trim() || null;
      const categoryLabel =
        scope.categoryLabel?.trim() || firstCategory?.name?.trim() || categoryKey;
      const externalId = String(product.id);
      const sku = product.sku?.trim() || null;

      return {
        vendorCode: this.vendorCode,
        externalId,
        sku,
        title: product.name ?? "Untitled product",
        description: stripHtml(product.description ?? product.short_description),
        productUrl,
        vendorPriceReference: normalizePrice(product.prices?.price, minorUnit),
        vendorCurrency: product.prices?.currency_code ?? "USD",
        vendorCategoryKey: categoryKey,
        vendorCategoryLabel: categoryLabel,
        familyKey: fallbackFamilyKey(this.vendorCode, externalId, sku),
        variantCode: null,
        variantLabel: null,
        availability: normalizeRuvatiAvailability(product),
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
      const externalId = `sitemap:${slug}`;
      return {
        vendorCode: this.vendorCode,
        externalId,
        sku: null,
        title: titleFromSlug(slug),
        description: null,
        productUrl,
        vendorPriceReference: null,
        vendorCurrency: null,
        vendorCategoryKey: null,
        vendorCategoryLabel: null,
        familyKey: fallbackFamilyKey(this.vendorCode, externalId, null),
        variantCode: null,
        variantLabel: null,
        availability: unknownAvailability(),
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
