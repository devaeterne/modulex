"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { isValidCurrencyCode, normalizeCurrencyCode } from "@/lib/validation";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

export default function LocalizationSettings() {
  const [currency, setCurrency] = useState("USD");
  const [locale, setLocale] = useState("en-US");
  const [timezone, setTimezone] = useState("America/New_York");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  async function save() {
    const normalizedCurrency = normalizeCurrencyCode(currency);
    if (!isValidCurrencyCode(normalizedCurrency)) return setError("Currency must be a 3-letter ISO code, for example USD or CAD.");
    if (!locale.trim()) return setError("Locale is required.");
    if (!timezone.trim()) return setError("Timezone is required.");
    setSaving(true); setError(null); setSuccess(null);
    const { error: saveError } = await supabase.from("general_settings").update({ default_currency: normalizedCurrency, locale: locale.trim(), timezone: timezone.trim() }).eq("id", 1);
    if (saveError) setError(saveError.message);
    else { setCurrency(normalizedCurrency); setSuccess("Localization settings saved."); }
    setSaving(false);
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading localization settings...</div>;
  const disabled = !canEdit || saving;

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Localization</h1><p className="mt-1 text-sm text-gray-500">System-wide currency, number/date locale and timezone defaults.</p></div>{canEdit && <button type="button" onClick={save} disabled={disabled} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving..." : "Save Localization"}</button>}</div>
    {error && <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
    {success && <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Default Currency *</span><input value={currency} onChange={(event) => setCurrency(normalizeCurrencyCode(event.target.value))} disabled={disabled} maxLength={3} placeholder="USD" autoCapitalize="characters" spellCheck={false} className={inputClass} /><span className="mt-1.5 block text-xs text-gray-400">3-letter ISO code.</span></label>
      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Locale *</span><input value={locale} onChange={(event) => setLocale(event.target.value)} disabled={disabled} placeholder="en-US" className={inputClass} /><span className="mt-1.5 block text-xs text-gray-400">Used for number and date formatting.</span></label>
      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Timezone *</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={disabled} placeholder="America/New_York" className={inputClass} /><span className="mt-1.5 block text-xs text-gray-400">IANA timezone identifier.</span></label>
    </div>
  </section>;
}
