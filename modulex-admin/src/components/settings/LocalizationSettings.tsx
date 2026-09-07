"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { isValidCurrencyCode, normalizeCurrencyCode } from "@/lib/validation";

export type LocalizationFieldErrors = { currency?: string; locale?: string; timezone?: string };

export default function LocalizationSettings() {
  const [currency, setCurrency] = useState("USD");
  const [locale, setLocale] = useState("en-US");
  const [timezone, setTimezone] = useState("America/New_York");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LocalizationFieldErrors>({});

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) { setError(profileError.message); setLoading(false); return; }
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      const { data, error: settingsError } = await supabase.from("general_settings").select("default_currency,locale,timezone").eq("id", 1).single();
      if (settingsError) setError(settingsError.message);
      else { setCurrency(data.default_currency || "USD"); setLocale(data.locale || "en-US"); setTimezone(data.timezone || "America/New_York"); }
      setLoading(false);
    }
    void load();
  }, []);

  function focusFirstInvalid(errors: LocalizationFieldErrors) {
    const id = errors.currency ? "localization-currency" : errors.locale ? "localization-locale" : errors.timezone ? "localization-timezone" : null;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function save() {
    const normalizedCurrency = normalizeCurrencyCode(currency);
    const normalizedLocale = locale.trim();
    const normalizedTimezone = timezone.trim();
    const next: LocalizationFieldErrors = {};
    if (!isValidCurrencyCode(normalizedCurrency)) next.currency = "Currency must be a 3-letter ISO code, for example USD or CAD.";
    if (!normalizedLocale) next.locale = "Locale is required.";
    if (!normalizedTimezone) next.timezone = "Timezone is required.";
    setFieldErrors(next);
    if (Object.keys(next).length) { setError("Correct the highlighted localization fields before saving."); focusFirstInvalid(next); return; }

    setSaving(true); setError(null); setSuccess(null);
    const { error: saveError } = await supabase.from("general_settings").update({ default_currency: normalizedCurrency, locale: normalizedLocale, timezone: normalizedTimezone }).eq("id", 1);
    if (saveError) setError(saveError.message);
    else { setCurrency(normalizedCurrency); setLocale(normalizedLocale); setTimezone(normalizedTimezone); setSuccess("Localization settings saved."); }
    setSaving(false);
  }

  if (loading) return <Alert variant="info" title="Loading localization" message="System localization defaults are being loaded." />;
  const disabled = !canEdit || saving;

  return <div className="space-y-5">
    {error ? <Alert variant="error" title="Localization" message={error} /> : null}
    {success ? <Alert variant="success" title="Localization" message={success} /> : null}
    <ComponentCard title="Localization" desc="System-wide currency, number/date locale and timezone defaults." headerAction={canEdit ? <Button onClick={() => void save()} disabled={disabled}>{saving ? "Saving..." : "Save Localization"}</Button> : undefined}>
      <div className="grid gap-4 md:grid-cols-3">
        <div><Label htmlFor="localization-currency">Default Currency *</Label><Input id="localization-currency" value={currency} onChange={(event) => { setCurrency(normalizeCurrencyCode(event.target.value)); setFieldErrors((current) => ({ ...current, currency: undefined })); }} disabled={disabled} maxLength={3} placeholder="USD" error={Boolean(fieldErrors.currency)} hint={fieldErrors.currency ?? "3-letter ISO code."} /></div>
        <div><Label htmlFor="localization-locale">Locale *</Label><Input id="localization-locale" value={locale} onChange={(event) => { setLocale(event.target.value); setFieldErrors((current) => ({ ...current, locale: undefined })); }} disabled={disabled} placeholder="en-US" error={Boolean(fieldErrors.locale)} hint={fieldErrors.locale ?? "Used for number and date formatting."} /></div>
        <div><Label htmlFor="localization-timezone">Timezone *</Label><Input id="localization-timezone" value={timezone} onChange={(event) => { setTimezone(event.target.value); setFieldErrors((current) => ({ ...current, timezone: undefined })); }} disabled={disabled} placeholder="America/New_York" error={Boolean(fieldErrors.timezone)} hint={fieldErrors.timezone ?? "IANA timezone identifier."} /></div>
      </div>
    </ComponentCard>
  </div>;
}
