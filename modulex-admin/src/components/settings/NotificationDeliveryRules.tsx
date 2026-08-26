"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { previewNotificationChime } from "@/lib/notification-sound";

type Rule = {
  event_type: string;
  label: string;
  category: string;
  description: string | null;
  severity: "info" | "success" | "warning" | "critical";
  internal_email_enabled: boolean;
  panel_enabled: boolean;
  sound_enabled: boolean;
  sort_order: number;
};

const channelLabels = [
  ["internal_email_enabled", "Internal Email"],
  ["panel_enabled", "Panel"],
  ["sound_enabled", "Sound"],
] as const;

export default function NotificationDeliveryRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { profile } = await getCurrentProfile();
    setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));

    const { data, error: loadError } = await supabase
      .from("notification_delivery_rules")
      .select("*")
      .order("sort_order")
      .order("event_type");

    if (loadError) setError(loadError.message);
    else setRules((data ?? []) as Rule[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function patch(index: number, key: keyof Rule, value: boolean) {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [key]: value } : rule));
    setMessage(null);
  }

  async function save() {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    for (const rule of rules) {
      const { error: updateError } = await supabase
        .from("notification_delivery_rules")
        .update({
          internal_email_enabled: rule.internal_email_enabled,
          panel_enabled: rule.panel_enabled,
          sound_enabled: rule.sound_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("event_type", rule.event_type);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    }

    setMessage("Notification delivery rules saved.");
    setSaving(false);
  }

  async function testSound() {
    setTestingSound(true);
    setError(null);
    setMessage(null);
    try {
      await previewNotificationChime();
      setMessage("Sound preview played.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Notification sound could not be played.");
    } finally {
      setTestingSound(false);
    }
  }

  if (loading) return <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading notification rules...</section>;

  return <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Notification Delivery Rules</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">Choose how each internal event is delivered. Email can be disabled while the event remains visible in the panel. Sound is a short, calm in-app chime.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={testSound} disabled={testingSound} className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.03]">{testingSound ? "Playing..." : "Test Sound"}</button>
        {canEdit && <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving..." : "Save Rules"}</button>}
      </div>
    </div>

    {error && <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
    {message && <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{message}</div>}

    <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          <tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Category</th>{channelLabels.map(([, label]) => <th key={label} className="px-4 py-3 text-center">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rules.map((rule, index) => <tr key={rule.event_type}>
            <td className="px-4 py-4"><p className="font-medium text-gray-800 dark:text-white/90">{rule.label}</p><p className="mt-1 max-w-xl text-xs leading-5 text-gray-500 dark:text-gray-400">{rule.description}</p></td>
            <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{rule.category}</td>
            {channelLabels.map(([key]) => <td key={key} className="px-4 py-4 text-center"><input type="checkbox" checked={Boolean(rule[key])} disabled={!canEdit || saving} onChange={(event) => patch(index, key, event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" /></td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
