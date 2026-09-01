"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { hasPermission } from "@/lib/auth/permissions";
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
const ATTRIBUTION_OPTIONS = [
  { value: "parent_attributed", label: "Parent attributed" },
  { value: "oakwell_owned", label: "Oakwell owned" },
];

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
    <Badge color={status === "published" ? "success" : "light"} size="sm">
      {status === "published" ? "Published" : "Draft"}
    </Badge>
  );
}

export default function StoreReviewsManager() {
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [newReview, setNewReview] = useState<ReviewDraft>(() => emptyReview(10));
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    try {
      const [{ profile, error: profileError }, rows] = await Promise.all([
        getCurrentProfile(),
        loadStoreReviews(),
      ]);
      if (profileError) throw profileError;
      setCanEdit(hasPermission(profile?.roles, "store.manage"));
      setReviews(rows);
      setNewReview(emptyReview((rows.at(-1)?.sort_order ?? 0) + 10));
    } catch (caught) {
      console.error("Failed to load Store reviews", caught);
      setLoadFailed(true);
      setError("Store reviews could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setLoadFailed(false);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      console.error("Store review update failed", caught);
      setError("Store review update failed. Check the values and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Alert
        variant="info"
        title="Loading Store reviews"
        message="Review excerpts and attribution metadata are being loaded."
      />
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-3">
        <Alert
          variant="error"
          title="Store reviews unavailable"
          message={error ?? "Store reviews could not be loaded."}
        />
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Reviews & Social Proof"
        desc="Manage curated review excerpts with explicit source identity. Parent-company reviews must keep Granite & Cabinet Center attribution and an HTTPS source page; they must never be presented as Oakwell-specific reviews."
        headerAction={<Badge color={canEdit ? "success" : "light"}>{canEdit ? "Manage" : "View only"}</Badge>}
      >
        {error ? <Alert variant="error" title="Unable to update Store reviews" message={error} /> : null}
      </ComponentCard>

      <ComponentCard
        title="Review Directory"
        desc="Review current excerpts, attribution, publication state, and source metadata."
      >
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewRow key={review.id} review={review} disabled={!canEdit || busy} run={run} />
          ))}
          {reviews.length === 0 ? (
            <Alert variant="info" title="No review excerpts" message="Add the first curated review excerpt below." />
          ) : null}
        </div>
      </ComponentCard>

      <ComponentCard
        title="Add review excerpt"
        desc="Create a private draft first. Publishing remains a separate explicit action."
      >
        <ReviewFields value={newReview} onChange={setNewReview} disabled={!canEdit || busy} prefix="new-review" />
        <div className="flex justify-end">
          <Button
            disabled={!canEdit || busy}
            onClick={() => void run(() => saveStoreReview(null, toInput(newReview)))}
          >
            Save draft review
          </Button>
        </div>
      </ComponentCard>
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

function ReviewRow({
  review,
  disabled,
  run,
}: {
  review: StoreReview;
  disabled: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
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
    <ComponentCard
      title={review.reviewer_name || "Review excerpt"}
      desc={`Updated ${new Date(review.updated_at).toLocaleString()}`}
      headerAction={<StatusBadge status={review.status} />}
    >
      <ReviewFields value={draft} onChange={setDraft} disabled={disabled} prefix={`review-${review.id}`} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void run(() => saveStoreReview(review.id, toInput(draft)))}
        >
          Save as draft
        </Button>
        <Button
          size="sm"
          variant={review.status === "published" ? "outline" : "primary"}
          disabled={disabled}
          onClick={() => void run(() => setStoreReviewPublished(review.id, review.status !== "published"))}
        >
          {review.status === "published" ? "Unpublish" : "Publish"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={disabled}
          onClick={() => void run(() => deleteStoreReview(review.id))}
        >
          Delete
        </Button>
      </div>
    </ComponentCard>
  );
}

function ReviewFields({
  value,
  onChange,
  disabled,
  prefix,
}: {
  value: ReviewDraft;
  onChange: (next: ReviewDraft) => void;
  disabled: boolean;
  prefix: string;
}) {
  const parentAttributed = value.attribution_classification === "parent_attributed";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor={`${prefix}-reviewer-name`}>Reviewer name</Label>
        <Input
          id={`${prefix}-reviewer-name`}
          disabled={disabled}
          value={value.reviewer_name}
          onChange={(event) => onChange({ ...value, reviewer_name: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-reviewer-location`}>Reviewer location</Label>
        <Input
          id={`${prefix}-reviewer-location`}
          disabled={disabled}
          value={value.reviewer_location}
          onChange={(event) => onChange({ ...value, reviewer_location: event.target.value })}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${prefix}-excerpt`}>Short source excerpt</Label>
        <TextArea
          id={`${prefix}-excerpt`}
          disabled={disabled}
          rows={3}
          maxLength={500}
          value={value.excerpt}
          onChange={(excerpt) => onChange({ ...value, excerpt })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-sort-order`}>Sort order</Label>
        <Input
          id={`${prefix}-sort-order`}
          disabled={disabled}
          type="number"
          min={0}
          value={value.sort_order}
          onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-attribution`}>Attribution</Label>
        <Select
          id={`${prefix}-attribution`}
          disabled={disabled}
          options={ATTRIBUTION_OPTIONS}
          value={value.attribution_classification}
          onChange={(attribution_classification) =>
            onChange({
              ...value,
              attribution_classification: attribution_classification as StoreReviewAttribution,
            })
          }
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-source-entity`}>Source entity{parentAttributed ? " *" : ""}</Label>
        <Input
          id={`${prefix}-source-entity`}
          disabled={disabled}
          value={value.source_entity}
          onChange={(event) => onChange({ ...value, source_entity: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-source-url`}>Source page URL{parentAttributed ? " *" : ""}</Label>
        <Input
          id={`${prefix}-source-url`}
          disabled={disabled}
          type="url"
          value={value.source_page_url}
          onChange={(event) => onChange({ ...value, source_page_url: event.target.value })}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${prefix}-attribution-text`}>Visible attribution{parentAttributed ? " *" : ""}</Label>
        <Input
          id={`${prefix}-attribution-text`}
          disabled={disabled}
          value={value.attribution_text}
          onChange={(event) => onChange({ ...value, attribution_text: event.target.value })}
        />
      </div>
    </div>
  );
}
