"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StoreMediaAssetEditor from "@/components/store/StoreMediaAssetEditor";
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  CONTROLLED_STORE_MEDIA_CANDIDATES,
  importStoreMediaCandidate,
  type ControlledStoreMediaCandidateId,
} from "@/lib/store/mediaApi";
import {
  formatMediaBytes,
  formatMediaDimensions,
  type StoreMediaAsset,
  type StoreMediaAssetSource,
  type StoreMediaAttribution,
  type StoreMediaCabinetRelevance,
  type StoreMediaStatus,
} from "@/lib/store/mediaLibrary";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const assetSelect =
  "id,status,title,default_alt_text,caption,media_type,original_filename,original_mime_type,original_width,original_height,original_bytes,original_sha256,optimized_mime_type,optimized_width,optimized_height,optimized_bytes,optimized_sha256,staging_bucket,staging_original_path,staging_optimized_path,public_bucket,public_path,attribution_classification,cabinet_relevance,review_notes,published_at,created_at,updated_at,created_by,updated_by";
const sourceSelect =
  "id,media_asset_id,source_site,source_brand,source_candidate_id,source_url,source_page_url,source_page_id,source_label,migration_disposition,attribution_required,notes,discovered_at,created_at";

type StatusFilter = "all" | StoreMediaStatus;
type AttributionFilter = "all" | StoreMediaAttribution;
type RelevanceFilter = "all" | StoreMediaCabinetRelevance;

export default function StoreMediaLibraryManager() {
  const [assets, setAssets] = useState<StoreMediaAsset[]>([]);
  const [sources, setSources] = useState<StoreMediaAssetSource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attributionFilter, setAttributionFilter] = useState<AttributionFilter>("all");
  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilter>("all");
  const [canEdit, setCanEdit] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [candidateId, setCandidateId] = useState<ControlledStoreMediaCandidateId>("media-kitchen-01");
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createPreviewUrl = useCallback(async (asset: StoreMediaAsset) => {
    if (asset.status === "published" && asset.public_bucket && asset.public_path) {
      return supabase.storage.from(asset.public_bucket).getPublicUrl(asset.public_path).data.publicUrl;
    }
    if (asset.staging_bucket === "store-media-staging" && asset.staging_optimized_path) {
      const { data, error: signedError } = await supabase.storage.from(asset.staging_bucket).createSignedUrl(asset.staging_optimized_path, 300);
      if (signedError) return null;
      return data.signedUrl;
    }
    return null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }
    setCanEdit(hasPermission(profile?.roles, "store.manage"));

    const [assetResult, sourceResult] = await Promise.all([
      supabase.from("store_media_assets").select(assetSelect).order("updated_at", { ascending: false }).order("id", { ascending: true }),
      supabase.from("store_media_asset_sources").select(sourceSelect).order("created_at", { ascending: true }).order("id", { ascending: true }),
    ]);
    if (assetResult.error) setError(assetResult.error.message);
    else if (sourceResult.error) setError(sourceResult.error.message);
    else {
      const nextAssets = (assetResult.data ?? []) as StoreMediaAsset[];
      setAssets(nextAssets);
      setSources((sourceResult.data ?? []) as StoreMediaAssetSource[]);
      setSelectedId((current) => current && nextAssets.some((asset) => asset.id === current) ? current : nextAssets[0]?.id ?? null);
      const previewEntries = await Promise.all(nextAssets.map(async (asset) => [asset.id, await createPreviewUrl(asset)] as const));
      setPreviewUrls(Object.fromEntries(previewEntries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    }
    setLoading(false);
  }, [createPreviewUrl]);

  useEffect(() => { void load(); }, [load]);

  const sourcesByAsset = useMemo(() => {
    const map = new Map<string, StoreMediaAssetSource[]>();
    for (const source of sources) {
      const rows = map.get(source.media_asset_id) ?? [];
      rows.push(source);
      map.set(source.media_asset_id, rows);
    }
    return map;
  }, [sources]);

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (attributionFilter !== "all" && asset.attribution_classification !== attributionFilter) return false;
      if (relevanceFilter !== "all" && asset.cabinet_relevance !== relevanceFilter) return false;
      if (!needle) return true;
      const provenance = sourcesByAsset.get(asset.id) ?? [];
      return [asset.title, asset.original_filename ?? "", ...provenance.flatMap((source) => [source.source_candidate_id ?? "", source.source_label ?? "", source.source_brand ?? "", source.source_url, source.source_page_url ?? ""])].join(" ").toLowerCase().includes(needle);
    });
  }, [assets, sourcesByAsset, query, statusFilter, attributionFilter, relevanceFilter]);

  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  const selectedSources = selected ? sourcesByAsset.get(selected.id) ?? [] : [];
  const selectedPreviewUrl = selected ? previewUrls[selected.id] ?? null : null;

  async function handleControlledImport() {
    setImporting(true);
    setError(null);
    setIntakeMessage(null);
    try {
      const result = await importStoreMediaCandidate(candidateId);
      setIntakeMessage(
        result.status === "created"
          ? `${result.candidateId} imported to private staging for review. Nothing was published.`
          : `${result.candidateId} already exists. Existing staged asset was reused; nothing was published.`,
      );
      await load();
      setSelectedId(result.assetId);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Controlled media intake failed.");
    } finally {
      setImporting(false);
    }
  }

  function handleSaved(saved: StoreMediaAsset) {
    setAssets((current) => current.map((asset) => (asset.id === saved.id ? saved : asset)));
    void createPreviewUrl(saved).then((previewUrl) => {
      setPreviewUrls((current) => {
        const next = { ...current };
        if (previewUrl) next[saved.id] = previewUrl;
        else delete next[saved.id];
        return next;
      });
    });
  }

  function handleDeleted(assetId: string) {
    const nextAssets = assets.filter((asset) => asset.id !== assetId);
    setAssets(nextAssets);
    setSources((current) => current.filter((source) => source.media_asset_id !== assetId));
    setPreviewUrls((current) => { const next = { ...current }; delete next[assetId]; return next; });
    setSelectedId((current) => (current === assetId ? nextAssets[0]?.id ?? null : current));
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading Store media library...</div>;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Media Library</h1>
              <p className="mt-1 text-sm text-gray-500">Review staged assets and control publication without exposing Granite source URLs as runtime media.</p>
            </div>
            <button type="button" onClick={() => void load()} className="text-sm font-medium text-brand-600 hover:text-brand-700">Refresh</button>
          </div>

          {canEdit ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
              <p className="text-xs text-gray-500">Controlled Granite intake downloads only checked-in allow-listed candidates on the server and writes only to private staging. It never publishes automatically.</p>
              <div className="mt-3 flex flex-col gap-2">
                <select className={inputClass} value={candidateId} disabled={importing} onChange={(event) => setCandidateId(event.target.value as ControlledStoreMediaCandidateId)}>
                  {CONTROLLED_STORE_MEDIA_CANDIDATES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.id}</option>)}
                </select>
                <button type="button" onClick={() => void handleControlledImport()} disabled={importing} className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
                  {importing ? "Importing..." : "Import controlled candidate"}
                </button>
              </div>
            </div>
          ) : null}

          {intakeMessage ? <p className="mt-3 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{intakeMessage}</p> : null}
          {error ? <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
          <div className="mt-4 space-y-3">
            <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, candidate or source" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">All status</option><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option><option value="published">Published</option><option value="rejected">Rejected</option>
              </select>
              <select className={inputClass} value={attributionFilter} onChange={(event) => setAttributionFilter(event.target.value as AttributionFilter)}>
                <option value="all">All attribution</option><option value="oakwell_owned">Oakwell owned</option><option value="parent_attributed">Parent attributed</option><option value="unverified_hold">Unverified hold</option>
              </select>
              <select className={inputClass} value={relevanceFilter} onChange={(event) => setRelevanceFilter(event.target.value as RelevanceFilter)}>
                <option value="all">All relevance</option><option value="unreviewed">Unreviewed</option><option value="relevant">Relevant</option><option value="mixed">Mixed</option><option value="irrelevant">Irrelevant</option>
              </select>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          {filteredAssets.length === 0 ? <p className="p-5 text-sm text-gray-500">No media assets match the current filters.</p> : null}
          {filteredAssets.map((asset) => {
            const provenance = sourcesByAsset.get(asset.id) ?? [];
            const summary = provenance[0]?.source_candidate_id ?? provenance[0]?.source_label ?? provenance[0]?.source_brand ?? provenance[0]?.source_site ?? "No provenance";
            const previewUrl = previewUrls[asset.id];
            return (
              <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className={`block w-full border-b border-gray-100 p-4 text-left last:border-b-0 dark:border-gray-800 ${selectedId === asset.id ? "bg-brand-50/60 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"}`}>
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
                    {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{asset.title}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{asset.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{summary}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatMediaDimensions(asset.optimized_width ?? asset.original_width, asset.optimized_height ?? asset.original_height)} · {formatMediaBytes(asset.optimized_bytes ?? asset.original_bytes)}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">{asset.attribution_classification} · {asset.cabinet_relevance}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      </aside>

      <main className="min-w-0">
        {selected ? (
          <StoreMediaAssetEditor asset={selected} sources={selectedSources} canEdit={canEdit} publicPreviewUrl={selectedPreviewUrl} onSaved={handleSaved} onDeleted={handleDeleted} />
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Select a media asset to review it.</div>
        )}
      </main>
    </div>
  );
}
