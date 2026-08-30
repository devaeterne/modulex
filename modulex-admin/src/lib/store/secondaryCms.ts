export const CONTROLLED_PAGE_SLUGS = ["about", "gallery", "showroom", "cabinet-process"] as const;
export type ControlledPageSlug = (typeof CONTROLLED_PAGE_SLUGS)[number];

export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const STORE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
export const STORE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export type StoreContentStatus = "draft" | "published";
export type StoreProjectAttribution = "oakwell_owned" | "parent_attributed";

export type StorePage = {
  id: string | null;
  slug: ControlledPageSlug;
  status: StoreContentStatus;
  eyebrow: string | null;
  title: string;
  intro: string | null;
  body: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  cta_label: string | null;
  cta_href: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export type StorePageDraft = Pick<
  StorePage,
  | "slug"
  | "status"
  | "eyebrow"
  | "title"
  | "intro"
  | "body"
  | "hero_image_url"
  | "hero_image_alt"
  | "cta_label"
  | "cta_href"
  | "seo_title"
  | "seo_description"
  | "og_image_url"
>;

export type StoreProject = {
  id: string;
  slug: string;
  status: StoreContentStatus;
  title: string;
  summary: string | null;
  category: string | null;
  location: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_media_asset_id: string | null;
  attribution_classification: StoreProjectAttribution;
  attribution_text: string | null;
  source_page_url: string | null;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export type StoreProjectDraft = Pick<
  StoreProject,
  | "slug"
  | "status"
  | "title"
  | "summary"
  | "category"
  | "location"
  | "cover_image_url"
  | "cover_image_alt"
  | "cover_media_asset_id"
  | "attribution_classification"
  | "attribution_text"
  | "source_page_url"
  | "sort_order"
  | "seo_title"
  | "seo_description"
  | "og_image_url"
>;

export type StoreProjectMedia = {
  id: string;
  project_id: string;
  media_type: "image" | "video";
  media_url: string;
  media_asset_id: string | null;
  alt_text: string;
  sort_order: number;
  updated_at: string | null;
};

export function cleanNullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isPublicHref(value: string) {
  return value.startsWith("/") || isHttpUrl(value);
}

export function isProjectSlug(value: string) {
  return PROJECT_SLUG_PATTERN.test(value);
}

export function validateImageFile(file: Pick<File, "type" | "size">) {
  if (!STORE_IMAGE_MIME_TYPES.includes(file.type as (typeof STORE_IMAGE_MIME_TYPES)[number])) {
    return "Image must be JPG, PNG, WebP or AVIF.";
  }
  if (file.size > STORE_IMAGE_MAX_BYTES) {
    return "Image must be 20 MB or smaller.";
  }
  return null;
}

export function validatePageForPublish(page: StorePageDraft) {
  if (!page.title.trim()) return "Page title is required before publishing.";

  const heroUrl = cleanNullable(page.hero_image_url);
  const heroAlt = cleanNullable(page.hero_image_alt);
  if (heroUrl && !heroAlt) return "Hero image alt text is required before publishing.";

  const ctaLabel = cleanNullable(page.cta_label);
  const ctaHref = cleanNullable(page.cta_href);
  if (Boolean(ctaLabel) !== Boolean(ctaHref)) {
    return "CTA label and link must either both be present or both be empty.";
  }
  if (ctaHref && !isPublicHref(ctaHref)) {
    return "CTA link must be a site path or http(s) URL.";
  }

  return null;
}

export function validateProjectForPublish(project: StoreProjectDraft, duplicateSlug = false) {
  if (!project.title.trim()) return "Project title is required before publishing.";
  if (!isProjectSlug(project.slug)) {
    return "Project slug must use lowercase letters, numbers and single hyphens only.";
  }
  if (duplicateSlug) return "Project slug must be unique.";
  if (!project.cover_media_asset_id) return "Select a published Media Library cover before publishing.";
  if (!cleanNullable(project.cover_image_alt)) return "Cover image alt text is required before publishing.";
  if (project.attribution_classification === "parent_attributed") {
    if (!cleanNullable(project.attribution_text)) return "Parent-attributed projects require visible attribution text.";
    const sourceUrl = cleanNullable(project.source_page_url);
    if (!sourceUrl || !sourceUrl.startsWith("https://")) {
      return "Parent-attributed projects require an https source page URL.";
    }
  }
  return null;
}

export function buildStoreMediaPath(scope: string, field: string, originalName: string) {
  const rawExt = originalName.split(".").pop()?.toLowerCase() ?? "jpg";
  const ext = rawExt.replace(/[^a-z0-9]/g, "") || "jpg";
  const safeScope = scope.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  const safeField = field.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return `secondary/${safeScope}/${safeField}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
}
