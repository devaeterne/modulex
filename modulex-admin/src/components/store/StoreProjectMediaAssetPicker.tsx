"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isProjectEligibleMediaAsset,
  type StoreMediaAsset,
  type StoreMediaAssetSource,
} from "@/lib/store/mediaLibrary";
import { supabase } from "@/lib/supabase/client";

export type StoreProjectEligibleMediaAsset = StoreMediaAsset & {
  publicUrl: string;
  sources: StoreMediaAssetSource[];
};

type StoreProjectMediaAssetPickerProps = {
  selectedAssetId: string | null;
  onSelect: (asset: StoreProjectEligibleMediaAsset) => void;
  disabled?: boolean;
  label?: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const ASSET_SELECT = "id,status,title,default_alt_text,caption,media_type,original_filename,original_mime_type,original_width,original_height,original_bytes,original_sha256,optimized_mime_type,optimized_width,optimized_height,optimized_bytes,optimized_sha256,staging_bucket,staging_original_path,staging_optimized_path,public_bucket,public_path,attribution_classification,cabinet_relevance,review_notes,published_at,created_at,updated_at,created_by,updated_by";

export default function StoreProjectMediaAssetPicker({
  selectedAssetId,
  onSelect,
  disabled = false,
  label = "Select from Media Library",
}: StoreProjectMediaAssetPickerProps) {
  const [assets, setAssets] = useState<StoreProjectEligibleMediaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: assetRows, error: assetError } = await supabase
      .from("store_media_assets")
      .select(ASSET_SELECT)
      .eq("status", "published")
      .eq("cabinet_relevance", "relevant")
      .order("updated_at", { ascending: false });

    if (assetError) {
      setError(assetError.message);
      setLoading(false);
      return;
    }

    const eligibleAssets = ((assetRows ?? []) as StoreMediaAsset[]).filter(isProjectEligibleMediaAsset);
    const ids = eligibleAssets.map((asset) => asset.id);
    let sourceRows: StoreMediaAssetSource[] = [];

    if (ids.length > 0) {
      const { data: sourceData, error: sourceError } = await supabase
        .from("store_media_asset_sources")
        .select("id,media_asset_id,source_site,source_brand,source_candidate_id,source_url,source_page_url,source_page_id,source_label,migration_disposition,attribution_required,notes,discovered_at,created_at")
        .in("media_asset_id", ids)
        .order("created_at", { ascending: true });
      if (sourceError) {
        setError(sourceError.message);
        setLoading(false);
        return;
      }
      sourceRows = (sourceData ?? []) as StoreMediaAssetSource[];
    }

    setAssets(
      eligibleAssets.map((asset) => ({
        ...asset,
        publicUrl: supabase.storage.from(asset.public_bucket!).getPublicUrl(asset.public_path!).data.publicUrl,
        sources: sourceRows.filter((source) => source.media_asset_id === asset.id),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) => {
      const sourceText = asset.sources
        .flatMap((source) => [source.source_brand, source.source_candidate_id, source.source_label])
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return asset.title.toLowerCase().includes(needle) || sourceText.includes(needle);
    });
  }, [assets, query]);

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">{label}</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Only published, cabinet-relevant Media Library images are eligible for projects.
          </p>
        </div>
        <button type="button" className="text-xs font-medium text-brand-600 disabled:opacity-50" disabled={disabled || loading} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <input
        className={`${inputClass} mt-4`}
        value={query}
        disabled={disabled || loading}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search asset or provenance"
      />

      {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-gray-500">Loading eligible media...</p> : null}
      {!loading && filtered.length === 0 ? (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-800/60">
          No published, relevant Media Library image is currently eligible for project use.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {filtered.map((asset) => {
          const source = asset.sources[0];
          const selected = selectedAssetId === asset.id;
          return (
            <button
              key={asset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(asset)}
              className={`overflow-hidden rounded-xl border text-left transition disabled:opacity-50 ${
                selected
                  ? "border-brand-400 ring-2 ring-brand-100 dark:ring-brand-500/20"
                  : "border-gray-200 hover:border-brand-300 dark:border-gray-800"
              }`}
            >
              <img src={asset.publicUrl} alt={asset.default_alt_text ?? asset.title} className="h-36 w-full object-cover" />
              <div className="space-y-1 p-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{asset.title}</p>
                <p className="text-xs text-gray-500">{asset.default_alt_text}</p>
                <p className="text-xs text-gray-500">
                  {asset.attribution_classification} · {asset.cabinet_relevance}
                </p>
                {source ? (
                  <p className="text-xs text-gray-500">
                    Source: {source.source_brand ?? source.source_site}
                    {source.source_label ? ` · ${source.source_label}` : ""}
                    {source.source_candidate_id ? ` · ${source.source_candidate_id}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">No provenance row attached.</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
