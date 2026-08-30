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
  updated_at: string;
};

type ProductVariant = {
  id: string;
  base_product_code: string | null;
  sku: string;
  color_code: string | null;
  color_name: string | null;
  category_name: { name: string }[] | null;
  brand_name: { name: string }[] | null;
};

type PrimaryMedia = {
  product_content_id: string;
  url: string;
};

type PublicationFilter = "all" | "published" | "draft";
type ReadinessFilter = "all" | "ready" | "incomplete";

type ProductRow = StoreContent & {
  variants: ProductVariant[];
  primaryImageUrl: string | null;
  category: string | null;
  brand: string | null;
  hasCopy: boolean;
  isReady: boolean;
};

const inputClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300";

function publicationBadge(published: boolean) {
  return published
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
    : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
}

function readinessBadge(ready: boolean) {
  return ready
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
    : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
}

export default function StoreProductsTable() {
  const [content, setContent] = useState<StoreContent[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [primaryMedia, setPrimaryMedia] = useState<PrimaryMedia[]>([]);
  const [query, setQuery] = useState("");
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data: contentRows, error: contentError } = await supabase
      .from("store_product_content")
      .select(
        "id,base_product_code,slug,display_name,short_description,description,is_published,is_featured,sort_order,updated_at"
      )
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true });

    if (contentError) {
      setErrorMessage(contentError.message);
      setContent([]);
      setVariants([]);
      setPrimaryMedia([]);
      setIsLoading(false);
      return;
    }

    const nextContent = (contentRows ?? []) as StoreContent[];
    const baseCodes = nextContent.map((item) => item.base_product_code);
    const contentIds = nextContent.map((item) => item.id);

    let variantRows: ProductVariant[] = [];
    let mediaRows: PrimaryMedia[] = [];

    if (baseCodes.length > 0) {
      const { data, error } = await supabase
        .from("products")
        .select("id,base_product_code,sku,color_code,color_name,brand_name:product_brands(name),category_name:product_categories(name)")
        .in("base_product_code", baseCodes)
        .eq("status", "active")
        .order("sku", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      variantRows = (data ?? []) as ProductVariant[];
    }

    if (contentIds.length > 0) {
      const { data, error } = await supabase
        .from("store_product_media")
        .select("product_content_id,url")
        .in("product_content_id", contentIds)
        .eq("media_type", "image")
        .eq("is_primary", true);

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      mediaRows = (data ?? []) as PrimaryMedia[];
    }

    setContent(nextContent);
    setVariants(variantRows);
    setPrimaryMedia(mediaRows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const rows = useMemo<ProductRow[]>(() => {
    const variantsByCode = new Map<string, ProductVariant[]>();
    const mediaByContent = new Map<string, string>();

    for (const variant of variants) {
      if (!variant.base_product_code) continue;
      const current = variantsByCode.get(variant.base_product_code) ?? [];
      current.push(variant);
      variantsByCode.set(variant.base_product_code, current);
    }

    for (const media of primaryMedia) {
      mediaByContent.set(media.product_content_id, media.url);
    }

    return content.map((item) => {
      const itemVariants = variantsByCode.get(item.base_product_code) ?? [];
      const firstVariant = itemVariants[0];
      const primaryImageUrl = mediaByContent.get(item.id) ?? null;
      const hasCopy = Boolean(item.short_description?.trim() || item.description?.trim());

      return {
        ...item,
        variants: itemVariants,
        primaryImageUrl,
        category: firstVariant?.category_name?.[0]?.name ?? null,
        brand: firstVariant?.brand_name?.[0]?.name ?? null,
        hasCopy,
        isReady: hasCopy && Boolean(primaryImageUrl),
      };
    });
  }, [content, variants, primaryMedia]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (publicationFilter === "published" && !row.is_published) return false;
      if (publicationFilter === "draft" && row.is_published) return false;
      if (readinessFilter === "ready" && !row.isReady) return false;
      if (readinessFilter === "incomplete" && row.isReady) return false;

      if (!normalizedQuery) return true;

      const searchable = [
        row.display_name,
        row.base_product_code,
        row.category,
        row.brand,
        ...row.variants.flatMap((variant) => [variant.sku, variant.color_code, variant.color_name]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [rows, query, publicationFilter, readinessFilter]);

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.is_published) acc.published += 1;
        else acc.draft += 1;
        if (row.isReady) acc.ready += 1;
        else acc.incomplete += 1;
        return acc;
      },
      { total: 0, published: 0, draft: 0, ready: 0, incomplete: 0 }
    );
  }, [rows]);

  async function togglePublished(row: ProductRow) {
    const nextPublished = !row.is_published;

    if (nextPublished && !row.isReady) {
      setErrorMessage(
        `${row.display_name} cannot be published until it has marketing copy and a primary image.`
      );
      return;
    }

    if (!window.confirm(`${nextPublished ? "Publish" : "Unpublish"} ${row.display_name}?`)) {
      return;
    }

    setActionId(row.id);
    setErrorMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage(userError?.message ?? "Unable to verify the current user.");
      setActionId(null);
      return;
    }

    const { error } = await supabase
      .from("store_product_content")
      .update({ is_published: nextPublished, updated_by: user.id })
      .eq("id", row.id);

    if (error) {
      setErrorMessage(error.message);
      setActionId(null);
      return;
    }

    await loadData();
    setActionId(null);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total", counts.total],
          ["Published", counts.published],
          ["Draft", counts.draft],
          ["Ready", counts.ready],
          ["Incomplete", counts.incomplete],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Store Product Content</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Public presentation content is managed separately from inventory products and pricing.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, SKU, name..."
              className={`${inputClass} min-w-[240px]`}
            />
            <select
              value={publicationFilter}
              onChange={(event) => setPublicationFilter(event.target.value as PublicationFilter)}
              className={inputClass}
            >
              <option value="all">All publication states</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <select
              value={readinessFilter}
              onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)}
              className={inputClass}
            >
              <option value="all">All readiness states</option>
              <option value="ready">Ready to publish</option>
              <option value="incomplete">Incomplete</option>
            </select>
          </div>
        </div>

        {errorMessage && (
          <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {[
                  "Product",
                  "Category",
                  "Variants",
                  "Content",
                  "Publication",
                  "Featured",
                  "Actions",
                ].map((label) => (
                  <th
                    key={label}
                    className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading Store products...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    No Store products match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const colorCodes = Array.from(
                    new Set(row.variants.map((variant) => variant.color_code).filter(Boolean))
                  );
                  const isActionLoading = actionId === row.id;

                  return (
                    <tr key={row.id} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                      <td className="px-5 py-4">
                        <div className="flex min-w-[260px] items-center gap-3">
                          <div className="h-14 w-14 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                            {row.primaryImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.primaryImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                                No image
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white/90">{row.display_name}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {row.base_product_code} · /{row.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <div>{row.category ?? "—"}</div>
                        {row.brand && <div className="mt-1 text-xs text-gray-400">{row.brand}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[160px] flex-wrap gap-1.5">
                          {colorCodes.length > 0 ? (
                            colorCodes.map((code) => (
                              <span
                                key={code}
                                className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300"
                              >
                                {code}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">No variants</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{row.variants.length} SKU</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${readinessBadge(row.isReady)}`}
                        >
                          {row.isReady ? "Ready" : "Incomplete"}
                        </span>
                        {!row.hasCopy && <p className="mt-1 text-xs text-gray-400">Missing copy</p>}
                        {!row.primaryImageUrl && <p className="mt-1 text-xs text-gray-400">Missing primary image</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${publicationBadge(row.is_published)}`}
                        >
                          {row.is_published ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {row.is_featured ? "Yes" : "No"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[170px] items-center justify-end gap-2">
                          <Link
                            href={`/store/products/${row.id}/edit`}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void togglePublished(row)}
                            className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isActionLoading
                              ? "Saving..."
                              : row.is_published
                                ? "Unpublish"
                                : "Publish"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Showing {filteredRows.length} of {rows.length} Store products.
        </div>
      </div>
    </div>
  );
}
