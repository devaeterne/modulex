"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type MarketingSettings = {
  id: number;
  tracking_enabled: boolean;
  consent_banner_enabled: boolean;
  respect_do_not_track: boolean;
  google_tag_manager_id: string | null;
  google_analytics_measurement_id: string | null;
  consent_title: string;
  consent_description: string;
  accept_all_label: string;
  reject_optional_label: string;
  manage_choices_label: string;
  save_choices_label: string;
  privacy_policy_href: string | null;
  updated_at: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const textareaClass = `${inputClass} h-auto min-h-28 resize-y`;
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";

function clean(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validHref(value: string) {
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        className={inputClass}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
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
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</span>
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

const eventNames = [
  "page_view",
  "product_view",
  "search",
  "catalog_download",
  "contact_form_start",
  "contact_form_submit",
  "dealer_application_start",
  "dealer_application_submit",
  "contact_click",
  "phone_click",
  "email_click",
  "login",
  "portal_view",
];

export default function StoreMarketingSettings() {
  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    const { data, error: settingsError } = await supabase
      .from("store_marketing_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (settingsError) setError(settingsError.message);
    else setSettings(data as MarketingSettings);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends keyof MarketingSettings>(key: K, value: MarketingSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    setSuccess(null);
  }

  async function save() {
    if (!settings) return;

    const gtm = clean(settings.google_tag_manager_id)?.toUpperCase() ?? null;
    const ga4 = clean(settings.google_analytics_measurement_id)?.toUpperCase() ?? null;
    const privacyHref = clean(settings.privacy_policy_href);

    if (gtm && !/^GTM-[A-Z0-9]+$/.test(gtm)) return setError("Google Tag Manager ID must look like GTM-XXXXXXX.");
    if (ga4 && !/^G-[A-Z0-9]+$/.test(ga4)) return setError("GA4 Measurement ID must look like G-XXXXXXXXXX.");
    if (privacyHref && !validHref(privacyHref)) return setError("Privacy policy link must be a site path or http(s) URL.");
    if (settings.tracking_enabled && !settings.consent_banner_enabled) return setError("Consent banner must remain enabled while optional tracking is enabled.");
    if (settings.tracking_enabled && !gtm && !ga4) return setError("Add a GTM Container ID or GA4 Measurement ID before enabling tracking.");

    const requiredCopy = [
      settings.consent_title,
      settings.consent_description,
      settings.accept_all_label,
      settings.reject_optional_label,
      settings.manage_choices_label,
      settings.save_choices_label,
    ];
    if (requiredCopy.some((value) => !value.trim())) return setError("Consent copy and button labels cannot be empty.");

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
      tracking_enabled: settings.tracking_enabled,
      consent_banner_enabled: settings.consent_banner_enabled,
      respect_do_not_track: settings.respect_do_not_track,
      google_tag_manager_id: gtm,
      google_analytics_measurement_id: ga4,
      consent_title: settings.consent_title.trim(),
      consent_description: settings.consent_description.trim(),
      accept_all_label: settings.accept_all_label.trim(),
      reject_optional_label: settings.reject_optional_label.trim(),
      manage_choices_label: settings.manage_choices_label.trim(),
      save_choices_label: settings.save_choices_label.trim(),
      privacy_policy_href: privacyHref,
      updated_by: user.id,
    };

    const { data, error: saveError } = await supabase
      .from("store_marketing_settings")
      .update(payload)
      .eq("id", 1)
      .select("*")
      .single();

    if (saveError) setError(saveError.message);
    else {
      setSettings(data as MarketingSettings);
      setSuccess("Marketing & analytics settings saved. Public Store cache can take a few minutes to refresh.");
    }
    setSaving(false);
  }

  if (loading || !settings) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
        Loading marketing settings...
      </div>
    );
  }

  const disabled = !canEdit || saving;
  const runtimeMode = settings.google_tag_manager_id
    ? "Google Tag Manager"
    : settings.google_analytics_measurement_id
      ? "Direct GA4 fallback"
      : "No provider configured";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Marketing & Analytics</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${settings.tracking_enabled ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                {settings.tracking_enabled ? "Tracking enabled" : "Tracking disabled"}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Configure the public Store analytics boundary. GTM is preferred; direct GA4 is used only when no GTM container is configured. Meta, TikTok, Pinterest and ad-platform tags should be managed inside GTM rather than hard-coded into the Store.
            </p>
          </div>
          {canEdit ? (
            <button type="button" onClick={() => void save()} disabled={disabled} className={primaryButton}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          ) : null}
        </div>
        {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div> : null}
        {success ? <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Provider Configuration</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Current runtime mode: <strong>{runtimeMode}</strong>. These IDs are public identifiers, not secrets.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Google Tag Manager Container ID" value={settings.google_tag_manager_id} onChange={(value) => patch("google_tag_manager_id", value)} disabled={disabled} placeholder="GTM-XXXXXXX" />
          <Field label="GA4 Measurement ID (fallback)" value={settings.google_analytics_measurement_id} onChange={(value) => patch("google_analytics_measurement_id", value)} disabled={disabled} placeholder="G-XXXXXXXXXX" />
          <div className="md:col-span-2">
            <Toggle
              label="Enable optional tracking"
              description="When disabled, the Store does not load GTM or GA4 even if IDs are configured. Enabling requires the built-in consent banner."
              checked={settings.tracking_enabled}
              onChange={(value) => patch("tracking_enabled", value)}
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Consent Experience</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Toggle
            label="Consent banner"
            description="Visitors can independently allow Analytics and Marketing categories, accept all, or reject optional tracking."
            checked={settings.consent_banner_enabled}
            onChange={(value) => patch("consent_banner_enabled", value)}
            disabled={disabled || settings.tracking_enabled}
          />
          <Toggle
            label="Respect browser Do Not Track"
            description="When the browser sends Do Not Track, optional analytics and marketing scripts stay disabled."
            checked={settings.respect_do_not_track}
            onChange={(value) => patch("respect_do_not_track", value)}
            disabled={disabled}
          />
          <Field label="Consent title" value={settings.consent_title} onChange={(value) => patch("consent_title", value)} disabled={disabled} />
          <Field label="Privacy policy link" value={settings.privacy_policy_href} onChange={(value) => patch("privacy_policy_href", value)} disabled={disabled} placeholder="/privacy" />
          <label className="md:col-span-2 block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Consent description</span>
            <textarea className={textareaClass} value={settings.consent_description} onChange={(event) => patch("consent_description", event.target.value)} disabled={disabled} />
          </label>
          <Field label="Accept all label" value={settings.accept_all_label} onChange={(value) => patch("accept_all_label", value)} disabled={disabled} />
          <Field label="Reject optional label" value={settings.reject_optional_label} onChange={(value) => patch("reject_optional_label", value)} disabled={disabled} />
          <Field label="Manage choices label" value={settings.manage_choices_label} onChange={(value) => patch("manage_choices_label", value)} disabled={disabled} />
          <Field label="Save choices label" value={settings.save_choices_label} onChange={(value) => patch("save_choices_label", value)} disabled={disabled} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Standard Event Dictionary</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          The Store pushes these normalized events to the dataLayer only after optional consent. GTM can map the same events to GA4, Google Ads, Meta, TikTok or Pinterest without changing application code. Lead form field values are not included in analytics events.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {eventNames.map((eventName) => (
            <code key={eventName} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {eventName}
            </code>
          ))}
        </div>
      </section>
    </div>
  );
}
