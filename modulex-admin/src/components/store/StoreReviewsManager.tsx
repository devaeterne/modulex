"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  deleteStoreReview,
  loadStoreReviews,
  saveStoreReview,
  setStoreReviewPublished,
  type StoreReview,
  type StoreReviewAttribution,
} from "@/lib/store/reviews";

const PARENT_SOURCE = "Granite & Cabinet Center";
const PARENT_SOURCE_URL = "https://granitecenterva.com/testimonials/";
const PARENT_ATTRIBUTION = "Review excerpt source: Granite & Cabinet Center";

type ReviewDraft = {
  id: string | null;
  reviewer_name: string;
  reviewer_location: string;
  excerpt: string;
  sort_order: number;
  attribution_classification: StoreReviewAttribution;
  source_entity: string;
  source_page_url: string;
  attribution_text: string;
};

function emptyReview(sortOrder: number): ReviewDraft {
  return {
    id: null,
    reviewer_name: "",
    reviewer_location: "",
    excerpt: "",
    sort_order: sortOrder,
    attribution_classification: "parent_attributed",
    source_entity: PARENT_SOURCE,
    source_page_url: PARENT_SOURCE_URL,
    attribution_text: PARENT_ATTRIBUTION,
  };
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "published" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"}`}>
      {status}
    </span>
  );
}

export default function StoreReviewsManager() {
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [newReview, setNewReview] = useState<ReviewDraft>(() => emptyReview(10));
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ profile, error: profileError }, rows] = await Promise.all([
        getCurrentProfile(),
        loadStoreReviews(),
      ]);
      if (profileError) throw profileError;
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      setReviews(rows);
      setNewReview(emptyReview((rows.at(-1)?.sort_order ?? 0) + 10));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Store reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Store review update failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading Store reviews...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Reviews & Social Proof</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Manage curated review excerpts with explicit source identity. Parent-company reviews must keep Granite & Cabinet Center attribution and an HTTPS source page; they must never be presented as Oakwell-specific reviews.
        </p>
        {error ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewRow key={review.id} review={review} disabled={!canEdit || busy} run={run} />
          ))}
          {reviews.length === 0 ? <p className="text-sm text-gray-500">No review excerpts yet.</p> : null}
        </div>

        <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Add review excerpt</h2>
          <ReviewFields value={newReview} onChange={setNewReview} disabled={!canEdit || busy} />
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => run(() => saveStoreReview(null, toInput(newReview)))}
            className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save draft review
          </button>
        </div>
      </section>
    </div>
  );
}

function toInput(draft: ReviewDraft) {
  return {
    reviewer_name: draft.reviewer_name,
    reviewer_location: draft.reviewer_location || null,
    excerpt: draft.excerpt,
    sort_order: draft.sort_order,
    attribution_classification: draft.attribution_classification,
    source_entity: draft.source_entity || null,
    source_page_url: draft.source_page_url || null,
    attribution_text: draft.attribution_text || null,
  };
}

function ReviewRow({ review, disabled, run }: { review: StoreReview; disabled: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [draft, setDraft] = useState<ReviewDraft>({
    id: review.id,
    reviewer_name: review.reviewer_name,
    reviewer_location: review.reviewer_location ?? "",
    excerpt: review.excerpt,
    sort_order: review.sort_order,
    attribution_classification: review.attribution_classification,
    source_entity: review.source_entity ?? "",
    source_page_url: review.source_page_url ?? "",
    attribution_text: review.attribution_text ?? "",
  });

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <StatusBadge status={review.status} />
        <span className="text-xs text-gray-400">Updated {new Date(review.updated_at).toLocaleString()}</span>
      </div>
      <ReviewFields value={draft} onChange={setDraft} disabled={disabled} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => run(() => saveStoreReview(review.id, toInput(draft)))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">Save as draft</button>
        <button type="button" disabled={disabled} onClick={() => run(() => setStoreReviewPublished(review.id, review.status !== "published"))} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{review.status === "published" ? "Unpublish" : "Publish"}</button>
        <button type="button" disabled={disabled} onClick={() => run(() => deleteStoreReview(review.id))} className="rounded-lg border border-error-300 px-3 py-2 text-sm text-error-600 dark:border-error-500/40">Delete</button>
      </div>
    </div>
  );
}

function ReviewFields({ value, onChange, disabled }: { value: ReviewDraft; onChange: (next: ReviewDraft) => void; disabled: boolean }) {
  const parentAttributed = value.attribution_classification === "parent_attributed";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-gray-600 dark:text-gray-300">Reviewer name<input disabled={disabled} value={value.reviewer_name} onChange={(event) => onChange({ ...value, reviewer_name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Reviewer location<input disabled={disabled} value={value.reviewer_location} onChange={(event) => onChange({ ...value, reviewer_location: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">Short source excerpt<textarea disabled={disabled} rows={3} maxLength={500} value={value.excerpt} onChange={(event) => onChange({ ...value, excerpt: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Sort order<input disabled={disabled} type="number" min={0} value={value.sort_order} onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Attribution<select disabled={disabled} value={value.attribution_classification} onChange={(event) => onChange({ ...value, attribution_classification: event.target.value as StoreReviewAttribution })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"><option value="parent_attributed">Parent attributed</option><option value="oakwell_owned">Oakwell owned</option></select></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Source entity{parentAttributed ? " *" : ""}<input disabled={disabled} value={value.source_entity} onChange={(event) => onChange({ ...value, source_entity: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Source page URL{parentAttributed ? " *" : ""}<input disabled={disabled} value={value.source_page_url} onChange={(event) => onChange({ ...value, source_page_url: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">Visible attribution{parentAttributed ? " *" : ""}<input disabled={disabled} value={value.attribution_text} onChange={(event) => onChange({ ...value, attribution_text: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
    </div>
  );
}
