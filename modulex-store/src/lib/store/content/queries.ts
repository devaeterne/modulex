import "server-only";

import { cache } from "react";
import { callPublicRpc, getPublicStorageObjectUrl } from "@/lib/supabase/public-rest";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGE_REVALIDATE_SECONDS = 60;
const GALLERY_REVALIDATE_SECONDS = 60;
const CABINET_CONTENT_REVALIDATE_SECONDS = 60;
const SOCIAL_PROOF_REVALIDATE_SECONDS = 60;

export type StorePublicPage = {
  slug: string;
  eyebrow: string | null;
  title: string;
  intro: string | null;
  body: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type StorePublicProject = {
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  location: string | null;
  coverImageUrl: string;
  coverImageAlt: string;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  attributionClassification: "oakwell_owned" | "parent_attributed";
  attributionText: string | null;
  sourcePageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type StorePublicProjectMedia = {
  mediaType: "image" | "video";
  mediaUrl: string;
  altText: string;
  sortOrder: number;
};

export type StorePublicProcessStep = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
  updatedAt: string;
};

export type StorePublicFaqEntry = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  updatedAt: string;
};

export type StorePublicTestimonial = {
  id: string;
  reviewerName: string;
  reviewerLocation: string | null;
  excerpt: string;
  sortOrder: number;
  attributionClassification: "parent_attributed" | "oakwell_owned";
  sourceEntity: string | null;
  sourcePageUrl: string | null;
  attributionText: string | null;
  updatedAt: string;
};

type PageRpcRow = {
  slug: string; eyebrow: string | null; title: string; intro: string | null; body: string | null;
  hero_image_url: string | null; hero_image_alt: string | null; cta_label: string | null; cta_href: string | null;
  seo_title: string | null; seo_description: string | null; og_image_url: string | null;
  published_at: string | null; updated_at: string;
};

type ProjectRpcRow = {
  slug: string; title: string; summary: string | null; category: string | null; location: string | null;
  cover_image_bucket: string | null; cover_image_path: string | null; cover_image_alt: string | null;
  sort_order: number; seo_title: string | null; seo_description: string | null; og_image_url: string | null;
  attribution_classification: string; attribution_text: string | null; source_page_url: string | null;
  published_at: string | null; updated_at: string;
};

type ProjectMediaRpcRow = {
  media_type: string;
  media_bucket: string | null;
  media_path: string | null;
  media_url: string | null;
  alt_text: string;
  sort_order: number;
};

type ProcessStepRpcRow = {
  id: string;
  title: string;
  body: string;
  sort_order: number;
  updated_at: string;
};

type FaqEntryRpcRow = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  updated_at: string;
};

type TestimonialRpcRow = {
  id: string;
  reviewer_name: string;
  reviewer_location: string | null;
  excerpt: string;
  sort_order: number;
  attribution_classification: string;
  source_entity: string | null;
  source_page_url: string | null;
  attribution_text: string | null;
  updated_at: string;
};

function normalizeSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  return SLUG_PATTERN.test(normalized) ? normalized : null;
}

function mapPage(row: PageRpcRow): StorePublicPage {
  return {
    slug: row.slug, eyebrow: row.eyebrow, title: row.title, intro: row.intro, body: row.body,
    heroImageUrl: row.hero_image_url, heroImageAlt: row.hero_image_alt, ctaLabel: row.cta_label, ctaHref: row.cta_href,
    seoTitle: row.seo_title, seoDescription: row.seo_description, ogImageUrl: row.og_image_url,
    publishedAt: row.published_at, updatedAt: row.updated_at,
  };
}

function mapProject(row: ProjectRpcRow): StorePublicProject | null {
  const bucket = row.cover_image_bucket?.trim();
  const objectPath = row.cover_image_path?.trim();
  const coverImageAlt = row.cover_image_alt?.trim();
  if (!bucket || !objectPath || !coverImageAlt) return null;
  if (row.attribution_classification !== "oakwell_owned" && row.attribution_classification !== "parent_attributed") return null;
  const attributionText = row.attribution_text?.trim() || null;
  const sourcePageUrl = row.source_page_url?.trim() || null;
  if (row.attribution_classification === "parent_attributed" && (!attributionText || !sourcePageUrl?.startsWith("https://"))) return null;

  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    location: row.location,
    coverImageUrl: getPublicStorageObjectUrl(bucket, objectPath),
    coverImageAlt,
    sortOrder: row.sort_order,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImageUrl: row.og_image_url,
    attributionClassification: row.attribution_classification,
    attributionText,
    sourcePageUrl,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectMedia(row: ProjectMediaRpcRow): StorePublicProjectMedia | null {
  if (row.media_type !== "image" && row.media_type !== "video") return null;
  const altText = row.alt_text?.trim();
  if (!altText) return null;

  let mediaUrl: string | null = null;
  if (row.media_type === "image") {
    const bucket = row.media_bucket?.trim();
    const objectPath = row.media_path?.trim();
    if (!bucket || !objectPath) return null;
    mediaUrl = getPublicStorageObjectUrl(bucket, objectPath);
  } else {
    const externalUrl = row.media_url?.trim();
    if (!externalUrl || !/^https?:\/\//i.test(externalUrl)) return null;
    mediaUrl = externalUrl;
  }

  return { mediaType: row.media_type, mediaUrl, altText, sortOrder: row.sort_order };
}

export const getStorePublicPage = cache(async (slug: string): Promise<StorePublicPage | null> => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;
  const rows = await callPublicRpc<PageRpcRow[]>(
    "get_store_public_page",
    { p_slug: normalizedSlug },
    { revalidate: PAGE_REVALIDATE_SECONDS },
  );
  return rows[0] ? mapPage(rows[0]) : null;
});

export const getStoreGalleryPage = cache(async (): Promise<StorePublicPage | null> => {
  const rows = await callPublicRpc<PageRpcRow[]>(
    "get_store_public_page",
    { p_slug: "gallery" },
    { revalidate: GALLERY_REVALIDATE_SECONDS },
  );
  return rows[0] ? mapPage(rows[0]) : null;
});

export const getStorePublicProjects = cache(async (): Promise<StorePublicProject[]> => {
  const rows = await callPublicRpc<ProjectRpcRow[]>(
    "get_store_public_projects",
    {},
    { revalidate: GALLERY_REVALIDATE_SECONDS },
  );
  return rows.map(mapProject).filter((project): project is StorePublicProject => project !== null);
});

export const getStorePublicProject = cache(async (slug: string): Promise<StorePublicProject | null> => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;
  const rows = await callPublicRpc<ProjectRpcRow[]>(
    "get_store_public_project",
    { p_slug: normalizedSlug },
    { revalidate: GALLERY_REVALIDATE_SECONDS },
  );
  return rows[0] ? mapProject(rows[0]) : null;
});

export const getStorePublicProjectMedia = cache(async (slug: string): Promise<StorePublicProjectMedia[]> => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return [];
  const rows = await callPublicRpc<ProjectMediaRpcRow[]>(
    "get_store_public_project_media",
    { p_slug: normalizedSlug },
    { revalidate: GALLERY_REVALIDATE_SECONDS },
  );
  return rows.map(mapProjectMedia).filter((media): media is StorePublicProjectMedia => media !== null);
});

export const getStorePublicProcessSteps = cache(async (): Promise<StorePublicProcessStep[]> => {
  const rows = await callPublicRpc<ProcessStepRpcRow[]>(
    "get_store_public_process_steps",
    {},
    { revalidate: CABINET_CONTENT_REVALIDATE_SECONDS },
  );
  return rows
    .map((row) => ({ id: row.id, title: row.title.trim(), body: row.body.trim(), sortOrder: row.sort_order, updatedAt: row.updated_at }))
    .filter((row) => row.title && row.body);
});

export const getStorePublicFaqEntries = cache(async (): Promise<StorePublicFaqEntry[]> => {
  const rows = await callPublicRpc<FaqEntryRpcRow[]>(
    "get_store_public_faq_entries",
    {},
    { revalidate: CABINET_CONTENT_REVALIDATE_SECONDS },
  );
  return rows
    .map((row) => ({ id: row.id, question: row.question.trim(), answer: row.answer.trim(), sortOrder: row.sort_order, updatedAt: row.updated_at }))
    .filter((row) => row.question && row.answer);
});

export const getStorePublicTestimonials = cache(async (): Promise<StorePublicTestimonial[]> => {
  const rows = await callPublicRpc<TestimonialRpcRow[]>(
    "get_store_public_testimonials",
    {},
    { revalidate: SOCIAL_PROOF_REVALIDATE_SECONDS },
  );

  return rows.flatMap((row) => {
    const reviewerName = row.reviewer_name?.trim();
    const excerpt = row.excerpt?.trim();
    if (!reviewerName || !excerpt) return [];
    if (row.attribution_classification !== "parent_attributed" && row.attribution_classification !== "oakwell_owned") return [];

    const sourceEntity = row.source_entity?.trim() || null;
    const sourcePageUrl = row.source_page_url?.trim() || null;
    const attributionText = row.attribution_text?.trim() || null;
    if (row.attribution_classification === "parent_attributed") {
      if (!sourceEntity || !sourcePageUrl?.startsWith("https://") || !attributionText) return [];
    }

    return [{
      id: row.id,
      reviewerName,
      reviewerLocation: row.reviewer_location?.trim() || null,
      excerpt,
      sortOrder: row.sort_order,
      attributionClassification: row.attribution_classification,
      sourceEntity,
      sourcePageUrl,
      attributionText,
      updatedAt: row.updated_at,
    }];
  });
});

export const getStoreGalleryReadiness = cache(async () => {
  const [page, projects] = await Promise.all([getStoreGalleryPage(), getStorePublicProjects()]);
  return { page, projects, isReady: Boolean(page && projects.length > 0) };
});

export const getStoreCabinetJourneyReadiness = cache(async () => {
  const [page, steps, faqs] = await Promise.all([
    getStorePublicPage("cabinet-process"),
    getStorePublicProcessSteps(),
    getStorePublicFaqEntries(),
  ]);
  return { page, steps, faqs, isReady: Boolean(page && steps.length > 0) };
});
