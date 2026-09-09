import type {
  NormalizedVendorProduct,
  VendorAsset,
  VendorAssetKind,
  VendorCatalogAdapter,
  VendorCatalogCategory,
  VendorCatalogDiscoveryScope,
} from "@/lib/vendor-catalog/domain";

type FetchLike = typeof fetch;

type DynamicStoneAdapterOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  locale?: string;
  email?: string | null;
  password?: string | null;
};

const SEEDED_SINK_CATEGORIES: VendorCatalogCategory[] = [
  { key: "sinks-ada-sinks-8169", label: "ADA Sinks", productCount: null },
];
const DETAIL_CONCURRENCY = 8;
const DOCUMENT_EXTENSIONS = ["pdf", "dxf", "dwg", "step", "stp", "zip"] as const;

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string | null | undefined) {
  if (!value) return null;
  const text = decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function absoluteUrl(baseUrl: string, href: string) {
  try {
    const url = new URL(decodeHtml(href), baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function extractAnchors(html: string) {
  const anchors: Array<{ href: string; label: string | null }> = [];
  const pattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    anchors.push({ href: decodeHtml(match[1]), label: stripHtml(match[2]) });
  }
  return anchors;
}

function externalIdFromUrl(productUrl: string) {
  const segment = new URL(productUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
  return segment.match(/-(\d+)$/)?.[1] ?? segment;
}

function extractTitle(html: string) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return stripHtml(match?.[1]) ?? "Untitled product";
}

function extractMetaDescription(html: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (extractAttribute(tag, "name")?.toLowerCase() !== "description") continue;
    const content = extractAttribute(tag, "content");
    if (content?.trim()) return content.trim();
  }
  return null;
}

function extractTableProperty(html: string, labels: string[]) {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowPattern.exec(html))) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter((value): value is string => Boolean(value));
    if (cells.length < 2) continue;
    const key = cells[0].replace(/:\s*$/, "").trim().toLowerCase();
    if (wanted.has(key)) return cells[1].trim() || null;
  }
  return null;
}

function parseLocalizedPrice(value: string) {
  const compact = value.replace(/[^0-9.,-]/g, "");
  if (!compact || !/[0-9]/.test(compact)) return null;

  const negative = compact.startsWith("-");
  const unsigned = compact.replace(/-/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);

  let canonical: string;
  if (separatorIndex < 0) {
    canonical = unsigned;
  } else {
    const fractionalDigits = unsigned.slice(separatorIndex + 1).replace(/[.,]/g, "");
    if (fractionalDigits.length >= 1 && fractionalDigits.length <= 2) {
      const integerDigits = unsigned.slice(0, separatorIndex).replace(/[.,]/g, "") || "0";
      canonical = `${integerDigits}.${fractionalDigits}`;
    } else {
      canonical = unsigned.replace(/[.,]/g, "");
    }
  }

  const numeric = Number(`${negative ? "-" : ""}${canonical}`);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractPrice(html: string) {
  const activePriceValues = [
    ...html.matchAll(
      /<[^>]*\bclass=["'][^"']*\boe_price\b[^"']*["'][^>]*>[\s\S]*?\boe_currency_value\b[^>]*>([\s\S]*?)<\//gi
    ),
  ]
    .map((match) => stripHtml(match[1]))
    .filter((value): value is string => Boolean(value))
    .map(parseLocalizedPrice)
    .filter((value): value is number => value !== null);

  if (activePriceValues.length > 0) return activePriceValues.at(-1) ?? null;

  const withoutCrossedOutPrices = html
    .replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, " ")
    .replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi, " ")
    .replace(
      /<([a-z0-9:-]+)\b[^>]*\bclass=["'][^"']*(?:text-decoration-line-through|line-through)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      " "
    );

  const values = [
    ...withoutCrossedOutPrices.matchAll(/\boe_currency_value\b[^>]*>([\s\S]*?)<\//gi),
  ]
    .map((match) => stripHtml(match[1]))
    .filter((value): value is string => Boolean(value))
    .map(parseLocalizedPrice)
    .filter((value): value is number => value !== null);
  return values.at(-1) ?? null;
}

function documentKind(extension: string): VendorAssetKind {
  if (["dxf", "dwg", "step", "stp"].includes(extension)) return "cad";
  if (extension === "pdf") return "specification";
  return "document";
}

function extractAssets(html: string, productUrl: string): VendorAsset[] {
  const assets = new Map<string, VendorAsset>();

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = extractAttribute(tag, "src");
    if (!src) continue;
    const itemprop = extractAttribute(tag, "itemprop")?.toLowerCase();
    if (!/\/web\/image\/product(?:\.|\/)/i.test(src) && itemprop !== "image") continue;
    const url = absoluteUrl(productUrl, src);
    if (!url) continue;
    assets.set(`image:${url}`, {
      kind: "image",
      url,
      label: extractAttribute(tag, "alt"),
      fileType: null,
    });
  }

  for (const anchor of extractAnchors(html)) {
    const extension = (anchor.label ?? anchor.href)
      .match(new RegExp(`\\.(${DOCUMENT_EXTENSIONS.join("|")})(?:$|[?#\\s])`, "i"))?.[1]
      ?.toLowerCase();
    if (!extension) continue;
    const url = absoluteUrl(productUrl, anchor.href);
    if (!url) continue;
    const kind = documentKind(extension);
    assets.set(`${kind}:${url}`, {
      kind,
      url,
      label: anchor.label,
      fileType: extension,
    });
  }

  return [...assets.values()];
}

function parseSessionCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|[,;]\s*)session_id=([^;,\s]+)/i);
  return match?.[1] ? `session_id=${match[1]}` : null;
}

function csrfToken(html: string) {
  const inputPattern = /<input\b[^>]*>/gi;
  for (const tag of html.match(inputPattern) ?? []) {
    if (extractAttribute(tag, "name") !== "csrf_token") continue;
    return extractAttribute(tag, "value");
  }
  return null;
}

function categoryKeyFromUrl(url: string) {
  return new URL(url).pathname.match(/\/shop\/(?:category\/)?(sinks-[^/]+)/i)?.[1] ?? null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    output.push(...(await Promise.all(items.slice(index, index + concurrency).map(mapper))));
  }
  return output;
}

export class DynamicStoneAdapter implements VendorCatalogAdapter {
  readonly vendorCode = "dynamicstone";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly locale: string;
  private readonly email: string | null;
  private readonly password: string | null;
  private sessionCookie: string | null = null;
  private sessionInitialized = false;
  private authenticatedPricing = false;

  constructor(options: DynamicStoneAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.DYNAMIC_STONE_BASE_URL ?? "https://www.dynamicstonetools.net").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.locale = (options.locale ?? process.env.DYNAMIC_STONE_LOCALE ?? "tr").replace(/^\/+|\/+$/g, "") || "tr";
    this.email = options.email ?? process.env.DYNAMIC_STONE_EMAIL?.trim() ?? null;
    this.password = options.password ?? process.env.DYNAMIC_STONE_PASSWORD ?? null;
  }

  async listCategories(): Promise<VendorCatalogCategory[]> {
    const html = await this.requestHtml(`${this.baseUrl}/${this.locale}/shop`);
    const categories = new Map(
      SEEDED_SINK_CATEGORIES.map((category) => [category.key, category] as const)
    );

    for (const anchor of extractAnchors(html)) {
      const url = absoluteUrl(this.baseUrl, anchor.href);
      if (!url) continue;
      const match = new URL(url).pathname.match(/\/shop\/category\/(sinks-[^/]+)/i);
      const key = match?.[1];
      if (!key) continue;
      categories.set(key, {
        key,
        label: anchor.label?.trim() || key,
        productCount: null,
      });
    }

    return [...categories.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  async discover(scope: VendorCatalogDiscoveryScope = {}): Promise<NormalizedVendorProduct[]> {
    const categoryKey = scope.categoryKey?.trim() || null;
    if (categoryKey) {
      this.assertSinkCategory(categoryKey);
      return this.discoverCategory(categoryKey, scope.categoryLabel?.trim() || categoryKey);
    }

    const categories = await this.listCategories();
    const groups = await mapWithConcurrency(categories, 2, (category) =>
      this.discoverCategory(category.key, category.label)
    );
    const products = new Map<string, NormalizedVendorProduct>();
    for (const product of groups.flat()) products.set(product.externalId, product);
    return [...products.values()];
  }

  async enrich(product: NormalizedVendorProduct): Promise<NormalizedVendorProduct> {
    const categoryKey = product.vendorCategoryKey ?? categoryKeyFromUrl(product.productUrl);
    if (!categoryKey) return product;
    this.assertSinkCategory(categoryKey);
    const html = await this.requestHtml(product.productUrl);
    return this.normalizeProduct(
      product.productUrl,
      html,
      categoryKey,
      product.vendorCategoryLabel ?? categoryKey
    );
  }

  private assertSinkCategory(categoryKey: string) {
    if (!/^sinks-/i.test(categoryKey)) {
      throw new Error("Dynamic Stone discovery is restricted to a sink category.");
    }
  }

  private async ensureSession() {
    if (this.sessionInitialized) return;
    this.sessionInitialized = true;

    const hasEmail = Boolean(this.email);
    const hasPassword = Boolean(this.password);
    if (hasEmail !== hasPassword) {
      throw new Error(
        "Dynamic Stone credentials are incomplete; set both DYNAMIC_STONE_EMAIL and DYNAMIC_STONE_PASSWORD."
      );
    }
    if (!this.email || !this.password) return;

    const loginUrl = `${this.baseUrl}/web/login`;
    const loginPage = await this.fetchImpl(loginUrl, {
      headers: { accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    if (!loginPage.ok) {
      throw new Error(`Dynamic Stone login page request failed (${loginPage.status}).`);
    }
    this.sessionCookie = parseSessionCookie(loginPage) ?? this.sessionCookie;
    const loginHtml = await loginPage.text();
    const token = csrfToken(loginHtml);
    if (!token) throw new Error("Dynamic Stone login CSRF token was not found.");

    const body = new URLSearchParams({
      csrf_token: token,
      login: this.email,
      password: this.password,
      redirect: `/${this.locale}/shop`,
    });
    const response = await this.fetchImpl(loginUrl, {
      method: "POST",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "content-type": "application/x-www-form-urlencoded",
        ...(this.sessionCookie ? { cookie: this.sessionCookie } : {}),
      },
      body,
      redirect: "manual",
      cache: "no-store",
    });
    this.sessionCookie = parseSessionCookie(response) ?? this.sessionCookie;

    if (response.status >= 400) {
      throw new Error(`Dynamic Stone login failed (${response.status}).`);
    }
    if (response.status >= 200 && response.status < 300) {
      const responseHtml = await response.text();
      if (/name=["']password["']/i.test(responseHtml) || /wrong login|invalid password/i.test(responseHtml)) {
        throw new Error("Dynamic Stone login was rejected.");
      }
    }

    this.authenticatedPricing = true;
  }

  private async requestHtml(url: string) {
    await this.ensureSession();
    const response = await this.fetchImpl(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        ...(this.sessionCookie ? { cookie: this.sessionCookie } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Dynamic Stone catalog request failed (${response.status}) for ${url}.`);
    }
    const html = await response.text();
    if (this.authenticatedPricing && /<form[^>]+(?:action=["'][^"']*\/web\/login|id=["']login)/i.test(html)) {
      throw new Error("Dynamic Stone authenticated session expired during catalog discovery.");
    }
    return html;
  }

  private async discoverCategory(categoryKey: string, categoryLabel: string) {
    this.assertSinkCategory(categoryKey);
    const categoryUrl = `${this.baseUrl}/${this.locale}/shop/category/${encodeURIComponent(categoryKey)}`;
    const pendingPages = [categoryUrl];
    const visitedPages = new Set<string>();
    const productUrls = new Set<string>();

    while (pendingPages.length > 0 && visitedPages.size < 100) {
      const pageUrl = pendingPages.shift()!;
      if (visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);
      const html = await this.requestHtml(pageUrl);

      for (const anchor of extractAnchors(html)) {
        const resolved = absoluteUrl(this.baseUrl, anchor.href);
        if (!resolved) continue;
        const url = new URL(resolved);
        if (url.origin !== new URL(this.baseUrl).origin) continue;
        const path = url.pathname;
        if (/\/shop\/category\//i.test(path)) {
          if (path.includes(`/shop/category/${categoryKey}`) && url.searchParams.has("page")) {
            pendingPages.push(url.toString());
          }
          continue;
        }
        if (/\/shop\//i.test(path) && /-\d+$/.test(path)) productUrls.add(url.toString());
      }
    }

    return mapWithConcurrency([...productUrls], DETAIL_CONCURRENCY, async (productUrl) => {
      const html = await this.requestHtml(productUrl);
      return this.normalizeProduct(productUrl, html, categoryKey, categoryLabel);
    });
  }

  private normalizeProduct(
    productUrl: string,
    html: string,
    categoryKey: string,
    categoryLabel: string
  ): NormalizedVendorProduct {
    const externalId = externalIdFromUrl(productUrl);
    const sku = extractTableProperty(html, ["model", "sku", "product code", "item code"]);
    const price = this.authenticatedPricing ? extractPrice(html) : null;
    const title = extractTitle(html);

    return {
      vendorCode: this.vendorCode,
      externalId,
      sku,
      title,
      description: extractMetaDescription(html),
      productUrl,
      vendorPriceReference: price,
      vendorCurrency: price === null ? null : "USD",
      vendorCategoryKey: categoryKey,
      vendorCategoryLabel: categoryLabel,
      familyKey: sku?.trim().toUpperCase() || `DYNAMICSTONE:${externalId}`,
      variantCode: null,
      variantLabel: null,
      availability: {
        status: "AVAILABLE",
        available: true,
        purchasable: this.authenticatedPricing ? true : null,
        stockQuantity: null,
      },
      assets: extractAssets(html, productUrl),
      sourcePayload: {
        source: "dynamic-stone-odoo",
        authenticatedPricing: this.authenticatedPricing,
        categoryKey,
        externalId,
        model: sku,
      },
    };
  }
}
