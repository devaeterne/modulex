"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";
import {
  isValidCountryCode,
  isValidEmail,
  isValidHttpUrl,
  isValidPhone,
  normalizeCountryCode,
  normalizeEmail,
  normalizeOptional,
  sanitizePhoneInput,
} from "@/lib/validation";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const secondaryButton = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

function Field({ label, value, onChange, disabled, placeholder, type = "text", required = false, maxLength, inputMode, autoComplete }: { label: string; value: string | null; onChange: (value: string) => void; disabled: boolean; placeholder?: string; type?: string; required?: boolean; maxLength?: number; inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal" | "search"; autoComplete?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}{required ? " *" : ""}</span><input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} required={required} maxLength={maxLength} inputMode={inputMode} autoComplete={autoComplete} className={inputClass} /></label>;
}

export default function CompanyProfileSettings() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) { setError(profileError.message); setLoading(false); return; }
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      const { data, error: settingsError } = await supabase.from("general_settings").select("*").eq("id", 1).single();
      if (settingsError) setError(settingsError.message);
      else setSettings(data as GeneralSettings);
      setLoading(false);
    }
    void load();
  }, []);

  function patch<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSuccess(null);
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) return setError("Logo must be PNG, JPG, WEBP or SVG.");
    if (file.size > 5 * 1024 * 1024) return setError("Logo file must be 5 MB or smaller.");
    setUploading(true); setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, "") || "png";
    const path = `branding/company-logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("company-assets").upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (uploadError) setError(uploadError.message);
    else {
      const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
      patch("logo_url", data.publicUrl);
      setSuccess("Logo uploaded. Save Company Profile to apply it.");
    }
    setUploading(false);
  }

  async function save() {
    const companyName = settings.company_name.trim();
    const country = normalizeOptional(settings.country_code) ? normalizeCountryCode(settings.country_code ?? "") : null;
    const email = normalizeOptional(settings.email);
    const phone = normalizeOptional(settings.phone);
    const website = normalizeOptional(settings.website);
    const logoUrl = normalizeOptional(settings.logo_url);

    if (!companyName) return setError("Company name is required.");
    if (country && !isValidCountryCode(country)) return setError("Country code must be a 2-letter ISO code, for example US or CA.");
    if (email && !isValidEmail(email)) return setError("Enter a valid company email address.");
    if (phone && !isValidPhone(phone)) return setError("Enter a valid phone number using 7 to 15 digits. Letters are not allowed.");
    if (website && !isValidHttpUrl(website)) return setError("Website must be a valid http:// or https:// URL.");
    if (logoUrl && !isValidHttpUrl(logoUrl)) return setError("Logo URL must be a valid http:// or https:// URL.");

    setSaving(true); setError(null); setSuccess(null);
    const { data, error: saveError } = await supabase.from("general_settings").update({
      company_name: companyName,
      legal_name: normalizeOptional(settings.legal_name),
      logo_url: logoUrl,
      tax_number: normalizeOptional(settings.tax_number),
      registration_number: normalizeOptional(settings.registration_number),
      email: email ? normalizeEmail(email) : null,
      phone,
      website,
      address_line_1: normalizeOptional(settings.address_line_1),
      address_line_2: normalizeOptional(settings.address_line_2),
      postal_code: normalizeOptional(settings.postal_code),
      city: normalizeOptional(settings.city),
      state_region: normalizeOptional(settings.state_region),
      country_code: country,
    }).eq("id", 1).select("*").single();
    if (saveError) setError(saveError.message);
    else { setSettings(data as GeneralSettings); setSuccess("Company profile saved."); }
    setSaving(false);
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading company profile...</div>;
  const disabled = !canEdit || saving || uploading;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Company Profile</h1><p className="mt-1 text-sm text-gray-500">Business identity, legal details, contact information and address.</p></div>{canEdit && <button type="button" onClick={save} disabled={disabled} className={primaryButton}>{saving ? "Saving..." : "Save Company Profile"}</button>}</div>
      {error && <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
      {success && <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Identity & Logo</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Company Display Name" value={settings.company_name} onChange={(value) => patch("company_name", value)} disabled={disabled} required placeholder="Example Company" /><Field label="Legal Company Name" value={settings.legal_name} onChange={(value) => patch("legal_name", value)} disabled={disabled} placeholder="Example Company LLC" />
      <div className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Company Logo</span><div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center">{settings.logo_url ? <div className="flex h-20 w-48 items-center justify-center rounded-lg bg-white p-3 ring-1 ring-gray-200"><img src={settings.logo_url} alt="Company logo" className="max-h-14 max-w-[168px] object-contain" /></div> : <div className="flex h-20 w-48 items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400 dark:bg-gray-800">No logo</div>}<div className="flex flex-wrap gap-2">{canEdit && <label className={`${secondaryButton} ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>{uploading ? "Uploading..." : "Upload / Replace Logo"}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={disabled} onChange={(event) => void uploadLogo(event.target.files?.[0])} /></label>}{canEdit && settings.logo_url && <button type="button" onClick={() => patch("logo_url", null)} disabled={disabled} className={secondaryButton}>Remove Logo</button>}</div></div></div>
      <div className="md:col-span-2"><Field label="Logo URL" type="url" inputMode="url" value={settings.logo_url} onChange={(value) => patch("logo_url", value)} disabled={disabled} placeholder="https://example.com/logo.png" /></div></div></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Legal & Registration</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Tax / EIN Number" value={settings.tax_number} onChange={(value) => patch("tax_number", value)} disabled={disabled} placeholder="12-3456789" /><Field label="Registration Number" value={settings.registration_number} onChange={(value) => patch("registration_number", value)} disabled={disabled} placeholder="State registration number" /></div></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Contact Information</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Email" type="email" inputMode="email" autoComplete="email" value={settings.email} onChange={(value) => patch("email", value)} disabled={disabled} placeholder="office@example.com" /><Field label="Phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={settings.phone} onChange={(value) => patch("phone", sanitizePhoneInput(value))} disabled={disabled} placeholder="+1 (202) 555-0123" /><Field label="Website" type="url" inputMode="url" value={settings.website} onChange={(value) => patch("website", value)} disabled={disabled} placeholder="https://example.com" /></div></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Company Address</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="md:col-span-2"><Field label="Address Line 1" value={settings.address_line_1} onChange={(value) => patch("address_line_1", value)} disabled={disabled} placeholder="123 Main St" /></div><Field label="Address Line 2" value={settings.address_line_2} onChange={(value) => patch("address_line_2", value)} disabled={disabled} placeholder="Suite 400" /><Field label="City" autoComplete="address-level2" value={settings.city} onChange={(value) => patch("city", value)} disabled={disabled} placeholder="New York" /><Field label="State" autoComplete="address-level1" value={settings.state_region} onChange={(value) => patch("state_region", value)} disabled={disabled} placeholder="NY" /><Field label="ZIP / Postal Code" autoComplete="postal-code" value={settings.postal_code} onChange={(value) => patch("postal_code", value)} disabled={disabled} placeholder="10001" /><Field label="Country Code" maxLength={2} value={settings.country_code} onChange={(value) => patch("country_code", normalizeCountryCode(value))} disabled={disabled} placeholder="US" /></div></section>
  </div>;
}
