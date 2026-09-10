"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const textareaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

export default function InvoiceDocumentSettings() {
  const [title, setTitle] = useState("Invoice");
  const [footer, setFooter] = useState("");
  const [prefix, setPrefix] = useState("INV-");
  const [padding, setPadding] = useState("6");
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) { setError(profileError.message); setIsLoading(false); return; }
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      const { data, error: settingsError } = await supabase.from("general_settings").select("invoice_document_title,invoice_footer_note,invoice_number_prefix,invoice_number_padding").eq("id", 1).single();
      if (settingsError) setError(settingsError.message);
      else { setTitle(data.invoice_document_title); setFooter(data.invoice_footer_note || ""); setPrefix(data.invoice_number_prefix); setPadding(String(data.invoice_number_padding)); }
      setIsLoading(false);
    }
    void load();
  }, []);

  async function save() {
    const normalizedTitle = title.trim();
    const normalizedPrefix = prefix.trim().toUpperCase();
    const normalizedPadding = Number.parseInt(padding, 10);
    if (!normalizedTitle) return setError("Invoice document title is required.");
    if (!normalizedPrefix || normalizedPrefix.length > 12) return setError("Invoice Number Prefix must be 1-12 characters.");
    if (!Number.isInteger(normalizedPadding) || normalizedPadding < 1 || normalizedPadding > 12) return setError("Invoice Number Padding must be between 1 and 12.");
    setIsSaving(true); setError(null); setMessage(null);
    const { error: saveError } = await supabase.from("general_settings").update({ invoice_document_title: normalizedTitle, invoice_footer_note: footer.trim() || null, invoice_number_prefix: normalizedPrefix, invoice_number_padding: normalizedPadding }).eq("id", 1);
    if (saveError) setError(saveError.message);
    else { setPrefix(normalizedPrefix); setPadding(String(normalizedPadding)); setMessage("Invoice document settings saved."); }
    setIsSaving(false);
  }

  if (isLoading) return null;

  return <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Invoice Document Defaults</h2><p className="mt-1 text-sm text-gray-500">Company-wide wording and generated Invoice number format.</p></div>{canEdit && <button type="button" onClick={save} disabled={isSaving} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{isSaving ? "Saving..." : "Save Invoice Defaults"}</button>}</div>
    {error && <div className="mb-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
    {message && <div className="mb-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{message}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Document Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canEdit || isSaving} className={inputClass} /></label>
      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Number Prefix</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} disabled={!canEdit || isSaving} className={inputClass} maxLength={12} /></label>
      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Number Padding</span><input value={padding} onChange={(event) => setPadding(event.target.value.replace(/\D/g, ""))} disabled={!canEdit || isSaving} inputMode="numeric" className={inputClass} /></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Footer Note</span><textarea value={footer} onChange={(event) => setFooter(event.target.value)} disabled={!canEdit || isSaving} className={textareaClass} /></label>
    </div>
  </section>;
}
