"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type SiteSettings = {
  id: number;
  homepage_eyebrow: string | null;
  homepage_title: string;
  homepage_highlight: string | null;
  homepage_subtitle: string | null;
  hero_primary_label: string | null;
  hero_primary_href: string | null;
  hero_secondary_label: string | null;
  hero_secondary_href: string | null;
  hero_poster_url: string | null;
  hero_panorama_url: string | null;
  hero_panorama_enabled: boolean;
  show_features: boolean;
  show_featured_products: boolean;
  show_virtual_tour: boolean;
  show_dealer_cta: boolean;
  featured_products_eyebrow: string | null;
  featured_products_title: string | null;
  featured_products_description: string | null;
  dealer_cta_title: string | null;
  dealer_cta_description: string | null;
  dealer_cta_label: string | null;
  dealer_cta_href: string | null;
  footer_description: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  pinterest_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  homepage_seo_title: string | null;
  homepage_seo_description: string | null;
  homepage_og_image_url: string | null;
};

type HomeFeature = {
  id: string;
  title: string;
  description: string;
  link_label: string | null;
  link_href: string | null;
  sort_order: number;
  is_active: boolean;
};

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const textareaClass = `${inputClass} h-auto min-h-24 resize-y`;
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const dangerButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-medium text-error-700 disabled:opacity-50 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPublicHref(value: string) {
  return value.startsWith("/") || isHttpUrl(value);
}

function clean(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        className={inputClass}
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4"
      />
    </label>
  );
}

export default function StoreContentSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [features, setFeatures] = useState<HomeFeature[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [featureActionId, setFeatureActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }
    setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));

    const [settingsResult, featuresResult] = await Promise.all([
      supabase.from("store_site_settings").select("*").eq("id", 1).single(),
      supabase
        .from("store_home_features")
        .select("id,title,description,link_label,link_href,sort_order,is_active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (settingsResult.error) setError(settingsResult.error.message);
    else setSettings(settingsResult.data as SiteSettings);

    if (featuresResult.error) setError(featuresResult.error.message);
    else setFeatures((featuresResult.data ?? []) as HomeFeature[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    setSuccess(null);
  }

  function patchFeature<K extends keyof HomeFeature>(id: string, key: K, value: HomeFeature[K]) {
    setFeatures((current) =>
      current.map((feature) => (feature.id === id ? { ...feature, [key]: value } : feature))
    );
    setSuccess(null);
  }

  async function uploadImage(field: "hero_poster_url" | "homepage_og_image_url", file?: File) {
    if (!file || !settings) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) return setError("Image must be JPG, PNG, WebP or AVIF.");
    if (file.size > 20 * 1024 * 1024) return setError("Image must be 20 MB or smaller.");

    setUploadingField(field);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `site/${field}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("store-media")
      .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });

    if (uploadError) setError(uploadError.message);
    else {
      const { data } = supabase.storage.from("store-media").getPublicUrl(path);
      patch(field, data.publicUrl);
      setSuccess("Image uploaded. Save Store Content to publish the new URL.");
    }
    setUploadingField(null);
  }

  async function saveSettings() {
    if (!settings) return;

    const hrefFields = [
      ["Hero primary link", settings.hero_primary_href],
      ["Hero secondary link", settings.hero_secondary_href],
      ["Dealer CTA link", settings.dealer_cta_href],
    ] as const;
    for (const [label, value] of hrefFields) {
      const normalized = clean(value);
      if (normalized && !isPublicHref(normalized)) return setError(`${label} must be a site path or http(s) URL.`);
    }

    const socialFields = [
      ["Facebook", settings.facebook_url],
      ["Instagram", settings.instagram_url],
      ["LinkedIn", settings.linkedin_url],
      ["Pinterest", settings.pinterest_url],
      ["TikTok", settings.tiktok_url],
      ["YouTube", settings.youtube_url],
    ] as const;
    for (const [label, value] of socialFields) {
      const normalized = clean(value);
      if (normalized && !isHttpUrl(normalized)) return setError(`${label} must be a valid http(s) URL.`);
    }

    const title = settings.homepage_title.trim();
    if (!title) return setError("Homepage title is required.");

    setSaving(true);
    setError(null);
    setSuccess(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setError(userError?.message ?? "Unable to verify current user.");
      setSaving(false);
      return;
    }

    const payload = {
      homepage_eyebrow: clean(settings.homepage_eyebrow),
      homepage_title: title,
      homepage_highlight: clean(settings.homepage_highlight),
      homepage_subtitle: clean(settings.homepage_subtitle),
      hero_primary_label: clean(settings.hero_primary_label),
      hero_primary_href: clean(settings.hero_primary_href),
      hero_secondary_label: clean(settings.hero_secondary_label),
      hero_secondary_href: clean(settings.hero_secondary_href),
      hero_poster_url: clean(settings.hero_poster_url),
      hero_panorama_url: clean(settings.hero_panorama_url),
      hero_panorama_enabled: settings.hero_panorama_enabled,
      show_features: settings.show_features,
      show_featured_products: settings.show_featured_products,
      show_virtual_tour: settings.show_virtual_tour,
      show_dealer_cta: settings.show_dealer_cta,
      featured_products_eyebrow: clean(settings.featured_products_eyebrow),
      featured_products_title: clean(settings.featured_products_title),
      featured_products_description: clean(settings.featured_products_description),
      dealer_cta_title: clean(settings.dealer_cta_title),
      dealer_cta_description: clean(settings.dealer_cta_description),
      dealer_cta_label: clean(settings.dealer_cta_label),
      dealer_cta_href: clean(settings.dealer_cta_href),
      footer_description: clean(settings.footer_description),
      facebook_url: clean(settings.facebook_url),
      instagram_url: clean(settings.instagram_url),
      linkedin_url: clean(settings.linkedin_url),
      pinterest_url: clean(settings.pinterest_url),
      tiktok_url: clean(settings.tiktok_url),
      youtube_url: clean(settings.youtube_url),
      homepage_seo_title: clean(settings.homepage_seo_title),
      homepage_seo_description: clean(settings.homepage_seo_description),
      homepage_og_image_url: clean(settings.homepage_og_image_url),
      updated_by: user.id,
    };

    const { data, error: saveError } = await supabase
      .from("store_site_settings")
      .update(payload)
      .eq("id", 1)
      .select("*")
      .single();

    if (saveError) setError(saveError.message);
    else {
      setSettings(data as SiteSettings);
      setSuccess("Store content saved.");
    }
    setSaving(false);
  }

  async function addFeature() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setError("Unable to verify current user.");

    setFeatureActionId("new");
    const nextSort = features.length ? Math.max(...features.map((item) => item.sort_order)) + 10 : 10;
    const { error: insertError } = await supabase.from("store_home_features").insert({
      title: "New feature",
      description: "Add a short public-facing description.",
      sort_order: nextSort,
      is_active: false,
      updated_by: user.id,
    });

    if (insertError) setError(insertError.message);
    else await load();
    setFeatureActionId(null);
  }

  async function saveFeature(feature: HomeFeature) {
    const title = feature.title.trim();
    const description = feature.description.trim();
    const href = clean(feature.link_href);
    if (!title || !description) return setError("Feature title and description are required.");
    if (href && !isPublicHref(href)) return setError("Feature link must be a site path or http(s) URL.");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setError("Unable to verify current user.");

    setFeatureActionId(feature.id);
    setError(null);
    const { error: updateError } = await supabase
      .from("store_home_features")
      .update({
        title,
        description,
        link_label: clean(feature.link_label),
        link_href: href,
        sort_order: Number.isFinite(feature.sort_order) ? feature.sort_order : 0,
        is_active: feature.is_active,
        updated_by: user.id,
      })
      .eq("id", feature.id);

    if (updateError) setError(updateError.message);
    else setSuccess(`${title} saved.`);
    setFeatureActionId(null);
  }

  async function deleteFeature(feature: HomeFeature) {
    if (!window.confirm(`Delete ${feature.title}?`)) return;
    setFeatureActionId(feature.id);
    const { error: deleteError } = await supabase.from("store_home_features").delete().eq("id", feature.id);
    if (deleteError) setError(deleteError.message);
    else setFeatures((current) => current.filter((item) => item.id !== feature.id));
    setFeatureActionId(null);
  }

  if (loading || !settings) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
        Loading Store content...
      </div>
    );
  }

  const disabled = !canEdit || saving || Boolean(uploadingField);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Public Store Content</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Manage homepage presentation, footer messaging, social links and homepage SEO. Company identity and contact details remain in General Settings.
            </p>
          </div>
          {canEdit && (
            <button type="button" onClick={saveSettings} disabled={disabled} className={primaryButton}>
              {saving ? "Saving..." : "Save Store Content"}
            </button>
          )}
        </div>
        {error && <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
        {success && <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Homepage Hero</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Eyebrow" value={settings.homepage_eyebrow} onChange={(value) => patch("homepage_eyebrow", value)} disabled={disabled} />
          <Field label="Highlighted phrase" value={settings.homepage_highlight} onChange={(value) => patch("homepage_highlight", value)} disabled={disabled} />
          <div className="md:col-span-2"><Field label="Main title" value={settings.homepage_title} onChange={(value) => patch("homepage_title", value)} disabled={disabled} /></div>
          <label className="md:col-span-2 block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Subtitle</span><textarea value={settings.homepage_subtitle ?? ""} onChange={(event) => patch("homepage_subtitle", event.target.value)} disabled={disabled} className={textareaClass} /></label>
          <Field label="Primary CTA label" value={settings.hero_primary_label} onChange={(value) => patch("hero_primary_label", value)} disabled={disabled} />
          <Field label="Primary CTA link" value={settings.hero_primary_href} onChange={(value) => patch("hero_primary_href", value)} disabled={disabled} placeholder="/products" />
          <Field label="Secondary CTA label" value={settings.hero_secondary_label} onChange={(value) => patch("hero_secondary_label", value)} disabled={disabled} />
          <Field label="Secondary CTA link" value={settings.hero_secondary_href} onChange={(value) => patch("hero_secondary_href", value)} disabled={disabled} placeholder="/contact" />
          <div className="md:col-span-2 grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Hero poster URL" value={settings.hero_poster_url} onChange={(value) => patch("hero_poster_url", value)} disabled={disabled} />
            {canEdit && <label className={`${secondaryButton} ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>{uploadingField === "hero_poster_url" ? "Uploading..." : "Upload Hero Image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled} onChange={(event) => void uploadImage("hero_poster_url", event.target.files?.[0])} /></label>}
          </div>
          <Field label="360 panorama URL" value={settings.hero_panorama_url} onChange={(value) => patch("hero_panorama_url", value)} disabled={disabled} />
          <Toggle label="Enable 360° hero on supported desktop devices" description="The static hero poster remains the performance-first fallback." checked={settings.hero_panorama_enabled} onChange={(value) => patch("hero_panorama_enabled", value)} disabled={disabled} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Homepage Sections</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Toggle label="Why Oakwell cards" description="Show the managed public feature cards below the hero." checked={settings.show_features} onChange={(value) => patch("show_features", value)} disabled={disabled} />
          <Toggle label="Featured products" description="Show published products marked Featured in Store Product Content." checked={settings.show_featured_products} onChange={(value) => patch("show_featured_products", value)} disabled={disabled} />
          <Toggle label="Virtual tour" description="Show the existing virtual tour section. Disabled by default to protect performance until content is finalized." checked={settings.show_virtual_tour} onChange={(value) => patch("show_virtual_tour", value)} disabled={disabled} />
          <Toggle label="Dealer CTA" description="Show the dealer/contact call to action near the end of the homepage." checked={settings.show_dealer_cta} onChange={(value) => patch("show_dealer_cta", value)} disabled={disabled} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Featured products eyebrow" value={settings.featured_products_eyebrow} onChange={(value) => patch("featured_products_eyebrow", value)} disabled={disabled} />
          <Field label="Featured products title" value={settings.featured_products_title} onChange={(value) => patch("featured_products_title", value)} disabled={disabled} />
          <label className="md:col-span-2 block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Featured products description</span><textarea value={settings.featured_products_description ?? ""} onChange={(event) => patch("featured_products_description", event.target.value)} disabled={disabled} className={textareaClass} /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Why Oakwell Cards</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Use factual, durable statements. Avoid unverified awards, delivery times or performance claims.</p></div>{canEdit && <button type="button" onClick={addFeature} disabled={featureActionId === "new"} className={secondaryButton}>Add Card</button>}</div>
        <div className="mt-4 space-y-4">
          {features.map((feature) => (
            <div key={feature.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Title" value={feature.title} onChange={(value) => patchFeature(feature.id, "title", value)} disabled={!canEdit || featureActionId === feature.id} />
                <Field label="Link label" value={feature.link_label} onChange={(value) => patchFeature(feature.id, "link_label", value)} disabled={!canEdit || featureActionId === feature.id} />
                <label className="md:col-span-2 block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</span><textarea value={feature.description} onChange={(event) => patchFeature(feature.id, "description", event.target.value)} disabled={!canEdit || featureActionId === feature.id} className={textareaClass} /></label>
                <Field label="Link" value={feature.link_href} onChange={(value) => patchFeature(feature.id, "link_href", value)} disabled={!canEdit || featureActionId === feature.id} />
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort order</span><input type="number" value={feature.sort_order} onChange={(event) => patchFeature(feature.id, "sort_order", Number(event.target.value))} disabled={!canEdit || featureActionId === feature.id} className={inputClass} /></label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={feature.is_active} onChange={(event) => patchFeature(feature.id, "is_active", event.target.checked)} disabled={!canEdit || featureActionId === feature.id} />Active</label>
                {canEdit && <div className="flex gap-2"><button type="button" onClick={() => void saveFeature(feature)} disabled={featureActionId === feature.id} className={secondaryButton}>{featureActionId === feature.id ? "Saving..." : "Save Card"}</button><button type="button" onClick={() => void deleteFeature(feature)} disabled={featureActionId === feature.id} className={dangerButton}>Delete</button></div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Dealer CTA</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Title" value={settings.dealer_cta_title} onChange={(value) => patch("dealer_cta_title", value)} disabled={disabled} /></div>
          <label className="md:col-span-2 block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</span><textarea value={settings.dealer_cta_description ?? ""} onChange={(event) => patch("dealer_cta_description", event.target.value)} disabled={disabled} className={textareaClass} /></label>
          <Field label="Button label" value={settings.dealer_cta_label} onChange={(value) => patch("dealer_cta_label", value)} disabled={disabled} />
          <Field label="Button link" value={settings.dealer_cta_href} onChange={(value) => patch("dealer_cta_href", value)} disabled={disabled} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Footer & Social</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Logo, email, phone and address come from General Settings → Company.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Footer description</span><textarea value={settings.footer_description ?? ""} onChange={(event) => patch("footer_description", event.target.value)} disabled={disabled} className={textareaClass} /></label>
          <Field label="Facebook URL" value={settings.facebook_url} onChange={(value) => patch("facebook_url", value)} disabled={disabled} />
          <Field label="Instagram URL" value={settings.instagram_url} onChange={(value) => patch("instagram_url", value)} disabled={disabled} />
          <Field label="LinkedIn URL" value={settings.linkedin_url} onChange={(value) => patch("linkedin_url", value)} disabled={disabled} />
          <Field label="Pinterest URL" value={settings.pinterest_url} onChange={(value) => patch("pinterest_url", value)} disabled={disabled} />
          <Field label="TikTok URL" value={settings.tiktok_url} onChange={(value) => patch("tiktok_url", value)} disabled={disabled} />
          <Field label="YouTube URL" value={settings.youtube_url} onChange={(value) => patch("youtube_url", value)} disabled={disabled} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Homepage SEO</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="SEO title" value={settings.homepage_seo_title} onChange={(value) => patch("homepage_seo_title", value)} disabled={disabled} maxLength={70} /></div>
          <label className="md:col-span-2 block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO description</span><textarea value={settings.homepage_seo_description ?? ""} onChange={(event) => patch("homepage_seo_description", event.target.value)} disabled={disabled} maxLength={180} className={textareaClass} /></label>
          <div className="md:col-span-2 grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Open Graph image URL" value={settings.homepage_og_image_url} onChange={(value) => patch("homepage_og_image_url", value)} disabled={disabled} />
            {canEdit && <label className={`${secondaryButton} ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>{uploadingField === "homepage_og_image_url" ? "Uploading..." : "Upload OG Image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled} onChange={(event) => void uploadImage("homepage_og_image_url", event.target.files?.[0])} /></label>}
          </div>
        </div>
      </section>
    </div>
  );
}
