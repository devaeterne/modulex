"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import FileInput from "@/components/form/input/FileInput";
import { ADMIN_BRANDING_STYLES } from "@/components/ui/theme/adminTheme";
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
    return <section className={`p-6 text-sm ${ADMIN_BRANDING_STYLES.loading}`}>Loading document branding...</section>;
  }

  return (
    <section className={`p-5 sm:p-6 ${ADMIN_BRANDING_STYLES.card}`}>
      <div>
        <h2 className={`text-lg font-semibold ${ADMIN_BRANDING_STYLES.heading}`}>Document Branding</h2>
        <p className={`mt-1 max-w-3xl text-sm ${ADMIN_BRANDING_STYLES.muted}`}>Configure the primary company and secondary brand marks once. Order and Invoice share the same A4 identity. Printed documents and direct PDF downloads always use the <strong>on light</strong> variants because the paper surface is white.</p>
      </div>

      {error ? <div className={`mt-4 px-4 py-3 text-sm ${ADMIN_BRANDING_STYLES.error}`}>{error}</div> : null}
      {success ? <div className={`mt-4 px-4 py-3 text-sm ${ADMIN_BRANDING_STYLES.success}`}>{success}</div> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {slots.map((slot) => {
          const url = previewUrl(settings, slot);
          const isDark = slot.context === "on dark";
          const busy = busyField === slot.field;
          const legacyFallback = slot.field === "primary_logo_on_light_url" && !settings.primary_logo_on_light_url && Boolean(settings.logo_url);
          const previewClass = `flex min-h-36 items-center justify-center p-6 ${isDark ? ADMIN_BRANDING_STYLES.previewDark : ADMIN_BRANDING_STYLES.previewLight}`;
          const emptyClass = `text-sm ${isDark ? ADMIN_BRANDING_STYLES.emptyDark : ADMIN_BRANDING_STYLES.emptyLight}`;
          return (
            <article key={slot.field} className={`overflow-hidden ${ADMIN_BRANDING_STYLES.slot}`}>
              <div className={previewClass}>
                {url ? <img src={url} alt={`${slot.title} ${slot.context}`} className="max-h-20 max-w-[260px] object-contain" /> : <span className={emptyClass}>No logo configured</span>}
              </div>
              <div className={`border-t p-4 ${ADMIN_BRANDING_STYLES.slotBody}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-sm font-semibold ${ADMIN_BRANDING_STYLES.slotTitle}`}>{slot.title}</h3>
                  <span className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ADMIN_BRANDING_STYLES.contextBadge}`}>{slot.context}</span>
                  {slot.primary ? <span className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ADMIN_BRANDING_STYLES.primaryBadge}`}>Primary</span> : <span className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ADMIN_BRANDING_STYLES.secondaryBadge}`}>Secondary</span>}
                  {legacyFallback ? <span className={`px-2 py-0.5 text-xs font-semibold ${ADMIN_BRANDING_STYLES.legacyBadge}`}>Legacy fallback</span> : null}
                </div>
                <p className={`mt-1 text-xs leading-5 ${ADMIN_BRANDING_STYLES.description}`}>{slot.description}</p>
                <div className="mt-4 space-y-3">
                  <FileInput accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canEdit || Boolean(busyField)} onChange={(event) => void upload(slot, event.target.files?.[0])} aria-label={`Upload ${slot.title} ${slot.context}`} />
                  {canEdit && settings[slot.field] ? <Button size="sm" variant="outline" disabled={Boolean(busyField)} onClick={() => void remove(slot)}>{busy ? "Working..." : "Remove"}</Button> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!canEdit ? <p className={`mt-4 text-xs ${ADMIN_BRANDING_STYLES.readonly}`}>You have read-only access. Admin or Super Admin permission is required to change document branding.</p> : null}
    </section>
  );
}
