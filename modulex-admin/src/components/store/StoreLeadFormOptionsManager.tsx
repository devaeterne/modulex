"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { StoreLeadFormOption } from "@/lib/store/leads";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonClass = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6";
const KEY_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;

type Group = StoreLeadFormOption["option_group"];
type Draft = { option_group: Group; option_key: string; label: string; sort_order: number; is_active: boolean };
const emptyDraft: Draft = { option_group: "project_type", option_key: "", label: "", sort_order: 100, is_active: true };

export default function StoreLeadFormOptionsManager() {
  const [items, setItems] = useState<StoreLeadFormOption[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setError(profileError?.message || "Unable to verify Store management access.");
      setLoading(false);
      return;
    }
    const editable = ["super_admin", "admin"].includes(profile.role);
    setCanEdit(editable);
    setProfileId(profile.id);
    if (!editable) {
      setError("Store form configuration requires Store management access.");
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase.from("store_lead_form_options").select("*").order("option_group").order("sort_order").order("label");
    if (queryError) setError(queryError.message);
    else setItems((data ?? []) as StoreLeadFormOption[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function validate(value: Pick<Draft, "option_key" | "label">) {
    if (!KEY_PATTERN.test(value.option_key) || value.option_key.length > 64) return "Option key must be a lowercase slug using letters, numbers, underscore or hyphen.";
    if (!value.label.trim() || value.label.trim().length > 160) return "Label is required and must be 160 characters or fewer.";
    return null;
  }

  async function createOption() {
    const validation = validate(draft);
    if (validation || !profileId) { setError(validation || "Unable to identify current user."); return; }
    setBusy(true); setError(null); setSuccess(null);
    const { error: insertError } = await supabase.from("store_lead_form_options").insert({ ...draft, option_key: draft.option_key.trim(), label: draft.label.trim(), updated_by: profileId });
    if (insertError) setError(insertError.message);
    else { setDraft(emptyDraft); setSuccess("Form option created."); await load(); }
    setBusy(false);
  }

  async function saveOption(item: StoreLeadFormOption) {
    const validation = validate(item);
    if (validation || !profileId) { setError(validation || "Unable to identify current user."); return; }
    setBusy(true); setError(null); setSuccess(null);
    const { error: updateError } = await supabase.from("store_lead_form_options").update({ option_group: item.option_group, option_key: item.option_key.trim(), label: item.label.trim(), sort_order: item.sort_order, is_active: item.is_active, updated_by: profileId }).eq("id", item.id);
    if (updateError) setError(updateError.message);
    else { setSuccess("Form option saved."); await load(); }
    setBusy(false);
  }

  function patch(id: string, changes: Partial<StoreLeadFormOption>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  if (loading) return <div className={cardClass}>Loading form options...</div>;

  return <div className="space-y-5">
    <div className={cardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Lead Form Options</h1><p className="mt-1 text-sm text-gray-500">Manage business-approved project consultation choices. No option is published until it is active.</p></div><Link href="/store/leads" className={buttonClass}>Back to Leads</Link></div>
      {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div> : null}
    </div>

    {canEdit ? <div className={cardClass}>
      <h2 className="font-semibold text-gray-800 dark:text-white/90">Add option</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <select className={inputClass} value={draft.option_group} onChange={(event) => setDraft((value) => ({ ...value, option_group: event.target.value as Group }))}><option value="project_type">Project Type</option><option value="consultation_intent">Consultation Intent</option></select>
        <input className={inputClass} value={draft.option_key} maxLength={64} placeholder="option-key" onChange={(event) => setDraft((value) => ({ ...value, option_key: event.target.value.toLowerCase() }))} />
        <input className={`${inputClass} md:col-span-2`} value={draft.label} maxLength={160} placeholder="Public label" onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))} />
        <div className="flex gap-2"><input className={inputClass} type="number" value={draft.sort_order} onChange={(event) => setDraft((value) => ({ ...value, sort_order: Number(event.target.value) || 0 }))} /><button type="button" className={primaryButton} onClick={createOption} disabled={busy}>Add</button></div>
      </div>
    </div> : null}

    <div className={cardClass}>
      <h2 className="font-semibold text-gray-800 dark:text-white/90">Configured options</h2>
      <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:grid-cols-6">
        <select className={inputClass} value={item.option_group} onChange={(event) => patch(item.id, { option_group: event.target.value as Group })}><option value="project_type">Project Type</option><option value="consultation_intent">Consultation Intent</option></select>
        <input className={inputClass} value={item.option_key} maxLength={64} onChange={(event) => patch(item.id, { option_key: event.target.value.toLowerCase() })} />
        <input className={`${inputClass} md:col-span-2`} value={item.label} maxLength={160} onChange={(event) => patch(item.id, { label: event.target.value })} />
        <div className="flex gap-2"><input className={inputClass} type="number" value={item.sort_order} onChange={(event) => patch(item.id, { sort_order: Number(event.target.value) || 0 })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.is_active} onChange={(event) => patch(item.id, { is_active: event.target.checked })} />Active</label></div>
        <button type="button" className={buttonClass} onClick={() => saveOption(item)} disabled={busy}>Save</button>
      </div>)}{items.length === 0 ? <p className="text-sm text-gray-500">No business-approved project consultation options are configured yet.</p> : null}</div>
    </div>
  </div>;
}
