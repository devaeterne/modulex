export type StoreMediaStatus = "draft" | "review" | "approved" | "published" | "rejected";
export type StoreMediaAttribution = "oakwell_owned" | "parent_attributed" | "unverified_hold";
export type StoreMediaCabinetRelevance = "unreviewed" | "relevant" | "mixed" | "irrelevant";

export type StoreMediaAsset = {
  id: string;
  status: StoreMediaStatus;
  title: string;
  default_alt_text: string | null;
  caption: string | null;
  media_type: "image";
  original_filename: string | null;
  original_mime_type: string;
  original_width: number;
  original_height: number;
  original_bytes: number;
  original_sha256: string;
  optimized_mime_type: string | null;
  optimized_width: number | null;
  optimized_height: number | null;
  optimized_bytes: number | null;
  optimized_sha256: string | null;
  staging_bucket: "store-media-staging";
  staging_original_path: string | null;
  staging_optimized_path: string | null;
  public_bucket: "store-media" | null;
  public_path: string | null;
  attribution_classification: StoreMediaAttribution;
  cabinet_relevance: StoreMediaCabinetRelevance;
  review_notes: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type StoreMediaAssetSource = {
  id: string;
  media_asset_id: string;
  source_site: string;
  source_brand: string | null;
  source_candidate_id: string | null;
  source_url: string;
  source_page_url: string | null;
  source_page_id: string | null;
  source_label: string | null;
  migration_disposition: string;
  attribution_required: boolean;
  notes: string | null;
  discovered_at: string | null;
  created_at: string;
};

export type StoreMediaReviewInput = {
  title: string;
  default_alt_text: string;
  caption: string;
  attribution_classification: StoreMediaAttribution;
  cabinet_relevance: StoreMediaCabinetRelevance;
  review_notes: string;
  status: Exclude<StoreMediaStatus, "published">;
};

export const MEDIA_REVIEW_STATUSES: StoreMediaReviewInput["status"][] = [
  "draft",
  "review",
  "approved",
  "rejected",
];

function nullableTrimmed(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function validateMediaReviewUpdate(input: StoreMediaReviewInput) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Media title is required." };

  const defaultAlt = nullableTrimmed(input.default_alt_text);
  if (input.status === "approved") {
    if (!defaultAlt) {
      return { ok: false as const, error: "Approved media requires default alt text." };
    }
    if (input.attribution_classification === "unverified_hold") {
      return { ok: false as const, error: "Approved media cannot remain in unverified hold attribution." };
    }
    if (!["relevant", "mixed"].includes(input.cabinet_relevance)) {
      return { ok: false as const, error: "Approved media must be cabinet-relevant or mixed relevance." };
    }
  }

  return {
    ok: true as const,
    value: {
      title,
      default_alt_text: defaultAlt,
      caption: nullableTrimmed(input.caption),
      attribution_classification: input.attribution_classification,
      cabinet_relevance: input.cabinet_relevance,
      review_notes: nullableTrimmed(input.review_notes),
      status: input.status,
    },
  };
}

export function formatMediaBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMediaDimensions(width: number | null, height: number | null) {
  return width && height ? `${width}×${height}` : "—";
}
