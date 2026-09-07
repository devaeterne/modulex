"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
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

export type CompanyProfileFieldErrors = {
  companyName?: string;
  countryCode?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
};

type FieldKey = keyof CompanyProfileFieldErrors;

function Field({ id, label, value, onChange, disabled, placeholder, type = "text", required = false, maxLength, inputMode, autoComplete, error }: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal" | "search";
  autoComplete?: string;
  error?: string;
}) {
  return <div><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} required={required} maxLength={maxLength} inputMode={inputMode} autoComplete={autoComplete} error={Boolean(error)} hint={error} /></div>;
}

export default function CompanyProfileSettings() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CompanyProfileFieldErrors>({});

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

  function clearFieldError(key?: FieldKey) {
    if (key) setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }
  function patch<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K], errorKey?: FieldKey) {
    setSettings((current) => ({ ...current, [key]: value }));
    clearFieldError(errorKey);
    setSuccess(null);
  }
  function focusFirstInvalid(errors: CompanyProfileFieldErrors) {
    const id = errors.companyName ? "company-name" : errors.logoUrl ? "company-logo-url" : errors.email ? "company-email" : errors.phone ? "company-phone" : errors.website ? "company-website" : errors.countryCode ? "company-country-code" : null;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
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
      patch("logo_url", data.publicUrl, "logoUrl");
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
    const next: CompanyProfileFieldErrors = {};
    if (!companyName) next.companyName = "Company name is required.";
    if (country && !isValidCountryCode(country)) next.countryCode = "Country code must be a 2-letter ISO code, for example US or CA.";
    if (email && !isValidEmail(email)) next.email = "Enter a valid company email address.";
    if (phone && !isValidPhone(phone)) next.phone = "Enter a valid phone number using 7 to 15 digits.";
    if (website && !isValidHttpUrl(website)) next.website = "Website must be a valid http:// or https:// URL.";
    if (logoUrl && !isValidHttpUrl(logoUrl)) next.logoUrl = "Logo URL must be a valid http:// or https:// URL.";
    setFieldErrors(next);
    if (Object.keys(next).length) { setError("Correct the highlighted fields before saving."); focusFirstInvalid(next); return; }

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

  if (loading) return <Alert variant="info" title="Loading company profile" message="Company settings are being loaded." />;
  const disabled = !canEdit || saving || uploading;

  return <div className="space-y-5">
    <ComponentCard title="Company Profile" desc="Business identity, legal details, contact information and address." headerAction={canEdit ? <Button onClick={() => void save()} disabled={disabled}>{saving ? "Saving..." : "Save Company Profile"}</Button> : undefined}>
      {error ? <Alert variant="error" title="Company profile" message={error} /> : null}
      {success ? <Alert variant="success" title="Company profile" message={success} /> : null}
    </ComponentCard>

    <ComponentCard title="Identity & Logo" desc="Company display identity and public logo.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="company-name" label="Company Display Name" value={settings.company_name} onChange={(value) => patch("company_name", value, "companyName")} disabled={disabled} required placeholder="Example Company" error={fieldErrors.companyName} />
        <Field id="company-legal-name" label="Legal Company Name" value={settings.legal_name} onChange={(value) => patch("legal_name", value)} disabled={disabled} placeholder="Example Company LLC" />
        <div className="md:col-span-2"><Label htmlFor="company-logo-file">Upload company logo</Label><Input id="company-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={disabled} onChange={(event) => void uploadLogo(event.target.files?.[0])} /></div>
        <div className="md:col-span-2"><Field id="company-logo-url" label="Logo URL" type="url" inputMode="url" value={settings.logo_url} onChange={(value) => patch("logo_url", value, "logoUrl")} disabled={disabled} placeholder="https://example.com/logo.png" error={fieldErrors.logoUrl} /></div>
        {canEdit && settings.logo_url ? <div className="md:col-span-2"><Button variant="outline" disabled={disabled} onClick={() => patch("logo_url", null, "logoUrl")}>Remove Logo</Button></div> : null}
      </div>
    </ComponentCard>

    <ComponentCard title="Legal & Registration"><div className="grid gap-4 md:grid-cols-2"><Field id="company-tax-number" label="Tax / EIN Number" value={settings.tax_number} onChange={(value) => patch("tax_number", value)} disabled={disabled} /><Field id="company-registration-number" label="Registration Number" value={settings.registration_number} onChange={(value) => patch("registration_number", value)} disabled={disabled} /></div></ComponentCard>

    <ComponentCard title="Contact Information"><div className="grid gap-4 md:grid-cols-3"><Field id="company-email" label="Email" type="email" inputMode="email" autoComplete="email" value={settings.email} onChange={(value) => patch("email", value, "email")} disabled={disabled} placeholder="office@example.com" error={fieldErrors.email} /><Field id="company-phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={settings.phone} onChange={(value) => patch("phone", sanitizePhoneInput(value), "phone")} disabled={disabled} error={fieldErrors.phone} /><Field id="company-website" label="Website" type="url" inputMode="url" value={settings.website} onChange={(value) => patch("website", value, "website")} disabled={disabled} placeholder="https://example.com" error={fieldErrors.website} /></div></ComponentCard>

    <ComponentCard title="Company Address"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="md:col-span-2"><Field id="company-address-1" label="Address Line 1" value={settings.address_line_1} onChange={(value) => patch("address_line_1", value)} disabled={disabled} /></div><Field id="company-address-2" label="Address Line 2" value={settings.address_line_2} onChange={(value) => patch("address_line_2", value)} disabled={disabled} /><Field id="company-city" label="City" value={settings.city} onChange={(value) => patch("city", value)} disabled={disabled} /><Field id="company-state" label="State" value={settings.state_region} onChange={(value) => patch("state_region", value)} disabled={disabled} /><Field id="company-postal-code" label="ZIP / Postal Code" value={settings.postal_code} onChange={(value) => patch("postal_code", value)} disabled={disabled} /><Field id="company-country-code" label="Country Code" maxLength={2} value={settings.country_code} onChange={(value) => patch("country_code", normalizeCountryCode(value), "countryCode")} disabled={disabled} placeholder="US" error={fieldErrors.countryCode} /></div></ComponentCard>
  </div>;
}
