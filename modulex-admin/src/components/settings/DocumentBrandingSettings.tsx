"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import FileInput from "@/components/form/input/FileInput";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";

type LogoField =
  | "primary_logo_on_light_url"
  | "primary_logo_on_dark_url"
  | "secondary_logo_on_light_url"
  | "secondary_logo_on_dark_url";

type LogoSlot = {
  field: LogoField;
  title: string;
  context: "on light" | "on dark";
  description: string;
  primary: boolean;
};

const slots: LogoSlot[] = [
  { field: "primary_logo_on_light_url", title: "Primary Logo", context: "on light", description: "Cabinet Center / main company mark used on white A4 documents.", primary: true },
  { field: "primary_logo_on_dark_url", title: "Primary Logo", context: "on dark", description: "Main company mark for dark UI surfaces and future branded dark layouts.", primary: true },
  { field: "secondary_logo_on_light_url", title: "Secondary Logo", context: "on light", description: "Oakwell / secondary brand mark shown on white A4 documents.", primary: false },
  { field: "secondary_logo_on_dark_url", title: "Secondary Logo", context: "on dark", description: "Secondary brand mark for dark UI surfaces and future branded dark layouts.", primary: false },
];

function previewUrl(settings: GeneralSettings, slot: LogoSlot) {
  if (settings[slot.field]) return settings[slot.field];
  if (slot.field === "primary_logo_on_light_url") return settings.logo_url;
  return null;
}

export default function DocumentBrandingSettings() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyField, setBusyField] = useState<LogoField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ profile, error: profileError }, settingsResult] = await Promise.all([
        getCurrentProfile(),
        supabase.from("general_settings").select("*").eq("id", 1).single(),
      ]);
      if (profileError) setError(profileError.message);
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      if (settingsResult.error) setError(settingsResult.error.message);
      else setSettings(settingsResult.data as GeneralSettings);
      setLoading(false);
    }
    void load();
  }, []);

  async function persist(field: LogoField, url: string | null) {
    const { data, error: updateError } = await supabase
      .from("general_settings")
      .update({ [field]: url })
      .eq("id", 1)
      .select("*")
      .single();
    if (updateError) throw updateError;
    setSettings(data as GeneralSettings);
  }

  async function upload(slot: LogoSlot, file?: File) {
    if (!file || !canEdit) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      setError("Logo must be PNG, JPG, WEBP or SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Logo file must be 5 MB or smaller.");
      return;
    }

    setBusyField(slot.field);
    setError(null);
    setSuccess(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const storagePath = `branding/documents/${slot.field}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("company-assets").upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("company-assets").getPublicUrl(storagePath);
      await persist(slot.field, data.publicUrl);
      setSuccess(`${slot.title} ${slot.context} updated.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Logo could not be uploaded.");
    } finally {
      setBusyField(null);
    }
  }

  async function remove(slot: LogoSlot) {
    if (!canEdit) return;
    setBusyField(slot.field);
    setError(null);
    setSuccess(null);
    try {
      await persist(slot.field, null);
      setSuccess(`${slot.title} ${slot.context} removed.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Logo could not be removed.");
    } finally {
      setBusyField(null);
    }
  }

  if (loading) {
    return <section className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">Loading document branding...</section>;
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Document Branding</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">Configure the primary company and secondary brand marks once. Order and Invoice share the same A4 identity. Printed documents and direct PDF downloads always use the <strong>on light</strong> variants because the paper surface is white.</p>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300">{success}</div> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {slots.map((slot) => {
          const url = previewUrl(settings, slot);
          const isDark = slot.context === "on dark";
          const busy = busyField === slot.field;
          const legacyFallback = slot.field === "primary_logo_on_light_url" && !settings.primary_logo_on_light_url && Boolean(settings.logo_url);
          return (
            <article key={slot.field} className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
              <div className={`flex min-h-36 items-center justify-center p-6 ${isDark ? "bg-gray-950" : "bg-white"}`}>
                {url ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={`${slot.title} ${slot.context}`} className="max-h-20 max-w-[260px] object-contain" /></> : <span className={isDark ? "text-sm text-gray-600" : "text-sm text-gray-400"}>No logo configured</span>}
              </div>
              <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/80">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{slot.title}</h3>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">{slot.context}</span>
                  {slot.primary ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">Primary</span> : <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">Secondary</span>}
                  {legacyFallback ? <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700 dark:bg-warning-500/10 dark:text-warning-300">Legacy fallback</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{slot.description}</p>
                <div className="mt-4 space-y-3">
                  <FileInput accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canEdit || Boolean(busyField)} onChange={(event) => void upload(slot, event.target.files?.[0])} aria-label={`Upload ${slot.title} ${slot.context}`} />
                  {canEdit && settings[slot.field] ? <Button size="sm" variant="outline" disabled={Boolean(busyField)} onClick={() => void remove(slot)}>{busy ? "Working..." : "Remove"}</Button> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!canEdit ? <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">You have read-only access. Admin or Super Admin permission is required to change document branding.</p> : null}
    </section>
  );
}
