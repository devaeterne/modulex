import { supabase } from "@/lib/supabase/client";

export type CabinetContentStatus = "draft" | "published";
export type CabinetContentAttribution = "adapted_parent_source" | "original_oakwell";

export type StoreProcessStep = {
  id: string;
  page_slug: "cabinet-process";
  title: string;
  body: string;
  sort_order: number;
  status: CabinetContentStatus;
  source_page_url: string | null;
  attribution_classification: CabinetContentAttribution;
  published_at: string | null;
  updated_at: string;
};

export type StoreFaqEntry = {
  id: string;
  page_slug: "cabinet-process";
  question: string;
  answer: string;
  sort_order: number;
  status: CabinetContentStatus;
  source_page_url: string | null;
  attribution_classification: CabinetContentAttribution;
  published_at: string | null;
  updated_at: string;
};

export type ProcessStepInput = Pick<
  StoreProcessStep,
  "title" | "body" | "sort_order" | "source_page_url" | "attribution_classification"
>;
export type FaqEntryInput = Pick<
  StoreFaqEntry,
  "question" | "answer" | "sort_order" | "source_page_url" | "attribution_classification"
>;

export function cleanOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function validateProcessStep(input: ProcessStepInput) {
  if (!input.title.trim()) return "Step title is required.";
  if (!input.body.trim()) return "Step body is required.";
  if (!Number.isInteger(input.sort_order) || input.sort_order < 0) return "Sort order must be zero or greater.";
  const sourceUrl = cleanOptional(input.source_page_url);
  if (sourceUrl && !sourceUrl.startsWith("https://")) return "Source page URL must use https.";
  return null;
}

export function validateFaqEntry(input: FaqEntryInput) {
  if (!input.question.trim()) return "FAQ question is required.";
  if (!input.answer.trim()) return "FAQ answer is required.";
  if (!Number.isInteger(input.sort_order) || input.sort_order < 0) return "Sort order must be zero or greater.";
  const sourceUrl = cleanOptional(input.source_page_url);
  if (sourceUrl && !sourceUrl.startsWith("https://")) return "Source page URL must use https.";
  return null;
}

export async function loadCabinetContent() {
  const [stepsResult, faqResult] = await Promise.all([
    supabase
      .from("store_process_steps")
      .select("id,page_slug,title,body,sort_order,status,source_page_url,attribution_classification,published_at,updated_at")
      .eq("page_slug", "cabinet-process")
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_faq_entries")
      .select("id,page_slug,question,answer,sort_order,status,source_page_url,attribution_classification,published_at,updated_at")
      .eq("page_slug", "cabinet-process")
      .order("sort_order", { ascending: true }),
  ]);

  if (stepsResult.error) throw stepsResult.error;
  if (faqResult.error) throw faqResult.error;
  return {
    steps: (stepsResult.data ?? []) as StoreProcessStep[],
    faqs: (faqResult.data ?? []) as StoreFaqEntry[],
  };
}

export async function saveProcessStep(id: string | null, input: ProcessStepInput) {
  const validationError = validateProcessStep(input);
  if (validationError) throw new Error(validationError);
  const payload = {
    page_slug: "cabinet-process",
    title: input.title.trim(),
    body: input.body.trim(),
    sort_order: input.sort_order,
    source_page_url: cleanOptional(input.source_page_url),
    attribution_classification: input.attribution_classification,
    status: "draft" as const,
    published_at: null,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from("store_process_steps").update(payload).eq("id", id)
    : supabase.from("store_process_steps").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveFaqEntry(id: string | null, input: FaqEntryInput) {
  const validationError = validateFaqEntry(input);
  if (validationError) throw new Error(validationError);
  const payload = {
    page_slug: "cabinet-process",
    question: input.question.trim(),
    answer: input.answer.trim(),
    sort_order: input.sort_order,
    source_page_url: cleanOptional(input.source_page_url),
    attribution_classification: input.attribution_classification,
    status: "draft" as const,
    published_at: null,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from("store_faq_entries").update(payload).eq("id", id)
    : supabase.from("store_faq_entries").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function setProcessStepPublished(id: string, published: boolean) {
  const { error } = await supabase
    .from("store_process_steps")
    .update({ status: published ? "published" : "draft", published_at: published ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setFaqEntryPublished(id: string, published: boolean) {
  const { error } = await supabase
    .from("store_faq_entries")
    .update({ status: published ? "published" : "draft", published_at: published ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProcessStep(id: string) {
  const { error } = await supabase.from("store_process_steps").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteFaqEntry(id: string) {
  const { error } = await supabase.from("store_faq_entries").delete().eq("id", id);
  if (error) throw error;
}
