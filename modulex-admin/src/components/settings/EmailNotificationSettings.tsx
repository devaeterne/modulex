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
  lead_notification_emails: string | null;
  stock_notification_emails: string | null;
  pricing_notification_emails: string | null;
  invoice_notification_emails: string | null;
  send_customer_order_emails: boolean;
  send_customer_invoice_emails: boolean;
  notify_internal_new_order: boolean;
  notify_internal_order_status: boolean;
  notify_internal_stock_alerts: boolean;
  notify_internal_price_alerts: boolean;
  notify_internal_invoice_issued: boolean;
};

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

function optional(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function emailListIsValid(value: string | null) {
  if (!value?.trim()) return true;
  return value
    .split(/[;,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function Field({ label, value, onChange, disabled, placeholder, hint }: { label: string; value: string | null; onChange: (value: string) => void; disabled: boolean; placeholder?: string; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span><input value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className={inputClass} />{hint && <span className="mt-1.5 block text-xs text-gray-400">{hint}</span>}</label>;
}

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  return <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" /><span><span className="block text-sm font-medium text-gray-800 dark:text-white/90">{label}</span><span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</span></span></label>;
}

export default function EmailNotificationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));

      const { data, error: settingsError } = await supabase
        .from("general_settings")
        .select("company_name,email,email_sender_name,email_sender_email,email_reply_to,order_notification_emails,lead_notification_emails,stock_notification_emails,pricing_notification_emails,invoice_notification_emails,send_customer_order_emails,send_customer_invoice_emails,notify_internal_new_order,notify_internal_order_status,notify_internal_stock_alerts,notify_internal_price_alerts,notify_internal_invoice_issued")
        .eq("id", 1)
        .single();

      if (settingsError) setError(settingsError.message);
      else setSettings(data as Settings);
      setLoading(false);
    }
    void load();
  }, []);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
    setSuccess(null);
  }

  async function save() {
    if (!settings) return;
    const senderEmail = optional(settings.email_sender_email);
    const replyTo = optional(settings.email_reply_to);
    if (senderEmail && !emailListIsValid(senderEmail)) return setError("Sender email is not valid.");
    if (replyTo && !emailListIsValid(replyTo)) return setError("Reply-to email is not valid.");

    for (const [label, value] of [
      ["Order recipients", settings.order_notification_emails],
      ["Store lead recipients", settings.lead_notification_emails],
      ["Stock recipients", settings.stock_notification_emails],
      ["Pricing recipients", settings.pricing_notification_emails],
      ["Invoice recipients", settings.invoice_notification_emails],
    ] as Array<[string, string | null]>) {
      if (!emailListIsValid(value)) return setError(`${label} contains an invalid email address.`);
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      email_sender_name: optional(settings.email_sender_name) || settings.company_name,
      email_sender_email: senderEmail,
      email_reply_to: replyTo,
      order_notification_emails: optional(settings.order_notification_emails),
      lead_notification_emails: optional(settings.lead_notification_emails),
      stock_notification_emails: optional(settings.stock_notification_emails),
      pricing_notification_emails: optional(settings.pricing_notification_emails),
      invoice_notification_emails: optional(settings.invoice_notification_emails),
      send_customer_order_emails: settings.send_customer_order_emails,
      send_customer_invoice_emails: settings.send_customer_invoice_emails,
      notify_internal_new_order: settings.notify_internal_new_order,
      notify_internal_order_status: settings.notify_internal_order_status,
      notify_internal_stock_alerts: settings.notify_internal_stock_alerts,
      notify_internal_price_alerts: settings.notify_internal_price_alerts,
      notify_internal_invoice_issued: settings.notify_internal_invoice_issued,
    };

    const { data, error: updateError } = await supabase.from("general_settings").update(payload).eq("id", 1).select("company_name,email,email_sender_name,email_sender_email,email_reply_to,order_notification_emails,lead_notification_emails,stock_notification_emails,pricing_notification_emails,invoice_notification_emails,send_customer_order_emails,send_customer_invoice_emails,notify_internal_new_order,notify_internal_order_status,notify_internal_stock_alerts,notify_internal_price_alerts,notify_internal_invoice_issued").single();

    if (updateError) setError(updateError.message);
    else {
      setSettings(data as Settings);
      setSuccess("Email and notification settings saved.");
    }
    setSaving(false);
  }

  if (loading) return <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading email settings...</div>;
  if (!settings) return <div className="mt-5 rounded-2xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error || "Email settings could not be loaded."}</div>;

  const disabled = !canEdit || saving;

  return <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Email & Notifications</h2><p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">Transactional order, Store lead, stock, pricing and invoice emails. Customer-facing messages use the company identity and logo from General Settings.</p></div>{canEdit && <button type="button" onClick={save} disabled={disabled} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving..." : "Save Email Settings"}</button>}</div>

    {error && <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
    {success && <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}
    {!canEdit && <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">Only Admin and Super Admin users can change email notification settings.</div>}

    <div className="mt-6"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Sender</h3><div className="mt-3 grid gap-4 md:grid-cols-3"><Field label="Sender Name" value={settings.email_sender_name} onChange={(value) => patch("email_sender_name", value)} disabled={disabled} placeholder={settings.company_name} /><Field label="Sender Email" value={settings.email_sender_email} onChange={(value) => patch("email_sender_email", value)} disabled={disabled} placeholder="no-reply@auth.example.com" hint="Must belong to a verified Resend sending domain." /><Field label="Reply-To" value={settings.email_reply_to} onChange={(value) => patch("email_reply_to", value)} disabled={disabled} placeholder={settings.email || "sales@example.com"} /></div></div>

    <div className="mt-7"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Internal Recipients</h3><p className="mt-1 text-xs text-gray-500">Use commas to send a notification to multiple addresses.</p><div className="mt-3 grid gap-4 md:grid-cols-2"><Field label="Order Notifications" value={settings.order_notification_emails} onChange={(value) => patch("order_notification_emails", value)} disabled={disabled} placeholder="orders@example.com" /><Field label="Store Lead Notifications" value={settings.lead_notification_emails} onChange={(value) => patch("lead_notification_emails", value)} disabled={disabled} placeholder="sales@example.com" hint="Website inquiries and dealer applications." /><Field label="Stock Alerts" value={settings.stock_notification_emails} onChange={(value) => patch("stock_notification_emails", value)} disabled={disabled} placeholder="warehouse@example.com" /><Field label="Pricing Alerts" value={settings.pricing_notification_emails} onChange={(value) => patch("pricing_notification_emails", value)} disabled={disabled} placeholder="sales@example.com" /><Field label="Invoice Notifications" value={settings.invoice_notification_emails} onChange={(value) => patch("invoice_notification_emails", value)} disabled={disabled} placeholder="accounting@example.com" /></div></div>

    <div className="mt-7"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Delivery Rules</h3><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Toggle label="Customer order emails" description="Send confirmations and status changes to the customer's order contact." checked={settings.send_customer_order_emails} onChange={(value) => patch("send_customer_order_emails", value)} disabled={disabled} /><Toggle label="Customer invoice emails" description="Send issued invoice notifications to the customer's billing contact." checked={settings.send_customer_invoice_emails} onChange={(value) => patch("send_customer_invoice_emails", value)} disabled={disabled} /><Toggle label="New order notification" description="Notify the configured internal order recipients when a new order is created." checked={settings.notify_internal_new_order} onChange={(value) => patch("notify_internal_new_order", value)} disabled={disabled} /><Toggle label="Internal order status notification" description="Optionally notify internal order recipients for every status change." checked={settings.notify_internal_order_status} onChange={(value) => patch("notify_internal_order_status", value)} disabled={disabled} /><Toggle label="Stock shortage alerts" description="Notify warehouse recipients when sellable available stock is below requested quantity." checked={settings.notify_internal_stock_alerts} onChange={(value) => patch("notify_internal_stock_alerts", value)} disabled={disabled} /><Toggle label="Price review alerts" description="Notify pricing recipients when an order has a manual, missing or mismatched current price." checked={settings.notify_internal_price_alerts} onChange={(value) => patch("notify_internal_price_alerts", value)} disabled={disabled} /><Toggle label="Invoice issued notification" description="Notify internal invoice recipients when an invoice becomes issued." checked={settings.notify_internal_invoice_issued} onChange={(value) => patch("notify_internal_invoice_issued", value)} disabled={disabled} /></div></div>
  </section>;
}
