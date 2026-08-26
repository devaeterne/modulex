"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type Settings = {
  company_name: string;
  email: string | null;
  email_sender_name: string | null;
  email_sender_email: string | null;
  email_reply_to: string | null;
  order_notification_emails: string | null;
  stock_notification_emails: string | null;
  pricing_notification_emails: string | null;
  invoice_notification_emails: string | null;
  send_customer_order_emails: boolean;
  send_customer_invoice_emails: boolean;
};

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

function optional(value: string | null | undefined) { const normalized = value?.trim() ?? ""; return normalized || null; }
function validEmailList(value: string | null) { if (!value?.trim()) return true; return value.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean).every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)); }
function Field({ label, value, onChange, disabled, placeholder, hint }: { label: string; value: string | null; onChange: (value: string) => void; disabled: boolean; placeholder?: string; hint?: string }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span><input value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className={inputClass} />{hint && <span className="mt-1.5 block text-xs text-gray-400">{hint}</span>}</label>; }

export default function EmailSettingsManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
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
      const { data, error: settingsError } = await supabase.from("general_settings").select("company_name,email,email_sender_name,email_sender_email,email_reply_to,order_notification_emails,stock_notification_emails,pricing_notification_emails,invoice_notification_emails,send_customer_order_emails,send_customer_invoice_emails").eq("id", 1).single();
      if (settingsError) setError(settingsError.message); else setSettings(data as Settings);
      setLoading(false);
    }
    void load();
  }, []);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings((current) => current ? { ...current, [key]: value } : current); setSuccess(null); }

  async function save() {
    if (!settings) return;
    const emailFields: Array<[string, string | null]> = [
      ["Sender email", optional(settings.email_sender_email)], ["Reply-to", optional(settings.email_reply_to)],
      ["Order recipients", settings.order_notification_emails], ["Stock recipients", settings.stock_notification_emails],
      ["Pricing recipients", settings.pricing_notification_emails], ["Invoice recipients", settings.invoice_notification_emails],
    ];
    for (const [label, value] of emailFields) if (!validEmailList(value)) return setError(`${label} contains an invalid email address.`);
    setSaving(true); setError(null); setSuccess(null);
    const { data, error: saveError } = await supabase.from("general_settings").update({
      email_sender_name: optional(settings.email_sender_name) || settings.company_name,
      email_sender_email: optional(settings.email_sender_email),
      email_reply_to: optional(settings.email_reply_to),
      order_notification_emails: optional(settings.order_notification_emails),
      stock_notification_emails: optional(settings.stock_notification_emails),
      pricing_notification_emails: optional(settings.pricing_notification_emails),
      invoice_notification_emails: optional(settings.invoice_notification_emails),
      send_customer_order_emails: settings.send_customer_order_emails,
      send_customer_invoice_emails: settings.send_customer_invoice_emails,
    }).eq("id", 1).select("company_name,email,email_sender_name,email_sender_email,email_reply_to,order_notification_emails,stock_notification_emails,pricing_notification_emails,invoice_notification_emails,send_customer_order_emails,send_customer_invoice_emails").single();
    if (saveError) setError(saveError.message); else { setSettings(data as Settings); setSuccess("Email settings saved."); }
    setSaving(false);
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading email settings...</div>;
  if (!settings) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700">{error || "Email settings could not be loaded."}</div>;
  const disabled = !canEdit || saving;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Email Settings</h1><p className="mt-1 text-sm text-gray-500">Sender identity, reply-to address and recipient routing. Event-by-event delivery channels are managed under Notifications.</p></div>{canEdit && <button type="button" onClick={save} disabled={disabled} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving..." : "Save Email Settings"}</button>}</div>{error && <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}{success && <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}</section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Sender</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Sender Name" value={settings.email_sender_name} onChange={(value) => patch("email_sender_name", value)} disabled={disabled} placeholder={settings.company_name} /><Field label="Sender Email" value={settings.email_sender_email} onChange={(value) => patch("email_sender_email", value)} disabled={disabled} placeholder="no-reply@auth.example.com" hint="Must use a verified Resend sending domain." /><Field label="Reply-To" value={settings.email_reply_to} onChange={(value) => patch("email_reply_to", value)} disabled={disabled} placeholder={settings.email || "sales@example.com"} /></div></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Internal Recipients</h2><p className="mt-1 text-xs text-gray-500">Multiple addresses can be separated with commas.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Order Notifications" value={settings.order_notification_emails} onChange={(value) => patch("order_notification_emails", value)} disabled={disabled} /><Field label="Stock Alerts" value={settings.stock_notification_emails} onChange={(value) => patch("stock_notification_emails", value)} disabled={disabled} /><Field label="Pricing Alerts" value={settings.pricing_notification_emails} onChange={(value) => patch("pricing_notification_emails", value)} disabled={disabled} /><Field label="Invoice Notifications" value={settings.invoice_notification_emails} onChange={(value) => patch("invoice_notification_emails", value)} disabled={disabled} /></div></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Customer Email Channels</h2><p className="mt-1 text-sm text-gray-500">Master switches for customer-facing transactional email categories.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"><input type="checkbox" checked={settings.send_customer_order_emails} onChange={(event) => patch("send_customer_order_emails", event.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" /><span><span className="block text-sm font-medium text-gray-800 dark:text-white/90">Customer order emails</span><span className="mt-1 block text-xs text-gray-500">Order confirmations and customer-facing status updates.</span></span></label><label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"><input type="checkbox" checked={settings.send_customer_invoice_emails} onChange={(event) => patch("send_customer_invoice_emails", event.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500" /><span><span className="block text-sm font-medium text-gray-800 dark:text-white/90">Customer invoice emails</span><span className="mt-1 block text-xs text-gray-500">Issued invoice notifications to billing contacts.</span></span></label></div></section>
  </div>;
}
