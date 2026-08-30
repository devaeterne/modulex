"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StoreContent = {
  id: string;
  base_product_code: string;
  slug: string;
  display_name: string;
  short_description: string | null;
  description: string | null;
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
};

type ProductVariant = {
  id: string;
  sku: string;
  color_code: string | null;
  color_name: string | null;
  category_name: { name: string }[] | null;
  brand_name: { name: string }[] | null;
};

type StoreMedia = {
  id: string;
  product_content_id: string;
  color_code: string | null;
  media_type: "image" | "document" | "video";
  url: string;
  alt_text: string | null;
  title: string | null;
  sort_order: number;
  is_primary: boolean;
  storage_bucket: string | null;
  storage_path: string | null;
};

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";

const STORE_MEDIA_BUCKET = "store-media";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "asset";
}

export default function StoreProductEditor({ productContentId }: { productContentId: string }) {
  const [content, setContent] = useState<StoreContent | null>(null);
  const [initialSlug, setInitialSlug] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [media, setMedia] = useState<StoreMedia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaActionId, setMediaActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadColorCode, setUploadColorCode] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data: contentRow, error: contentError } = await supabase
      .from("store_product_content")
      .select(
        "id,base_product_code,slug,display_name,short_description,description,is_published,is_featured,sort_order,seo_title,seo_description,og_image_url"
      )
      .eq("id", productContentId)
      .single();

    if (contentError || !contentRow) {
      setErrorMessage(contentError?.message ?? "Store product content was not found.");
      setIsLoading(false);
      return;
    }

    const nextContent = contentRow as StoreContent;

    const [{ data: variantRows, error: variantError }, { data: mediaRows, error: mediaError }] =
      await Promise.all([
        supabase
          .from("products")
          .select("id,sku,color_code,color_name,brand_name:product_brands(name),category_name:product_categories(name)")
          .eq("base_product_code", nextContent.base_product_code)
          .eq("status", "active")
          .order("sku", { ascending: true }),
        supabase
          .from("store_product_media")
          .select(
            "id,product_content_id,color_code,media_type,url,alt_text,title,sort_order,is_primary,storage_bucket,storage_path"
          )
          .eq("product_content_id", nextContent.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (variantError || mediaError) {
      setErrorMessage(variantError?.message ?? mediaError?.message ?? "Unable to load Store product data.");
      setIsLoading(false);
      return;
    }

    setContent(nextContent);
    setInitialSlug(nextContent.slug);
    setVariants((variantRows ?? []) as ProductVariant[]);
    setMedia((mediaRows ?? []) as StoreMedia[]);
    setIsLoading(false);
  }, [productContentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const primaryImage = useMemo(
    () => media.find((item) => item.media_type === "image" && item.is_primary) ?? null,
    [media]
  );

  const imageMedia = useMemo(() => media.filter((item) => item.media_type === "image"), [media]);
  const documentMedia = useMemo(
    () => media.filter((item) => item.media_type === "document"),
    [media]
  );
  const videoMedia = useMemo(() => media.filter((item) => item.media_type === "video"), [media]);

  const colorOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const variant of variants) {
      if (variant.color_code) {
        byCode.set(variant.color_code, variant.color_name || variant.color_code);
      }
    }
    return Array.from(byCode.entries()).map(([code, name]) => ({ code, name }));
  }, [variants]);

  function patchContent<K extends keyof StoreContent>(key: K, value: StoreContent[K]) {
    setContent((current) => (current ? { ...current, [key]: value } : current));
    setSuccessMessage(null);
  }

  async function getCurrentUserId() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      throw new Error(error?.message ?? "Unable to verify the current user.");
    }

    return user.id;
  }

  async function handleSave() {
    if (!content) return;

    const displayName = content.display_name.trim();
    const slug = content.slug.trim().toLowerCase();
    const shortDescription = content.short_description?.trim() || null;
    const description = content.description?.trim() || null;
    const hasCopy = Boolean(shortDescription || description);

    if (!displayName) {
      setErrorMessage("Display name is required.");
      return;
    }

    if (!SLUG_PATTERN.test(slug)) {
      setErrorMessage("Slug must contain lowercase letters, numbers, and single hyphens only.");
      return;
    }

    const hasPrimaryAltText = Boolean(primaryImage?.alt_text?.trim());
    if (content.is_published && (!hasCopy || !primaryImage || !hasPrimaryAltText || variants.length === 0)) {
      setErrorMessage(
        "A published product must have marketing copy, an active variant, and a primary image with alt text. Add the missing content or switch it back to Draft."
      );
      return;
    }

    if (content.is_published && initialSlug !== null && slug !== initialSlug) {
      setErrorMessage("Published Store product slug cannot change; unpublish it before changing the public slug.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from("store_product_content")
        .update({
          display_name: displayName,
          slug,
          short_description: shortDescription,
          description,
          is_published: content.is_published,
          is_featured: content.is_featured,
          sort_order: Number.isFinite(content.sort_order) ? content.sort_order : 0,
          seo_title: content.seo_title?.trim() || null,
          seo_description: content.seo_description?.trim() || null,
          og_image_url: content.og_image_url?.trim() || null,
          updated_by: userId,
        })
        .eq("id", content.id);

      if (error) throw error;

      setContent((current) =>
        current
          ? {
              ...current,
              display_name: displayName,
              slug,
              short_description: shortDescription,
              description,
            }
          : current
      );
      setInitialSlug(slug);
      setSuccessMessage("Store product content saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save Store product content.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!content || !file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    let uploadedPath: string | null = null;

    try {
      const userId = await getCurrentUserId();
      const safeBaseCode = sanitizeFileName(content.base_product_code).toLowerCase();
      const safeFileName = sanitizeFileName(file.name);
      uploadedPath = `${safeBaseCode}/${crypto.randomUUID()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(STORE_MEDIA_BUCKET)
        .upload(uploadedPath, file, {
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(STORE_MEDIA_BUCKET).getPublicUrl(uploadedPath);

      const mediaType: StoreMedia["media_type"] =
        file.type === "application/pdf" ? "document" : "image";

      const { error: insertError } = await supabase.from("store_product_media").insert({
        product_content_id: content.id,
        color_code: uploadColorCode || null,
        media_type: mediaType,
        url: publicUrl,
        alt_text: mediaType === "image" ? content.display_name : null,
        title: file.name,
        sort_order: media.length,
        is_primary: false,
        storage_bucket: STORE_MEDIA_BUCKET,
        storage_path: uploadedPath,
        created_by: userId,
        updated_by: userId,
      });

      if (insertError) {
        await supabase.storage.from(STORE_MEDIA_BUCKET).remove([uploadedPath]);
        throw insertError;
      }

      await loadData();
      setSuccessMessage(
        mediaType === "image" ? "Image uploaded. Select a primary image before publishing." : "Document uploaded."
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload Store media.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSetPrimary(item: StoreMedia) {
    if (!content || item.media_type !== "image") return;

    setMediaActionId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const userId = await getCurrentUserId();
      const { error: clearError } = await supabase
        .from("store_product_media")
        .update({ is_primary: false, updated_by: userId })
        .eq("product_content_id", content.id)
        .eq("media_type", "image");

      if (clearError) throw clearError;

      const { error: primaryError } = await supabase
        .from("store_product_media")
        .update({ is_primary: true, updated_by: userId })
        .eq("id", item.id);

      if (primaryError) throw primaryError;

      if (!content.og_image_url) {
        setContent((current) => (current ? { ...current, og_image_url: item.url } : current));
      }

      await loadData();
      setSuccessMessage("Primary image updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the primary image.");
    } finally {
      setMediaActionId(null);
    }
  }

  async function handleUpdateMedia(item: StoreMedia, updates: Pick<StoreMedia, "alt_text" | "title" | "sort_order">) {
    setMediaActionId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("store_product_media").update({
        alt_text: updates.alt_text?.trim() || null,
        title: updates.title?.trim() || null,
        sort_order: Number.isFinite(updates.sort_order) ? updates.sort_order : 0,
        updated_by: userId,
      }).eq("id", item.id);
      if (error) throw error;
      await loadData();
      setSuccessMessage("Store media details updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update Store media details.");
    } finally {
      setMediaActionId(null);
    }
  }

  async function handleDeleteMedia(item: StoreMedia) {
    if (!content) return;

    if (item.is_primary && content.is_published) {
      setErrorMessage("Unpublish the product or select another primary image before deleting this image.");
      return;
    }

    if (!window.confirm(`Delete ${item.title || "this Store asset"}? This cannot be undone.`)) {
      return;
    }

    setMediaActionId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (item.storage_bucket && item.storage_path) {
        const { error: storageError } = await supabase.storage
          .from(item.storage_bucket)
          .remove([item.storage_path]);

        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from("store_product_media")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;

      await loadData();
      setSuccessMessage("Store asset deleted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete Store media.");
    } finally {
      setMediaActionId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Loading Store product...
      </div>
    );
  }

  if (!content) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        {errorMessage ?? "Store product content was not found."}
      </div>
    );
  }

  const category = variants.find((item) => item.category_name?.length)?.category_name?.[0]?.name ?? null;
  const brand = variants.find((item) => item.brand_name?.length)?.brand_name?.[0]?.name ?? null;

  return (
    <div className="space-y-6">
      {(errorMessage || successMessage) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            errorMessage
              ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
              : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
          }`}
        >
          {errorMessage ?? successMessage}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">{content.display_name}</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                content.is_published
                  ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                  : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"
              }`}
            >
              {content.is_published ? "Published" : "Draft"}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Master product: {content.base_product_code}
            {category ? ` · ${category}` : ""}
            {brand ? ` · ${brand}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/store/products"
            className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Back to Store Products
          </Link>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Presentation Content</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This copy is public Store content and does not modify the operational product master.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Display name</span>
                <input
                  value={content.display_name}
                  onChange={(event) => patchContent("display_name", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Public slug</span>
                <input
                  value={content.slug}
                  onChange={(event) => patchContent("slug", event.target.value.toLowerCase())}
                  className={fieldClass}
                />
              </label>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Short description</span>
              <textarea
                rows={3}
                value={content.short_description ?? ""}
                onChange={(event) => patchContent("short_description", event.target.value)}
                className={fieldClass}
                placeholder="Short catalog/card description"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Full description</span>
              <textarea
                rows={8}
                value={content.description ?? ""}
                onChange={(event) => patchContent("description", event.target.value)}
                className={fieldClass}
                placeholder="Detailed public product presentation"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">SEO</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Leave optional fields empty to fall back to the public product name and description.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO title</span>
              <input
                value={content.seo_title ?? ""}
                onChange={(event) => patchContent("seo_title", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO description</span>
              <textarea
                rows={3}
                value={content.seo_description ?? ""}
                onChange={(event) => patchContent("seo_description", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Open Graph image URL</span>
              <div className="flex gap-2">
                <input
                  value={content.og_image_url ?? ""}
                  onChange={(event) => patchContent("og_image_url", event.target.value)}
                  className={fieldClass}
                  placeholder="Uses primary image when left empty"
                />
                {primaryImage && (
                  <button
                    type="button"
                    onClick={() => patchContent("og_image_url", primaryImage.url)}
                    className="shrink-0 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                  >
                    Use primary
                  </button>
                )}
              </div>
            </label>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Media & Downloads</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  JPG, PNG, WebP, AVIF and PDF up to 20 MB. Public files are served from Store media storage.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={uploadColorCode}
                  onChange={(event) => setUploadColorCode(event.target.value)}
                  className={`${fieldClass} sm:w-[180px]`}
                >
                  <option value="">All variants</option>
                  {colorOptions.map((color) => (
                    <option key={color.code} value={color.code}>
                      {color.code} · {color.name}
                    </option>
                  ))}
                </select>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200">
                  {isUploading ? "Uploading..." : "Upload Asset"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
                    disabled={isUploading}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleUpload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {imageMedia.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={item.alt_text ?? ""} className="h-full w-full object-cover" />
                    {item.is_primary && (
                      <span className="absolute left-3 top-3 rounded-full bg-success-500 px-2.5 py-1 text-xs font-medium text-white">
                        Primary
                      </span>
                    )}
                    {item.color_code && (
                      <span className="absolute right-3 top-3 rounded-full bg-gray-900/80 px-2.5 py-1 text-xs font-medium text-white">
                        {item.color_code}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <input aria-label={`Alt text for ${item.title || item.id}`} defaultValue={item.alt_text ?? ""} className={fieldClass} placeholder="Alt text" onBlur={(event) => { if (event.target.value !== (item.alt_text ?? "")) void handleUpdateMedia(item, { alt_text: event.target.value, title: item.title, sort_order: item.sort_order }); }} />
                    <input aria-label={`Sort order for ${item.title || item.id}`} type="number" defaultValue={item.sort_order} className={`${fieldClass} mt-2`} onBlur={(event) => { const value = Number(event.target.value); if (value !== item.sort_order) void handleUpdateMedia(item, { alt_text: item.alt_text, title: item.title, sort_order: value }); }} />
                    <p className="mt-2 truncate text-sm font-medium text-gray-800 dark:text-white/90">{item.title || "Product image"}</p>
                    <div className="mt-3 flex gap-2">
                      {!item.is_primary && (
                        <button
                          type="button"
                          disabled={mediaActionId === item.id}
                          onClick={() => void handleSetPrimary(item)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                        >
                          Set primary
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={mediaActionId === item.id}
                        onClick={() => void handleDeleteMedia(item)}
                        className="rounded-lg border border-error-200 px-3 py-2 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/30 dark:hover:bg-error-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {imageMedia.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400 md:col-span-2 2xl:col-span-3">
                  No product images uploaded yet.
                </div>
              )}
            </div>

            {documentMedia.length > 0 && (
              <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">Documents</h4>
                <div className="mt-3 space-y-2">
                  {documentMedia.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800"
                    >
                      <div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {item.title || "Product document"}
                        </a>
                        {item.color_code && <p className="mt-1 text-xs text-gray-400">Variant: {item.color_code}</p>}
                      </div>
                      <button
                        type="button"
                        disabled={mediaActionId === item.id}
                        onClick={() => void handleDeleteMedia(item)}
                        className="rounded-lg border border-error-200 px-3 py-2 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/30 dark:hover:bg-error-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {videoMedia.length > 0 && (
              <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">Video</h4>
                <div className="mt-3 space-y-2">
                  {videoMedia.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-600 hover:underline">{item.title || "Product video"}</a>
                      <button type="button" disabled={mediaActionId === item.id} onClick={() => void handleDeleteMedia(item)} className="rounded-lg border border-error-200 px-3 py-2 text-xs font-medium text-error-600">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Publishing</h3>
            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={content.is_published}
                  onChange={(event) => patchContent("is_published", event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800 dark:text-white/90">Published</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    Makes this product available to the public Store RPC and sitemap.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={content.is_featured}
                  onChange={(event) => patchContent("is_featured", event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800 dark:text-white/90">Featured</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    Prioritizes this product in public catalog ordering.
                  </span>
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort order</span>
                <input
                  type="number"
                  value={content.sort_order}
                  onChange={(event) => patchContent("sort_order", Number(event.target.value) || 0)}
                  className={fieldClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Master Variants</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Read-only data from the operational product master. Pricing is intentionally excluded.
            </p>
            <div className="mt-4 space-y-2">
              {variants.map((variant) => (
                <div key={variant.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {variant.color_name || variant.color_code || "Variant"}
                    </span>
                    {variant.color_code && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                        {variant.color_code}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{variant.sku}</p>
                </div>
              ))}
              {variants.length === 0 && <p className="text-sm text-gray-400">No active variants found.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Publish checklist</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className={content.short_description?.trim() || content.description?.trim() ? "text-success-600" : "text-warning-600"}>
                {content.short_description?.trim() || content.description?.trim() ? "✓" : "○"} Marketing copy
              </li>
              <li className={primaryImage?.alt_text?.trim() ? "text-success-600" : "text-warning-600"}>
                {primaryImage?.alt_text?.trim() ? "✓" : "○"} Primary image with alt text
              </li>
              <li className={variants.length > 0 ? "text-success-600" : "text-warning-600"}>
                {variants.length > 0 ? "✓" : "○"} Active product variant
              </li>
              <li className={content.slug && SLUG_PATTERN.test(content.slug) ? "text-success-600" : "text-warning-600"}>
                {content.slug && SLUG_PATTERN.test(content.slug) ? "✓" : "○"} Valid public slug
              </li>
              <li className="text-gray-500 dark:text-gray-400">Published slugs are immutable; unpublish before changing.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
