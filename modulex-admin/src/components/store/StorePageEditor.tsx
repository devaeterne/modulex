"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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

export type PageFieldErrors = {
  title?: string;
  heroAlt?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export default function StorePageEditor({ page, canEdit, onSaved }: { page: StorePage; canEdit: boolean; onSaved: (page: StorePage) => void }) {
  const [draft, setDraft] = useState<StorePage>(page);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<"hero_image_url" | "og_image_url" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PageFieldErrors>({});

  useEffect(() => { setDraft(page); setFieldErrors({}); }, [page]);
  function patch<K extends keyof StorePage>(key: K, value: StorePage[K], errorKey?: keyof PageFieldErrors) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (errorKey) setFieldErrors((current) => ({ ...current, [errorKey]: undefined }));
    setError(null); setSuccess(null);
  }

  function validateFields(value: StorePageDraft) {
    const next: PageFieldErrors = {};
    if (!value.title.trim()) next.title = "Page title is required.";
    const heroUrl = cleanNullable(value.hero_image_url);
    const heroAlt = cleanNullable(value.hero_image_alt);
    if (heroUrl && !heroAlt) next.heroAlt = "Hero image alt text is required when a hero image is set.";
    const ctaLabel = cleanNullable(value.cta_label);
    const ctaHref = cleanNullable(value.cta_href);
    if (ctaLabel && !ctaHref) next.ctaHref = "CTA link is required when a CTA label is set.";
    if (!ctaLabel && ctaHref) next.ctaLabel = "CTA label is required when a CTA link is set.";
    if (ctaHref && !isPublicHref(ctaHref)) next.ctaHref = "CTA link must be a site path or http(s) URL.";
    return next;
  }
  function focusFirstInvalid(errors: PageFieldErrors) {
    const id = errors.title ? `page-title-${draft.slug}` : errors.heroAlt ? `page-hero-alt-${draft.slug}` : errors.ctaLabel ? `page-cta-label-${draft.slug}` : errors.ctaHref ? `page-cta-href-${draft.slug}` : null;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function persist(status: "draft" | "published") {
    if (!canEdit) return;
    const value: StorePageDraft = { ...draft, status };
    const next = validateFields(value);
    setFieldErrors(next);
    if (Object.keys(next).length) { setError("Correct the highlighted page fields before saving."); focusFirstInvalid(next); return; }
    const domainError = status === "published" ? validatePageForPublish(value) : null;
    if (domainError) { setError(domainError); return; }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { setError(userError?.message ?? "Unable to verify current user."); return; }
    setSaving(true); setError(null); setSuccess(null);
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
    const { data, error: saveError } = await supabase.from("store_pages").upsert(payload, { onConflict: "slug" }).select("id,slug,status,eyebrow,title,intro,body,hero_image_url,hero_image_alt,cta_label,cta_href,seo_title,seo_description,og_image_url,published_at,updated_at").single();
    if (saveError) setError(saveError.message);
    else { const saved = data as StorePage; setDraft(saved); onSaved(saved); setSuccess(status === "published" ? "Page published." : "Draft saved."); }
    setSaving(false);
  }

  async function uploadImage(field: "hero_image_url" | "og_image_url", file?: File) {
    if (!file || !canEdit) return;
    const validationError = validateImageFile(file);
    if (validationError) { setError(validationError); return; }
    setUploadingField(field); setError(null); setSuccess(null);
    const path = buildStoreMediaPath(`pages-${draft.slug}`, field, file.name);
    const { error: uploadError } = await supabase.storage.from("store-media").upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (uploadError) setError(uploadError.message);
    else { const { data } = supabase.storage.from("store-media").getPublicUrl(path); patch(field, data.publicUrl); setSuccess("Image uploaded. Choose Save draft or Publish to persist the new URL."); }
    setUploadingField(null);
  }

  const disabled = !canEdit || saving || Boolean(uploadingField);
  const label = draft.slug === "about" ? "About" : draft.slug === "gallery" ? "Gallery" : draft.slug;

  return <div className="space-y-5">
    {error ? <Alert variant="error" title={`${label} page`} message={error} /> : null}
    {success ? <Alert variant="success" title={`${label} page`} message={success} /> : null}
    {!canEdit ? <Alert variant="warning" title="View only" message="Only Admin roles can change or publish this content." /> : null}
    <ComponentCard title={`${label} page`} desc={`Controlled slug: /${draft.slug}`} headerAction={<div className="flex flex-wrap items-center gap-2"><Badge color={draft.status === "published" ? "success" : "light"}>{draft.status}</Badge><Button variant="outline" disabled={disabled} onClick={() => void persist("draft")}>Save draft</Button>{draft.status === "published" ? <Button variant="outline" disabled={disabled} onClick={() => void persist("draft")}>Unpublish</Button> : <Button disabled={disabled} onClick={() => void persist("published")}>Publish</Button>}</div>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div><Label htmlFor={`page-eyebrow-${draft.slug}`}>Eyebrow</Label><Input id={`page-eyebrow-${draft.slug}`} value={draft.eyebrow ?? ""} onChange={(event) => patch("eyebrow", event.target.value)} disabled={disabled} /></div>
        <div><Label htmlFor={`page-title-${draft.slug}`}>Title</Label><Input id={`page-title-${draft.slug}`} value={draft.title} onChange={(event) => patch("title", event.target.value, "title")} disabled={disabled} error={Boolean(fieldErrors.title)} hint={fieldErrors.title} /></div>
        <div className="lg:col-span-2"><Label htmlFor={`page-intro-${draft.slug}`}>Intro</Label><TextArea id={`page-intro-${draft.slug}`} rows={4} value={draft.intro ?? ""} onChange={(value) => patch("intro", value)} disabled={disabled} /></div>
        <div className="lg:col-span-2"><Label htmlFor={`page-body-${draft.slug}`}>Body</Label><TextArea id={`page-body-${draft.slug}`} rows={8} value={draft.body ?? ""} onChange={(value) => patch("body", value)} disabled={disabled} /></div>
      </div>
    </ComponentCard>

    <ComponentCard title="Hero image"><div className="grid gap-4 lg:grid-cols-2"><div><Label htmlFor={`page-hero-url-${draft.slug}`}>Hero image URL</Label><Input id={`page-hero-url-${draft.slug}`} value={draft.hero_image_url ?? ""} onChange={(event) => patch("hero_image_url", event.target.value)} disabled={disabled} /></div><div><Label htmlFor={`page-hero-alt-${draft.slug}`}>Hero image alt text</Label><Input id={`page-hero-alt-${draft.slug}`} value={draft.hero_image_alt ?? ""} onChange={(event) => patch("hero_image_alt", event.target.value, "heroAlt")} disabled={disabled} error={Boolean(fieldErrors.heroAlt)} hint={fieldErrors.heroAlt} /></div><div className="lg:col-span-2"><Label htmlFor={`page-hero-file-${draft.slug}`}>Upload hero image</Label><Input id={`page-hero-file-${draft.slug}`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled} onChange={(event) => void uploadImage("hero_image_url", event.target.files?.[0])} /></div></div></ComponentCard>

    <ComponentCard title="CTA & SEO"><div className="grid gap-5 lg:grid-cols-2"><div><Label htmlFor={`page-cta-label-${draft.slug}`}>CTA label</Label><Input id={`page-cta-label-${draft.slug}`} value={draft.cta_label ?? ""} onChange={(event) => patch("cta_label", event.target.value, "ctaLabel")} disabled={disabled} error={Boolean(fieldErrors.ctaLabel)} hint={fieldErrors.ctaLabel} /></div><div><Label htmlFor={`page-cta-href-${draft.slug}`}>CTA link</Label><Input id={`page-cta-href-${draft.slug}`} value={draft.cta_href ?? ""} onChange={(event) => patch("cta_href", event.target.value, "ctaHref")} disabled={disabled} placeholder="/contact or https://..." error={Boolean(fieldErrors.ctaHref)} hint={fieldErrors.ctaHref} /></div><div><Label htmlFor={`page-seo-title-${draft.slug}`}>SEO title</Label><Input id={`page-seo-title-${draft.slug}`} value={draft.seo_title ?? ""} onChange={(event) => patch("seo_title", event.target.value)} disabled={disabled} /></div><div><Label htmlFor={`page-seo-description-${draft.slug}`}>SEO description</Label><Input id={`page-seo-description-${draft.slug}`} value={draft.seo_description ?? ""} onChange={(event) => patch("seo_description", event.target.value)} disabled={disabled} /></div><div className="lg:col-span-2"><Label htmlFor={`page-og-url-${draft.slug}`}>Open Graph image URL</Label><Input id={`page-og-url-${draft.slug}`} value={draft.og_image_url ?? ""} onChange={(event) => patch("og_image_url", event.target.value)} disabled={disabled} /><Label htmlFor={`page-og-file-${draft.slug}`}>Upload Open Graph image</Label><Input id={`page-og-file-${draft.slug}`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled} onChange={(event) => void uploadImage("og_image_url", event.target.files?.[0])} /></div></div></ComponentCard>
  </div>;
}
