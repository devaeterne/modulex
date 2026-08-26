"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
} from "@/lib/settings/types";
import {
  isValidCountryCode,
  isValidCurrencyCode,
  isValidEmail,
  isValidHttpUrl,
  isValidPhone,
  normalizeCountryCode,
  normalizeCurrencyCode,
  normalizeEmail,
  normalizeOptional,
  sanitizePhoneInput,
} from "@/lib/validation";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

const textareaClass =
  "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  required = false,
  type = "text",
  hint,
  maxLength,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  required?: boolean;
  type?: string;
  hint?: string;
  maxLength?: number;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal" | "search";
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}{required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className={inputClass}
      />
      {hint && <span className="mt-1.5 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

export default function GeneralSettingsManager() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }

      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));

      const { data, error } = await supabase
        .from("general_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setSettings(data as GeneralSettings);
      setIsLoading(false);
    }

    init();
  }, []);

  function patch<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSuccessMessage(null);
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Logo must be PNG, JPG, WEBP or SVG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Logo file must be 5 MB or smaller.");
      return;
    }

    setIsUploadingLogo(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const originalExtension = file.name.split(".").pop()?.toLowerCase();
    const extension = originalExtension && /^[a-z0-9]+$/.test(originalExtension)
      ? originalExtension
      : "png";
    const path = `branding/company-logo-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("company-assets")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setErrorMessage(uploadError.message);
      setIsUploadingLogo(false);
      return;
    }

    const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
    setSettings((current) => ({ ...current, logo_url: data.publicUrl }));
    setSuccessMessage("Logo uploaded. Save settings to apply it to company documents.");
    setIsUploadingLogo(false);
  }

  async function save() {
    const companyName = settings.company_name.trim();
    const currency = normalizeCurrencyCode(settings.default_currency);
    const country = normalizeOptional(settings.country_code)
      ? normalizeCountryCode(settings.country_code ?? "")
      : null;
    const locale = settings.locale.trim();
    const timezone = settings.timezone.trim();
    const documentTitle = settings.order_document_title.trim();
    const email = normalizeOptional(settings.email);
    const phone = normalizeOptional(settings.phone);
    const website = normalizeOptional(settings.website);
    const logoUrl = normalizeOptional(settings.logo_url);

    if (!companyName) return setErrorMessage("Company name is required.");
    if (!isValidCurrencyCode(currency)) return setErrorMessage("Default currency must be a 3-letter ISO code, for example USD or CAD.");
    if (country && !isValidCountryCode(country)) return setErrorMessage("Country code must be a 2-letter ISO code, for example US or CA.");
    if (email && !isValidEmail(email)) return setErrorMessage("Enter a valid company email address.");
    if (phone && !isValidPhone(phone)) return setErrorMessage("Enter a valid phone number using 7 to 15 digits. Letters are not allowed.");
    if (website && !isValidHttpUrl(website)) return setErrorMessage("Website must be a valid http:// or https:// URL.");
    if (logoUrl && !isValidHttpUrl(logoUrl)) return setErrorMessage("Logo URL must be a valid http:// or https:// URL.");
    if (!locale) return setErrorMessage("Locale is required.");
    if (!timezone) return setErrorMessage("Timezone is required.");
    if (!documentTitle) return setErrorMessage("Order document title is required.");

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
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
      default_currency: currency,
      locale,
      timezone,
      order_document_title: documentTitle,
      order_footer_note: normalizeOptional(settings.order_footer_note),
    };

    const { data, error } = await supabase
      .from("general_settings")
      .update(payload)
      .eq("id", 1)
      .select("*")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSettings(data as GeneralSettings);
    setSuccessMessage("General settings saved.");
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
          <p className="text-sm text-gray-500">Loading general settings...</p>
        </div>
      </div>
    );
  }

  const disabled = !canEdit || isSaving || isUploadingLogo;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Company & General Settings</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Central company identity and document defaults. These values are used on customer-facing documents such as order confirmations.
            </p>
          </div>
          {canEdit && (
            <button type="button" onClick={save} disabled={disabled} className={primaryButtonClass}>
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </div>
      </div>

      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{successMessage}</div>}
      {!canEdit && <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">You can view these settings, but only Admin and Super Admin users can edit them.</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Company Identity</h2>
          <p className="mt-1 text-sm text-gray-500">The business identity shown on sales documents. This is separate from the Modulex application brand.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company Display Name" value={settings.company_name} onChange={(value) => patch("company_name", value)} disabled={disabled} required placeholder="Example Company" />
          <Field label="Legal Company Name" value={settings.legal_name} onChange={(value) => patch("legal_name", value)} disabled={disabled} placeholder="Example Company LLC" />

          <div className="md:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Company Logo</span>
            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center">
              {settings.logo_url ? (
                <div className="flex h-20 w-48 shrink-0 items-center justify-center rounded-lg bg-white p-3 ring-1 ring-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={settings.logo_url} alt={`${settings.company_name || "Company"} logo`} className="max-h-14 max-w-[168px] object-contain" />
                </div>
              ) : (
                <div className="flex h-20 w-48 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400 dark:bg-gray-800">No logo uploaded</div>
              )}

              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <label className={`${secondaryButtonClass} ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                    {isUploadingLogo ? "Uploading..." : settings.logo_url ? "Replace Logo" : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      disabled={disabled}
                      onChange={(event) => uploadLogo(event.target.files?.[0])}
                      className="sr-only"
                    />
                  </label>
                )}
                {canEdit && settings.logo_url && (
                  <button type="button" className={secondaryButtonClass} disabled={disabled} onClick={() => patch("logo_url", null)}>
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">PNG, JPG, WEBP or SVG. Maximum 5 MB. Stored in the company-assets bucket.</p>
          </div>

          <div className="md:col-span-2">
            <Field label="Logo URL" type="url" inputMode="url" value={settings.logo_url} onChange={(value) => patch("logo_url", value)} disabled={disabled} placeholder="https://example.com/logo.png" hint="Filled automatically after upload. It can also point to another public HTTPS image." />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Legal & Registration</h2>
          <p className="mt-1 text-sm text-gray-500">Official identifiers that can be shown on commercial documents.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tax / EIN Number" value={settings.tax_number} onChange={(value) => patch("tax_number", value)} disabled={disabled} placeholder="12-3456789" />
          <Field label="Registration Number" value={settings.registration_number} onChange={(value) => patch("registration_number", value)} disabled={disabled} placeholder="State registration number" />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Contact Information</h2>
          <p className="mt-1 text-sm text-gray-500">Primary company contact details used on orders and future documents.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Email" type="email" inputMode="email" autoComplete="email" value={settings.email} onChange={(value) => patch("email", value)} disabled={disabled} placeholder="office@example.com" />
          <Field label="Phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={settings.phone} onChange={(value) => patch("phone", sanitizePhoneInput(value))} disabled={disabled} placeholder="+1 (202) 555-0123" />
          <Field label="Website" type="url" inputMode="url" value={settings.website} onChange={(value) => patch("website", value)} disabled={disabled} placeholder="https://example.com" />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Company Address</h2>
          <p className="mt-1 text-sm text-gray-500">Head office or primary legal/business address.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-2">
            <Field label="Address Line 1" value={settings.address_line_1} onChange={(value) => patch("address_line_1", value)} disabled={disabled} placeholder="123 Main St" />
          </div>
          <Field label="Address Line 2" value={settings.address_line_2} onChange={(value) => patch("address_line_2", value)} disabled={disabled} placeholder="Suite 400" />
          <Field label="ZIP / Postal Code" autoComplete="postal-code" value={settings.postal_code} onChange={(value) => patch("postal_code", value)} disabled={disabled} placeholder="10001" />
          <Field label="City" autoComplete="address-level2" value={settings.city} onChange={(value) => patch("city", value)} disabled={disabled} placeholder="New York" />
          <Field label="State" autoComplete="address-level1" value={settings.state_region} onChange={(value) => patch("state_region", value)} disabled={disabled} placeholder="NY" />
          <Field label="Country Code" maxLength={2} value={settings.country_code} onChange={(value) => patch("country_code", normalizeCountryCode(value))} disabled={disabled} placeholder="US" hint="2-letter ISO country code." />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Regional & Document Defaults</h2>
          <p className="mt-1 text-sm text-gray-500">System-wide defaults. Order-specific values still take priority when an order already stores its own currency.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Default Currency" maxLength={3} value={settings.default_currency} onChange={(value) => patch("default_currency", normalizeCurrencyCode(value))} disabled={disabled} required placeholder="USD" hint="3-letter ISO currency code." />
          <Field label="Locale" value={settings.locale} onChange={(value) => patch("locale", value)} disabled={disabled} required placeholder="en-US" hint="Used for number and date formatting." />
          <Field label="Timezone" value={settings.timezone} onChange={(value) => patch("timezone", value)} disabled={disabled} required placeholder="America/New_York" />
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="Order Document Title" value={settings.order_document_title} onChange={(value) => patch("order_document_title", value)} disabled={disabled} required placeholder="Sales Order / Order Confirmation" />
          </div>
          <label className="block md:col-span-2 xl:col-span-3">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Order Footer Note</span>
            <textarea
              value={settings.order_footer_note ?? ""}
              onChange={(event) => patch("order_footer_note", event.target.value)}
              disabled={disabled}
              placeholder="Optional payment, delivery, warranty or contact note shown near the bottom of the order document."
              className={textareaClass}
            />
          </label>
        </div>
      </section>

      {canEdit && (
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={disabled} className={primaryButtonClass}>
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
