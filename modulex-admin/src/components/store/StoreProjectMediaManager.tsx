"use client";

import { useCallback, useEffect, useState } from "react";
import StoreProjectMediaAssetPicker, { type StoreProjectEligibleMediaAsset } from "@/components/store/StoreProjectMediaAssetPicker";
import { supabase } from "@/lib/supabase/client";
import { isHttpUrl, type StoreProjectMedia } from "@/lib/store/secondaryCms";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const dangerButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-medium text-error-700 disabled:opacity-50 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

export default function StoreProjectMediaManager({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [media, setMedia] = useState<StoreProjectMedia[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<StoreProjectEligibleMediaAsset | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [imageSort, setImageSort] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoAlt, setVideoAlt] = useState("");
  const [videoSort, setVideoSort] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("store_project_media")
      .select("id,project_id,media_type,media_url,media_asset_id,alt_text,sort_order,updated_at")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (loadError) setError(loadError.message);
    else setMedia((data ?? []) as StoreProjectMedia[]);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function currentUserId() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error(userError?.message ?? "Unable to verify current user.");
    return user.id;
  }

  function chooseImage(asset: StoreProjectEligibleMediaAsset) {
    setSelectedAsset(asset);
    setImageAlt(asset.default_alt_text ?? "");
    setError(null);
    setSuccess(null);
  }

  async function addImage() {
    if (!canEdit || !selectedAsset) return setError("Choose a Media Library image first.");
    if (!imageAlt.trim()) return setError("Image alt text is required.");

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const userId = await currentUserId();
      const { error: insertError } = await supabase.from("store_project_media").insert({
        project_id: projectId,
        media_type: "image",
        media_asset_id: selectedAsset.id,
        media_url: selectedAsset.publicUrl,
        alt_text: imageAlt.trim(),
        sort_order: Number.isFinite(imageSort) ? imageSort : 0,
        updated_by: userId,
      });
      if (insertError) throw insertError;
      setSelectedAsset(null);
      setImageAlt("");
      setImageSort(0);
      setSuccess("Media Library image linked to project.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to link project image.");
    }
    setBusy(false);
  }

  async function addVideo() {
    if (!canEdit) return;
    if (!isHttpUrl(videoUrl.trim())) return setError("Video URL must be a public http(s) URL.");
    if (!videoAlt.trim()) return setError("Video alt text is required.");
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const userId = await currentUserId();
      const { error: insertError } = await supabase.from("store_project_media").insert({
        project_id: projectId,
        media_type: "video",
        media_asset_id: null,
        media_url: videoUrl.trim(),
        alt_text: videoAlt.trim(),
        sort_order: Number.isFinite(videoSort) ? videoSort : 0,
        updated_by: userId,
      });
      if (insertError) throw insertError;
      setVideoUrl("");
      setVideoAlt("");
      setVideoSort(0);
      setSuccess("Project video added.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add project video.");
    }
    setBusy(false);
  }

  async function deleteMedia(item: StoreProjectMedia) {
    if (!canEdit || !window.confirm(`Delete this ${item.media_type}?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const { error: deleteError } = await supabase.from("store_project_media").delete().eq("id", item.id);
    if (deleteError) setError(deleteError.message);
    else {
      setMedia((current) => current.filter((entry) => entry.id !== item.id));
      setSuccess("Project media removed.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Project media</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Images must be linked from reviewed Media Library assets. External public video URLs remain supported.</p>

      {error ? <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{success}</p> : null}

      <div className="mt-5 space-y-4">
        <StoreProjectMediaAssetPicker selectedAssetId={selectedAsset?.id ?? null} onSelect={chooseImage} disabled={!canEdit || busy} label="Add project image from Media Library" />
        {selectedAsset ? (
          <div className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Image alt text</span>
              <input className={inputClass} value={imageAlt} disabled={!canEdit || busy} onChange={(event) => setImageAlt(event.target.value)} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort order</span>
              <input className={inputClass} type="number" value={imageSort} disabled={!canEdit || busy} onChange={(event) => setImageSort(Number(event.target.value) || 0)} />
            </label>
            <button type="button" className={primaryButton} disabled={!canEdit || busy} onClick={() => void addImage()}>Link image</button>
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Add external video</h3>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_140px_auto] lg:items-end">
          <input className={inputClass} value={videoUrl} disabled={!canEdit || busy} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://..." />
          <input className={inputClass} value={videoAlt} disabled={!canEdit || busy} onChange={(event) => setVideoAlt(event.target.value)} placeholder="Video description / alt text" />
          <input className={inputClass} type="number" value={videoSort} disabled={!canEdit || busy} onChange={(event) => setVideoSort(Number(event.target.value) || 0)} placeholder="Sort" />
          <button type="button" className={primaryButton} disabled={!canEdit || busy} onClick={() => void addVideo()}>Add video</button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {media.length === 0 ? <p className="text-sm text-gray-500">No project media yet.</p> : null}
        {media.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">{item.media_type === "image" ? "Image" : "Video"} · sort {item.sort_order}</p>
              {item.media_type === "image" && !item.media_asset_id ? (
                <p className="mt-1 text-xs font-medium text-warning-600">Legacy image — relink from Media Library before publish.</p>
              ) : null}
              <p className="mt-1 truncate text-xs text-gray-500">{item.media_url}</p>
              {item.media_asset_id ? <p className="mt-1 text-xs text-gray-500">Media asset: {item.media_asset_id}</p> : null}
              <p className="mt-1 text-xs text-gray-500">{item.alt_text}</p>
            </div>
            {canEdit ? <button type="button" className={dangerButton} disabled={busy} onClick={() => void deleteMedia(item)}>Delete</button> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
