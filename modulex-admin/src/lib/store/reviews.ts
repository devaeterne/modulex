import { supabase } from "@/lib/supabase/client";

export type StoreReviewStatus = "draft" | "published";
export type StoreReviewAttribution = "parent_attributed" | "oakwell_owned";

export type StoreReview = {
  id: string;
  reviewer_name: string;
  reviewer_location: string | null;
  excerpt: string;
  sort_order: number;
  status: StoreReviewStatus;
  attribution_classification: StoreReviewAttribution;
  source_entity: string | null;
  source_page_url: string | null;
  attribution_text: string | null;
  published_at: string | null;
  updated_at: string;
};

export type StoreReviewInput = Pick<
  StoreReview,
  | "reviewer_name"
  | "reviewer_location"
  | "excerpt"
  | "sort_order"
  | "attribution_classification"
  | "source_entity"
  | "source_page_url"
  | "attribution_text"
>;

function cleanOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function validateStoreReview(input: StoreReviewInput) {
  if (!input.reviewer_name.trim()) return "Reviewer name is required.";
  if (!input.excerpt.trim()) return "Review excerpt is required.";
  if (input.excerpt.length > 500) return "Review excerpt must be 500 characters or fewer.";
  if (!Number.isInteger(input.sort_order) || input.sort_order < 0) return "Sort order must be zero or greater.";

  if (input.attribution_classification === "parent_attributed") {
    if (!cleanOptional(input.source_entity)) return "Parent-attributed reviews require a source entity.";
    const sourceUrl = cleanOptional(input.source_page_url);
    if (!sourceUrl?.startsWith("https://")) return "Parent-attributed reviews require an https source page URL.";
    if (!cleanOptional(input.attribution_text)) return "Parent-attributed reviews require visible attribution text.";
  }
  return null;
}

export async function loadStoreReviews() {
  const { data, error } = await supabase
    .from("store_testimonials")
    .select("id,reviewer_name,reviewer_location,excerpt,sort_order,status,attribution_classification,source_entity,source_page_url,attribution_text,published_at,updated_at")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StoreReview[];
}

export async function saveStoreReview(id: string | null, input: StoreReviewInput) {
  const validationError = validateStoreReview(input);
  if (validationError) throw new Error(validationError);

  const payload = {
    reviewer_name: input.reviewer_name.trim(),
    reviewer_location: cleanOptional(input.reviewer_location),
    excerpt: input.excerpt.trim(),
    sort_order: input.sort_order,
    attribution_classification: input.attribution_classification,
    source_entity: cleanOptional(input.source_entity),
    source_page_url: cleanOptional(input.source_page_url),
    attribution_text: cleanOptional(input.attribution_text),
    status: "draft" as const,
    published_at: null,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from("store_testimonials").update(payload).eq("id", id)
    : supabase.from("store_testimonials").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function setStoreReviewPublished(id: string, published: boolean) {
  const { error } = await supabase
    .from("store_testimonials")
    .update({
      status: published ? "published" : "draft",
      published_at: published ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStoreReview(id: string) {
  const { error } = await supabase.from("store_testimonials").delete().eq("id", id);
  if (error) throw error;
}
