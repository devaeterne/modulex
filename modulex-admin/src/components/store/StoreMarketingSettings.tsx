"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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

export type MarketingFieldErrors = {
  gtm?: string;
  ga4?: string;
  privacyHref?: string;
  consentTitle?: string;
  consentDescription?: string;
  acceptAll?: string;
  rejectOptional?: string;
  manageChoices?: string;
  saveChoices?: string;
};

function clean(value: string | null) { const normalized = value?.trim(); return normalized ? normalized : null; }
function validHref(value: string) {
  if (value.startsWith("/")) return true;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}

const eventNames = ["page_view", "product_view", "search", "catalog_download", "contact_form_start", "contact_form_submit", "dealer_application_start", "dealer_application_submit", "contact_click", "phone_click", "email_click", "login", "portal_view"];

export default function StoreMarketingSettings() {
  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<MarketingFieldErrors>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError) { setError(profileError.message); setLoading(false); return; }
    setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
    const { data, error: settingsError } = await supabase.from("store_marketing_settings").select("*").eq("id", 1).single();
    if (settingsError) setError(settingsError.message); else setSettings(data as MarketingSettings);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function patch<K extends keyof MarketingSettings>(key: K, value: MarketingSettings[K], errorKey?: keyof MarketingFieldErrors) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
    if (errorKey) setFieldErrors((current) => ({ ...current, [errorKey]: undefined }));
    setSuccess(null);
  }
  function focusFirstInvalid(errors: MarketingFieldErrors) {
    const id = errors.gtm ? "marketing-gtm" : errors.ga4 ? "marketing-ga4" : errors.privacyHref ? "marketing-privacy-href" : errors.consentTitle ? "marketing-consent-title" : errors.consentDescription ? "marketing-consent-description" : errors.acceptAll ? "marketing-accept-all" : errors.rejectOptional ? "marketing-reject-optional" : errors.manageChoices ? "marketing-manage-choices" : errors.saveChoices ? "marketing-save-choices" : null;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function save() {
    if (!settings) return;
    const gtm = clean(settings.google_tag_manager_id)?.toUpperCase() ?? null;
    const ga4 = clean(settings.google_analytics_measurement_id)?.toUpperCase() ?? null;
    const privacyHref = clean(settings.privacy_policy_href);
    const next: MarketingFieldErrors = {};
    if (gtm && !/^GTM-[A-Z0-9]+$/.test(gtm)) next.gtm = "Google Tag Manager ID must look like GTM-XXXXXXX.";
    if (ga4 && !/^G-[A-Z0-9]+$/.test(ga4)) next.ga4 = "GA4 Measurement ID must look like G-XXXXXXXXXX.";
    if (privacyHref && !validHref(privacyHref)) next.privacyHref = "Privacy policy link must be a site path or http(s) URL.";
    if (!settings.consent_title.trim()) next.consentTitle = "Consent title is required.";
    if (!settings.consent_description.trim()) next.consentDescription = "Consent description is required.";
    if (!settings.accept_all_label.trim()) next.acceptAll = "Accept-all label is required.";
    if (!settings.reject_optional_label.trim()) next.rejectOptional = "Reject-optional label is required.";
    if (!settings.manage_choices_label.trim()) next.manageChoices = "Manage-choices label is required.";
    if (!settings.save_choices_label.trim()) next.saveChoices = "Save-choices label is required.";
    if (settings.tracking_enabled && !settings.consent_banner_enabled) {
      setError("Consent banner must remain enabled while optional tracking is enabled.");
      setFieldErrors(next); return;
    }
    if (settings.tracking_enabled && !gtm && !ga4) {
      next.gtm = "Add a GTM Container ID or GA4 Measurement ID before enabling tracking.";
    }
    setFieldErrors(next);
    if (Object.keys(next).length) { setError("Correct the highlighted marketing fields before saving."); focusFirstInvalid(next); return; }

    setSaving(true); setError(null); setSuccess(null);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { setError(userError?.message ?? "Unable to verify current user."); setSaving(false); return; }
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
    const { data, error: saveError } = await supabase.from("store_marketing_settings").update(payload).eq("id", 1).select("*").single();
    if (saveError) setError(saveError.message);
    else { setSettings(data as MarketingSettings); setSuccess("Marketing & analytics settings saved. Public Store cache can take a few minutes to refresh."); }
    setSaving(false);
  }

  if (loading || !settings) return <Alert variant="info" title="Loading marketing settings" message="Store marketing and consent settings are being loaded." />;
  const disabled = !canEdit || saving;
  const runtimeMode = settings.google_tag_manager_id ? "Google Tag Manager" : settings.google_analytics_measurement_id ? "Direct GA4 fallback" : "No provider configured";

  return <div className="space-y-5">
    {error ? <Alert variant="error" title="Marketing & analytics" message={error} /> : null}
    {success ? <Alert variant="success" title="Marketing & analytics" message={success} /> : null}
    <ComponentCard title="Marketing & Analytics" desc="Configure the public Store analytics and consent boundary." headerAction={<div className="flex items-center gap-2"><Badge color={settings.tracking_enabled ? "success" : "light"}>{settings.tracking_enabled ? "Tracking enabled" : "Tracking disabled"}</Badge>{canEdit ? <Button onClick={() => void save()} disabled={disabled}>{saving ? "Saving..." : "Save Settings"}</Button> : null}</div>}>
      <p>Current runtime mode: <strong>{runtimeMode}</strong>. GTM is preferred; direct GA4 is used only when no GTM container is configured.</p>
    </ComponentCard>

    <ComponentCard title="Provider Configuration" desc="These IDs are public identifiers, not secrets."><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="marketing-gtm">Google Tag Manager Container ID</Label><Input id="marketing-gtm" value={settings.google_tag_manager_id ?? ""} onChange={(event) => patch("google_tag_manager_id", event.target.value, "gtm")} disabled={disabled} placeholder="GTM-XXXXXXX" error={Boolean(fieldErrors.gtm)} hint={fieldErrors.gtm} /></div><div><Label htmlFor="marketing-ga4">GA4 Measurement ID</Label><Input id="marketing-ga4" value={settings.google_analytics_measurement_id ?? ""} onChange={(event) => patch("google_analytics_measurement_id", event.target.value, "ga4")} disabled={disabled} placeholder="G-XXXXXXXXXX" error={Boolean(fieldErrors.ga4)} hint={fieldErrors.ga4} /></div><div className="md:col-span-2"><Checkbox id="marketing-tracking" label="Enable optional tracking" checked={settings.tracking_enabled} onChange={(checked) => patch("tracking_enabled", checked)} disabled={disabled} /></div></div></ComponentCard>

    <ComponentCard title="Consent Experience"><div className="grid gap-4 md:grid-cols-2"><Checkbox id="marketing-consent-banner" label="Consent banner" checked={settings.consent_banner_enabled} onChange={(checked) => patch("consent_banner_enabled", checked)} disabled={disabled || settings.tracking_enabled} /><Checkbox id="marketing-dnt" label="Respect browser Do Not Track" checked={settings.respect_do_not_track} onChange={(checked) => patch("respect_do_not_track", checked)} disabled={disabled} /><div><Label htmlFor="marketing-consent-title">Consent title</Label><Input id="marketing-consent-title" value={settings.consent_title} onChange={(event) => patch("consent_title", event.target.value, "consentTitle")} disabled={disabled} error={Boolean(fieldErrors.consentTitle)} hint={fieldErrors.consentTitle} /></div><div><Label htmlFor="marketing-privacy-href">Privacy policy link</Label><Input id="marketing-privacy-href" value={settings.privacy_policy_href ?? ""} onChange={(event) => patch("privacy_policy_href", event.target.value, "privacyHref")} disabled={disabled} placeholder="/privacy" error={Boolean(fieldErrors.privacyHref)} hint={fieldErrors.privacyHref} /></div><div className="md:col-span-2"><Label htmlFor="marketing-consent-description">Consent description</Label><TextArea id="marketing-consent-description" rows={4} value={settings.consent_description} onChange={(value) => patch("consent_description", value, "consentDescription")} disabled={disabled} error={Boolean(fieldErrors.consentDescription)} hint={fieldErrors.consentDescription} /></div><div><Label htmlFor="marketing-accept-all">Accept all label</Label><Input id="marketing-accept-all" value={settings.accept_all_label} onChange={(event) => patch("accept_all_label", event.target.value, "acceptAll")} disabled={disabled} error={Boolean(fieldErrors.acceptAll)} hint={fieldErrors.acceptAll} /></div><div><Label htmlFor="marketing-reject-optional">Reject optional label</Label><Input id="marketing-reject-optional" value={settings.reject_optional_label} onChange={(event) => patch("reject_optional_label", event.target.value, "rejectOptional")} disabled={disabled} error={Boolean(fieldErrors.rejectOptional)} hint={fieldErrors.rejectOptional} /></div><div><Label htmlFor="marketing-manage-choices">Manage choices label</Label><Input id="marketing-manage-choices" value={settings.manage_choices_label} onChange={(event) => patch("manage_choices_label", event.target.value, "manageChoices")} disabled={disabled} error={Boolean(fieldErrors.manageChoices)} hint={fieldErrors.manageChoices} /></div><div><Label htmlFor="marketing-save-choices">Save choices label</Label><Input id="marketing-save-choices" value={settings.save_choices_label} onChange={(event) => patch("save_choices_label", event.target.value, "saveChoices")} disabled={disabled} error={Boolean(fieldErrors.saveChoices)} hint={fieldErrors.saveChoices} /></div></div></ComponentCard>

    <ComponentCard title="Standard Event Dictionary" desc="Normalized events are emitted only after optional consent."><div className="flex flex-wrap gap-2">{eventNames.map((eventName) => <Badge key={eventName} color="light">{eventName}</Badge>)}</div></ComponentCard>
  </div>;
}
