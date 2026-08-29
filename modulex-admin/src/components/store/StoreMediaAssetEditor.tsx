"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { deleteMediaAsset, runMediaLifecycle } from "@/lib/store/mediaApi";
import {
  MEDIA_REVIEW_STATUSES,
  formatMediaBytes,
  formatMediaDimensions,
  validateMediaReviewUpdate,
  type StoreMediaAsset,
  type StoreMediaAssetSource,
  type StoreMediaAttribution,
  type StoreMediaCabinetRelevance,
} from "@/lib/store/mediaLibrary";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const textareaClass = `${inputClass} h-auto min-h-24 resize-y`;
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const dangerButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-4 text-sm font-medium text-error-700 disabled:opacity-50 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

const assetSelect =
  "id,status,title,default_alt_text,caption,media_type,original_filename,original_mime_type,original_width,original_height,original_bytes,original_sha256,optimized_mime_type,optimized_width,optimized_height,optimized_bytes,optimized_sha256,staging_bucket,staging_original_path,staging_optimized_path,public_bucket,public_path,attribution_classification,cabinet_relevance,review_notes,published_at,created_at,updated_at,created_by,updated_by";

export default function StoreMediaAssetEditor({
  asset,
  sources,
  canEdit,
  publicPreviewUrl,
  onSaved,
  onDeleted,
}: {
  asset: StoreMediaAsset;
  sources: StoreMediaAssetSource[];
  canEdit: boolean;
  publicPreviewUrl: string | null;
  onSaved: (asset: StoreMediaAsset) => void;
  onDeleted: (assetId: string) => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [defaultAlt, setDefaultAlt] = useState(asset.default_alt_text ?? "");
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [attribution, setAttribution] = useState<StoreMediaAttribution>(asset.attribution_classification);
  const [relevance, setRelevance] = useState<StoreMediaCabinetRelevance>(asset.cabinet_relevance);
  const [reviewNotes, setReviewNotes] = useState(asset.review_notes ?? "");
  const [status, setStatus] = useState<Exclude<StoreMediaAsset["status"], "published">>(asset.status === "published" ? "approved" : asset.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTitle(asset.title);
    setDefaultAlt(asset.default_alt_text ?? "");
    setCaption(asset.caption ?? "");
    setAttribution(asset.attribution_classification);
    setRelevance(asset.cabinet_relevance);
    setReviewNotes(asset.review_notes ?? "");
    setStatus(asset.status === "published" ? "approved" : asset.status);
    setError(null);
    setMessage(null);
  }, [asset]);

  async function saveReview() {
    if (!canEdit || asset.status === "published") return;

    const validation = validateMediaReviewUpdate({
      title,
      default_alt_text: defaultAlt,
      caption,
      attribution_classification: attribution,
      cabinet_relevance: relevance,
      review_notes: reviewNotes,
      status,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setError(userError?.message ?? "Unable to verify current user.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: updateError } = await supabase
      .from("store_media_assets")
      .update({ ...validation.value, updated_by: user.id })
      .eq("id", asset.id)
      .select(assetSelect)
      .single();

    if (updateError) setError(updateError.message);
    else {
      onSaved(data as StoreMediaAsset);
      setMessage("Review metadata saved.");
    }
    setBusy(false);
  }

  async function handleLifecycle(action: "publish" | "unpublish") {
  if (!canEdit || busy) return;
  setBusy(true);
  setError(null);
  setMessage(null);
  try {
    const updated = await runMediaLifecycle(asset.id, action);
    onSaved(updated);
    setMessage(action === "publish" ? "Media published." : "Media unpublished and returned to approved state.");
  } catch (lifecycleError) {
    setError(lifecycleError instanceof Error ? lifecycleError.message : "Media lifecycle operation failed.");
  } finally {
    setBusy(false);
  }
}

  async function handleDelete() {
  if (!canEdit || busy || asset.status === "published") return;
  if (!window.confirm(`Delete media asset “${asset.title}”? Private staging files and provenance will also be removed.`)) return;
  setBusy(true);
  setError(null);
  setMessage(null);
  try {
    await deleteMediaAsset(asset.id);
    onDeleted(asset.id);
  } catch (deleteError) {
    setError(deleteError instanceof Error ? deleteError.message : "Unable to delete media asset.");
  } finally {
    setBusy(false);
  }
}

  const formDisabled = !canEdit || busy || asset.status === "published";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Media asset</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{asset.title}</h2>
            <p className="mt-1 text-sm text-gray-500">Status: {asset.status} · updated {new Date(asset.updated_at).toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {asset.status === "approved" ? <button type="button" className={primaryButton} disabled={!canEdit || busy} onClick={() => void handleLifecycle("publish")}>Publish</button> : null}
            {asset.status === "published" ? <button type="button" className={secondaryButton} disabled={!canEdit || busy} onClick={() => void handleLifecycle("unpublish")}>Unpublish</button> : null}
            {asset.status !== "published" ? <button type="button" className={dangerButton} disabled={!canEdit || busy} onClick={() => void handleDelete()}>Delete</button> : null}
          </div>
        </div>

        {publicPreviewUrl ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicPreviewUrl} alt={asset.default_alt_text ?? asset.title} className="max-h-[420px] w-full object-contain" />
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700">
            Private staging preview is intentionally not exposed as a public URL. Published assets show their public derivative here.
          </div>
        )}

        {error ? <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
        {message ? <p className="mt-4 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{message}</p> : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Review metadata</h3>
        <p className="mt-1 text-sm text-gray-500">Default alt text is the asset-level fallback and may be overridden by a content association later.</p>
        {asset.status === "published" ? <p className="mt-3 text-sm text-warning-600">Unpublish before changing review lifecycle metadata.</p> : null}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">
            Title
            <input className={`${inputClass} mt-1`} value={title} disabled={formDisabled} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            Lifecycle
            <select className={`${inputClass} mt-1`} value={status} disabled={formDisabled} onChange={(event) => setStatus(event.target.value as typeof status)}>
              {MEDIA_REVIEW_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            Publication attribution
            <select className={`${inputClass} mt-1`} value={attribution} disabled={formDisabled} onChange={(event) => setAttribution(event.target.value as StoreMediaAttribution)}>
              <option value="oakwell_owned">Oakwell owned</option>
              <option value="parent_attributed">Parent attributed</option>
              <option value="unverified_hold">Unverified hold</option>
            </select>
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            Cabinet relevance
            <select className={`${inputClass} mt-1`} value={relevance} disabled={formDisabled} onChange={(event) => setRelevance(event.target.value as StoreMediaCabinetRelevance)}>
              <option value="unreviewed">Unreviewed</option>
              <option value="relevant">Relevant</option>
              <option value="mixed">Mixed</option>
              <option value="irrelevant">Irrelevant</option>
            </select>
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300 lg:col-span-2">
            Default alt text
            <input className={`${inputClass} mt-1`} value={defaultAlt} disabled={formDisabled} onChange={(event) => setDefaultAlt(event.target.value)} />
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300 lg:col-span-2">
            Caption
            <textarea className={`${textareaClass} mt-1`} value={caption} disabled={formDisabled} onChange={(event) => setCaption(event.target.value)} />
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300 lg:col-span-2">
            Review notes
            <textarea className={`${textareaClass} mt-1`} value={reviewNotes} disabled={formDisabled} onChange={(event) => setReviewNotes(event.target.value)} />
          </label>
        </div>
        {asset.status !== "published" && canEdit ? <button type="button" className={`${primaryButton} mt-5`} disabled={busy} onClick={() => void saveReview()}>Save review</button> : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Verified file metadata</h3>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div><dt className="text-gray-400">Original</dt><dd className="mt-1 text-gray-700 dark:text-gray-200">{formatMediaDimensions(asset.original_width, asset.original_height)} · {formatMediaBytes(asset.original_bytes)} · {asset.original_mime_type}</dd></div>
          <div><dt className="text-gray-400">Optimized</dt><dd className="mt-1 text-gray-700 dark:text-gray-200">{formatMediaDimensions(asset.optimized_width, asset.optimized_height)} · {formatMediaBytes(asset.optimized_bytes)} · {asset.optimized_mime_type ?? "—"}</dd></div>
          <div><dt className="text-gray-400">Original filename</dt><dd className="mt-1 break-all text-gray-700 dark:text-gray-200">{asset.original_filename ?? "—"}</dd></div>
          <div className="md:col-span-2 xl:col-span-3"><dt className="text-gray-400">Original SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{asset.original_sha256}</dd></div>
          <div className="md:col-span-2 xl:col-span-3"><dt className="text-gray-400">Optimized SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{asset.optimized_sha256 ?? "—"}</dd></div>
          <div className="md:col-span-2 xl:col-span-3"><dt className="text-gray-400">Staging original path</dt><dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{asset.staging_original_path ?? "—"}</dd></div>
          <div className="md:col-span-2 xl:col-span-3"><dt className="text-gray-400">Staging optimized path</dt><dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{asset.staging_optimized_path ?? "—"}</dd></div>
          <div className="md:col-span-2 xl:col-span-3"><dt className="text-gray-400">Public locator</dt><dd className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{asset.public_bucket && asset.public_path ? `${asset.public_bucket}/${asset.public_path}` : "—"}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Source provenance</h3>
        {sources.length === 0 ? <p className="mt-3 text-sm text-gray-500">No provenance rows recorded.</p> : null}
        <div className="mt-4 space-y-3">
          {sources.map((source) => (
            <article key={source.id} className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-800 dark:text-white/90">{source.source_candidate_id ?? source.source_label ?? source.source_site}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{source.migration_disposition}</span>
                {source.attribution_required ? <span className="text-xs text-warning-600">attribution required</span> : null}
              </div>
              <p className="mt-2 break-all text-xs text-gray-500">Source: {source.source_url}</p>
              {source.source_page_url ? <p className="mt-1 break-all text-xs text-gray-500">Page: {source.source_page_url}</p> : null}
              {source.source_brand ? <p className="mt-1 text-xs text-gray-500">Brand: {source.source_brand}</p> : null}
              {source.notes ? <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{source.notes}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
