"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  buildStoreMediaPath,
  cleanNullable,
  isPublicHref,
  type StorePage,
  type StorePageDraft,
  validateImageFile,
  validatePageForPublish,
} from "@/lib/store/secondaryCms";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const textareaClass = `${inputClass} h-auto min-h-28 resize-y`;
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

export default function StorePageEditor({
  page,
  canEdit,
  onSaved,
}: {
  page: StorePage;
  canEdit: boolean;
  onSaved: (page: StorePage) => void;
}) {
  const [draft, setDraft] = useState<StorePage>(page);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<"hero_image_url" | "og_image_url" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(page);
  }, [page]);

  function patch<K extends keyof StorePage>(key: K, value: StorePage[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccess(null);
  }

  function validateDraftPayload(value: StorePageDraft) {
    if (!value.title.trim()) return "Page title is required.";
    const heroUrl = cleanNullable(value.hero_image_url);
    const heroAlt = cleanNullable(value.hero_image_alt);
    if (heroUrl && !heroAlt) return "Hero image alt text is required when a hero image is set.";
    const ctaLabel = cleanNullable(value.cta_label);
    const ctaHref = cleanNullable(value.cta_href);
    if (Boolean(ctaLabel) !== Boolean(ctaHref)) return "CTA label and link must both be set or both be empty.";
    if (ctaHref && !isPublicHref(ctaHref)) return "CTA link must be a site path or http(s) URL.";
    return null;
  }

  async function persist(status: "draft" | "published") {
    if (!canEdit) return;

    const value: StorePageDraft = { ...draft, status };
    const validationError = status === "published" ? validatePageForPublish(value) : validateDraftPayload(value);
    if (validationError) {
      setError(validationError);
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

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      slug: draft.slug,
      status,
      eyebrow: cleanNullable(draft.eyebrow),
      title: draft.title.trim(),
      intro: cleanNullable(draft.intro),
      body: cleanNullable(draft.body),
      hero_image_url: cleanNullable(draft.hero_image_url),
      hero_image_alt: cleanNullable(draft.hero_image_alt),
      cta_label: cleanNullable(draft.cta_label),
      cta_href: cleanNullable(draft.cta_href),
      seo_title: cleanNullable(draft.seo_title),
      seo_description: cleanNullable(draft.seo_description),
      og_image_url: cleanNullable(draft.og_image_url),
      updated_by: user.id,
    };

    const { data, error: saveError } = await supabase
      .from("store_pages")
      .upsert(payload, { onConflict: "slug" })
      .select(
        "id,slug,status,eyebrow,title,intro,body,hero_image_url,hero_image_alt,cta_label,cta_href,seo_title,seo_description,og_image_url,published_at,updated_at"
      )
      .single();

    if (saveError) {
      setError(saveError.message);
    } else {
      const saved = data as StorePage;
      setDraft(saved);
      onSaved(saved);
      setSuccess(status === "published" ? "Page published." : "Draft saved.");
    }
    setSaving(false);
  }

  async function uploadImage(field: "hero_image_url" | "og_image_url", file?: File) {
    if (!file || !canEdit) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploadingField(field);
    setError(null);
    setSuccess(null);
    const path = buildStoreMediaPath(`pages-${draft.slug}`, field, file.name);
    const { error: uploadError } = await supabase.storage
      .from("store-media")
      .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });

    if (uploadError) {
      setError(uploadError.message);
    } else {
      const { data } = supabase.storage.from("store-media").getPublicUrl(path);
      patch(field, data.publicUrl);
      setSuccess("Image uploaded. Choose Save draft or Publish to persist the new URL.");
    }
    setUploadingField(null);
  }

  const disabled = !canEdit || saving || Boolean(uploadingField);
  const label = draft.slug === "about" ? "About" : "Gallery";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{label} page</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {draft.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Controlled slug: <code>/{draft.slug}</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void persist("draft")}>
            Save draft
          </button>
          {draft.status === "published" ? (
            <button type="button" className={secondaryButton} disabled={disabled} onClick={() => void persist("draft")}>
              Unpublish
            </button>
          ) : (
            <button type="button" className={primaryButton} disabled={disabled} onClick={() => void persist("published")}>
              Publish
            </button>
          )}
        </div>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{success}</p> : null}
      {!canEdit ? <p className="mt-4 text-sm text-warning-600">You can view this content, but only Admin roles can change or publish it.</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Field label="Eyebrow" value={draft.eyebrow} onChange={(value) => patch("eyebrow", value)} disabled={disabled} />
        <Field label="Title" value={draft.title} onChange={(value) => patch("title", value)} disabled={disabled} />
        <label className="block lg:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Intro</span>
          <textarea value={draft.intro ?? ""} onChange={(event) => patch("intro", event.target.value)} disabled={disabled} className={textareaClass} />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Body</span>
          <textarea value={draft.body ?? ""} onChange={(event) => patch("body", event.target.value)} disabled={disabled} className={`${textareaClass} min-h-40`} />
        </label>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Hero image</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Hero image URL" value={draft.hero_image_url} onChange={(value) => patch("hero_image_url", value)} disabled={disabled} />
          <Field label="Hero image alt text" value={draft.hero_image_alt} onChange={(value) => patch("hero_image_alt", value)} disabled={disabled} />
        </div>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600">
          <span>{uploadingField === "hero_image_url" ? "Uploading..." : "Upload hero image"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={disabled} onChange={(event) => void uploadImage("hero_image_url", event.target.files?.[0])} />
        </label>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Field label="CTA label" value={draft.cta_label} onChange={(value) => patch("cta_label", value)} disabled={disabled} />
        <Field label="CTA link" value={draft.cta_href} onChange={(value) => patch("cta_href", value)} disabled={disabled} placeholder="/contact or https://..." />
        <Field label="SEO title" value={draft.seo_title} onChange={(value) => patch("seo_title", value)} disabled={disabled} />
        <Field label="SEO description" value={draft.seo_description} onChange={(value) => patch("seo_description", value)} disabled={disabled} />
        <div className="lg:col-span-2">
          <Field label="Open Graph image URL" value={draft.og_image_url} onChange={(value) => patch("og_image_url", value)} disabled={disabled} />
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-600">
            <span>{uploadingField === "og_image_url" ? "Uploading..." : "Upload OG image"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={disabled} onChange={(event) => void uploadImage("og_image_url", event.target.files?.[0])} />
          </label>
        </div>
      </div>
    </section>
  );
}
