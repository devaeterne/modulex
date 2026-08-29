"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  buildStoreMediaPath,
  isHttpUrl,
  type StoreProjectMedia,
  validateImageFile,
} from "@/lib/store/secondaryCms";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const dangerButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-medium text-error-700 disabled:opacity-50 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

export default function StoreProjectMediaManager({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const [media, setMedia] = useState<StoreProjectMedia[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
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
      .select("id,project_id,media_type,media_url,alt_text,sort_order,updated_at")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (loadError) setError(loadError.message);
    else setMedia((data ?? []) as StoreProjectMedia[]);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function currentUserId() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error(userError?.message ?? "Unable to verify current user.");
    return user.id;
  }

  async function addImage() {
    if (!canEdit || !imageFile) return setError("Choose an image first.");
    if (!imageAlt.trim()) return setError("Image alt text is required.");
    const validationError = validateImageFile(imageFile);
    if (validationError) return setError(validationError);

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const userId = await currentUserId();
      const path = buildStoreMediaPath(`project-media-${projectId}`, "image", imageFile.name);
      const { error: uploadError } = await supabase.storage
        .from("store-media")
        .upload(path, imageFile, { cacheControl: "3600", contentType: imageFile.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("store-media").getPublicUrl(path);
      const { error: insertError } = await supabase.from("store_project_media").insert({
        project_id: projectId,
        media_type: "image",
        media_url: publicUrl.publicUrl,
        alt_text: imageAlt.trim(),
        sort_order: Number.isFinite(imageSort) ? imageSort : 0,
        updated_by: userId,
      });
      if (insertError) {
        await supabase.storage.from("store-media").remove([path]);
        throw insertError;
      }

      setImageFile(null);
      setImageAlt("");
      setImageSort(0);
      setSuccess("Project image added.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add project image.");
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
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Upload public images or reference external public video URLs. Alt text is required for every media item.</p>

      {error ? <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{success}</p> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Add image</h3>
          <div className="mt-4 space-y-3">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!canEdit || busy} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-gray-600" />
            <input className={inputClass} value={imageAlt} disabled={!canEdit || busy} onChange={(event) => setImageAlt(event.target.value)} placeholder="Alt text" />
            <input className={inputClass} type="number" value={imageSort} disabled={!canEdit || busy} onChange={(event) => setImageSort(Number(event.target.value) || 0)} placeholder="Sort order" />
            <button type="button" className={primaryButton} disabled={!canEdit || busy} onClick={() => void addImage()}>Add image</button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Add external video</h3>
          <div className="mt-4 space-y-3">
            <input className={inputClass} value={videoUrl} disabled={!canEdit || busy} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://..." />
            <input className={inputClass} value={videoAlt} disabled={!canEdit || busy} onChange={(event) => setVideoAlt(event.target.value)} placeholder="Video description / alt text" />
            <input className={inputClass} type="number" value={videoSort} disabled={!canEdit || busy} onChange={(event) => setVideoSort(Number(event.target.value) || 0)} placeholder="Sort order" />
            <button type="button" className={primaryButton} disabled={!canEdit || busy} onClick={() => void addVideo()}>Add video</button>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {media.length === 0 ? <p className="text-sm text-gray-500">No project media yet.</p> : null}
        {media.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">{item.media_type === "image" ? "Image" : "Video"} · sort {item.sort_order}</p>
              <p className="mt-1 truncate text-xs text-gray-500">{item.media_url}</p>
              <p className="mt-1 text-xs text-gray-500">{item.alt_text}</p>
            </div>
            {canEdit ? <button type="button" className={dangerButton} disabled={busy} onClick={() => void deleteMedia(item)}>Delete</button> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
