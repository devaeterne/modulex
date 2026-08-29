"use client";

import { useEffect, useState } from "react";
import StoreProjectMediaAssetPicker, { type StoreProjectEligibleMediaAsset } from "@/components/store/StoreProjectMediaAssetPicker";
import { supabase } from "@/lib/supabase/client";
import {
  buildStoreMediaPath,
  cleanNullable,
  isProjectSlug,
  type StoreProject,
  type StoreProjectDraft,
  validateImageFile,
  validateProjectForPublish,
} from "@/lib/store/secondaryCms";

const PROJECT_SELECT = "id,slug,status,title,summary,category,location,cover_image_url,cover_image_alt,cover_media_asset_id,attribution_classification,attribution_text,source_page_url,sort_order,seo_title,seo_description,og_image_url,published_at,updated_at";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const textareaClass = `${inputClass} h-auto min-h-28 resize-y`;
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

function Field({ label, value, onChange, disabled, type = "text", placeholder }: {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

export default function StoreProjectEditor({ project, canEdit, conflictingSlugs, onSaved }: {
  project: StoreProject;
  canEdit: boolean;
  conflictingSlugs: string[];
  onSaved: (project: StoreProject) => void;
}) {
  const [draft, setDraft] = useState<StoreProject>(project);
  const [saving, setSaving] = useState(false);
  const [uploadingOg, setUploadingOg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => setDraft(project), [project]);

  function patch<K extends keyof StoreProject>(key: K, value: StoreProject[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccess(null);
  }

  function validateDraftPayload(value: StoreProjectDraft) {
    if (!value.title.trim()) return "Project title is required.";
    if (!isProjectSlug(value.slug)) return "Project slug must use lowercase letters, numbers and single hyphens only.";
    if (conflictingSlugs.includes(value.slug)) return "Project slug must be unique.";
    return null;
  }

  async function verifyLinkedImageBeforePublish() {
    const { count, error: mediaError } = await supabase
      .from("store_project_media")
      .select("id", { count: "exact", head: true })
      .eq("project_id", draft.id)
      .eq("media_type", "image")
      .not("media_asset_id", "is", null);
    if (mediaError) return mediaError.message;
    if (!count) return "Add at least one eligible Media Library image before publishing.";
    return null;
  }

  async function persist(status: "draft" | "published") {
    if (!canEdit) return;
    const value: StoreProjectDraft = { ...draft, status };
    const duplicateSlug = conflictingSlugs.includes(value.slug);
    const validationError = status === "published" ? validateProjectForPublish(value, duplicateSlug) : validateDraftPayload(value);
    if (validationError) return setError(validationError);
    if (status === "published") {
      const mediaError = await verifyLinkedImageBeforePublish();
      if (mediaError) return setError(mediaError);
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return setError(userError?.message ?? "Unable to verify current user.");

    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      slug: draft.slug.trim(),
      status,
      title: draft.title.trim(),
      summary: cleanNullable(draft.summary),
      category: cleanNullable(draft.category),
      location: cleanNullable(draft.location),
      cover_image_url: cleanNullable(draft.cover_image_url),
      cover_image_alt: cleanNullable(draft.cover_image_alt),
      cover_media_asset_id: draft.cover_media_asset_id,
      attribution_classification: draft.attribution_classification,
      attribution_text: cleanNullable(draft.attribution_text),
      source_page_url: cleanNullable(draft.source_page_url),
      sort_order: Number.isFinite(draft.sort_order) ? draft.sort_order : 0,
      seo_title: cleanNullable(draft.seo_title),
      seo_description: cleanNullable(draft.seo_description),
      og_image_url: cleanNullable(draft.og_image_url),
      updated_by: user.id,
    };

    const { data, error: saveError } = await supabase.from("store_projects").update(payload).eq("id", draft.id).select(PROJECT_SELECT).single();
    if (saveError) setError(saveError.message);
    else {
      const saved = data as StoreProject;
      setDraft(saved);
      onSaved(saved);
      setSuccess(status === "published" ? "Project published." : "Draft saved.");
    }
    setSaving(false);
  }

  function selectCover(asset: StoreProjectEligibleMediaAsset) {
    setDraft((current) => ({
      ...current,
      cover_media_asset_id: asset.id,
      cover_image_url: asset.publicUrl,
      cover_image_alt: asset.default_alt_text ?? current.cover_image_alt,
    }));
    setError(null);
    setSuccess("Cover linked from the reviewed Media Library. Save the draft to persist it.");
  }

  async function uploadOgImage(file?: File) {
    if (!file || !canEdit) return;
    const validationError = validateImageFile(file);
    if (validationError) return setError(validationError);
    setUploadingOg(true);
    setError(null);
    const objectPath = buildStoreMediaPath(`projects-${draft.id}`, "og_image_url", file.name);
    const { error: uploadError } = await supabase.storage.from("store-media").upload(objectPath, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (uploadError) setError(uploadError.message);
    else {
      const { data } = supabase.storage.from("store-media").getPublicUrl(objectPath);
      patch("og_image_url", data.publicUrl);
      setSuccess("OG image uploaded. Save the draft to persist the URL.");
    }
    setUploadingOg(false);
  }

  const disabled = !canEdit || saving || uploadingOg;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Project details</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{draft.status}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Edit public project metadata, reviewed cover media, attribution and SEO.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void persist("draft")}>Save draft</button>
          {draft.status === "published" ? (
            <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void persist("draft")}>Unpublish</button>
          ) : (
            <button type="button" className={primaryButton} disabled={disabled} onClick={() => void persist("published")}>Publish</button>
          )}
        </div>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{success}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Field label="Title" value={draft.title} onChange={(value) => patch("title", value)} disabled={disabled} />
        <Field label="Slug" value={draft.slug} onChange={(value) => patch("slug", value.toLowerCase().trim())} disabled={disabled} placeholder="kitchen-projects" />
        <Field label="Category" value={draft.category} onChange={(value) => patch("category", value)} disabled={disabled} />
        <Field label="Location" value={draft.location} onChange={(value) => patch("location", value)} disabled={disabled} />
        <Field label="Sort order" value={draft.sort_order} type="number" onChange={(value) => patch("sort_order", Number(value) || 0)} disabled={disabled} />
        <div />
        <label className="block lg:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Summary</span>
          <textarea value={draft.summary ?? ""} onChange={(event) => patch("summary", event.target.value)} disabled={disabled} className={textareaClass} />
        </label>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Cover image</h3>
          <p className="mt-1 text-xs text-gray-500">Project covers must come from a published, relevant Media Library asset.</p>
        </div>
        {draft.cover_image_url ? <img src={draft.cover_image_url} alt={draft.cover_image_alt ?? "Selected project cover"} className="max-h-64 w-full rounded-xl object-cover" /> : null}
        <StoreProjectMediaAssetPicker selectedAssetId={draft.cover_media_asset_id} onSelect={selectCover} disabled={disabled} label="Choose project cover" />
        <Field label="Cover image alt text" value={draft.cover_image_alt} onChange={(value) => patch("cover_image_alt", value)} disabled={disabled} />
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Portfolio attribution</h3>
        <p className="mt-1 text-xs text-gray-500">Parent-attributed projects show this source visibly on the public Gallery.</p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Attribution classification</span>
          <select className={inputClass} disabled={disabled} value={draft.attribution_classification} onChange={(event) => patch("attribution_classification", event.target.value as StoreProject["attribution_classification"])}>
            <option value="oakwell_owned">Oakwell owned</option>
            <option value="parent_attributed">Parent attributed</option>
          </select>
        </label>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Attribution text" value={draft.attribution_text} onChange={(value) => patch("attribution_text", value)} disabled={disabled} placeholder="Portfolio source: Granite & Cabinet Center" />
          <Field label="Source page URL" value={draft.source_page_url} onChange={(value) => patch("source_page_url", value)} disabled={disabled} placeholder="https://granitecenterva.com/residential/" />
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Field label="SEO title" value={draft.seo_title} onChange={(value) => patch("seo_title", value)} disabled={disabled} />
        <Field label="SEO description" value={draft.seo_description} onChange={(value) => patch("seo_description", value)} disabled={disabled} />
        <div className="lg:col-span-2">
          <Field label="Open Graph image URL" value={draft.og_image_url} onChange={(value) => patch("og_image_url", value)} disabled={disabled} />
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600">
            <span>{uploadingOg ? "Uploading..." : "Upload OG image"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={disabled} onChange={(event) => void uploadOgImage(event.target.files?.[0])} />
          </label>
        </div>
      </div>
    </section>
  );
}
