"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import {
  ADMIN_BUTTON_VARIANTS,
  ADMIN_COMPAT_APPEARANCE,
  ADMIN_FOCUS_RING,
  ADMIN_STATUS_TONES,
  ADMIN_SURFACE_CARD,
  ADMIN_TEXT_STYLES,
} from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { StoreLeadFormOption } from "@/lib/store/leads";

const cardClass = `${ADMIN_SURFACE_CARD} p-5 sm:p-6`;
const itemCardClass = `${ADMIN_SURFACE_CARD} p-4`;
const linkButtonClass = `inline-flex h-10 items-center justify-center px-4 text-sm font-medium ${ADMIN_COMPAT_APPEARANCE["rounded-lg"]} ${ADMIN_BUTTON_VARIANTS.outline} ${ADMIN_FOCUS_RING}`;
const errorClass = `${ADMIN_STATUS_TONES.light.error} mt-4 px-4 py-3 text-sm`;
const successClass = `${ADMIN_STATUS_TONES.light.success} mt-4 px-4 py-3 text-sm`;
const KEY_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;

const groupOptions = [
  { value: "project_type", label: "Project Type" },
  { value: "consultation_intent", label: "Consultation Intent" },
];

type Group = StoreLeadFormOption["option_group"];
type Draft = { option_group: Group; option_key: string; label: string; sort_order: number; is_active: boolean };
const emptyDraft: Draft = { option_group: "project_type", option_key: "", label: "", sort_order: 100, is_active: true };

export default function StoreLeadFormOptionsManager() {
  const [items, setItems] = useState<StoreLeadFormOption[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
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
    if (!editable) {
      setError("Store form configuration requires Admin access.");
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase.rpc("get_admin_store_lead_form_options");
    if (queryError) setError(queryError.message);
    else setItems((data ?? []) as StoreLeadFormOption[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function validate(value: Pick<Draft, "option_key" | "label" | "sort_order">) {
    if (!KEY_PATTERN.test(value.option_key) || value.option_key.length > 64) return "Option key must be a lowercase slug using letters, numbers, underscore or hyphen.";
    if (!value.label.trim() || value.label.trim().length > 160) return "Label is required and must be 160 characters or fewer.";
    if (!Number.isInteger(value.sort_order) || value.sort_order < -10000 || value.sort_order > 10000) return "Sort order must be an integer between -10000 and 10000.";
    return null;
  }

  async function persistOption(id: string | null, value: Draft) {
    const validation = validate(value);
    if (validation) { setError(validation); return false; }
    setBusy(true); setError(null); setSuccess(null);
    const { data, error: rpcError } = await supabase.rpc("upsert_store_lead_form_option", {
      p_id: id,
      p_option_group: value.option_group,
      p_option_key: value.option_key.trim(),
      p_label: value.label.trim(),
      p_sort_order: value.sort_order,
      p_is_active: value.is_active,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return false; }
    const result = data as { ok?: boolean; reason?: string } | null;
    if (!result?.ok) { setError(result?.reason === "option_not_found" ? "This option no longer exists. Reload and try again." : "Unable to save consultation option."); return false; }
    return true;
  }

  async function createOption() {
    if (await persistOption(null, draft)) {
      setDraft(emptyDraft);
      setSuccess("Form option created.");
      await load();
    }
  }

  async function saveOption(item: StoreLeadFormOption) {
    const value: Draft = { option_group: item.option_group, option_key: item.option_key, label: item.label, sort_order: item.sort_order, is_active: item.is_active };
    if (await persistOption(item.id, value)) {
      setSuccess("Form option saved.");
      await load();
    }
  }

  function patch(id: string, changes: Partial<StoreLeadFormOption>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  if (loading) return <div className={cardClass}>Loading form options...</div>;

  return <div className="space-y-5">
    <div className={cardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Lead Form Options</h1>
          <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Manage business-approved project consultation choices. Active options are published to the Store form; captured lead values remain behind Lead RBAC.</p>
        </div>
        <Link href="/store/leads" className={linkButtonClass}>Back to Leads</Link>
      </div>
      {error ? <div className={errorClass}>{error}</div> : null}
      {success ? <div className={successClass}>{success}</div> : null}
    </div>

    {canEdit ? <div className={cardClass}>
      <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Add option</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <Select
          options={groupOptions}
          value={draft.option_group}
          onChange={(value) => setDraft((current) => ({ ...current, option_group: value as Group }))}
        />
        <Input value={draft.option_key} maxLength={64} placeholder="option-key" onChange={(event) => setDraft((value) => ({ ...value, option_key: event.target.value.toLowerCase() }))} />
        <Input className="md:col-span-2" value={draft.label} maxLength={160} placeholder="Public label" onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))} />
        <div className="flex gap-2">
          <Input type="number" value={draft.sort_order} onChange={(event) => setDraft((value) => ({ ...value, sort_order: Number(event.target.value) || 0 }))} />
          <Button onClick={createOption} disabled={busy}>Add</Button>
        </div>
      </div>
    </div> : null}

    <div className={cardClass}>
      <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Configured options</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => <div key={item.id} className={`${itemCardClass} grid gap-3 md:grid-cols-6`}>
          <Select
            options={groupOptions}
            value={item.option_group}
            onChange={(value) => patch(item.id, { option_group: value as Group })}
          />
          <Input value={item.option_key} maxLength={64} onChange={(event) => patch(item.id, { option_key: event.target.value.toLowerCase() })} />
          <Input className="md:col-span-2" value={item.label} maxLength={160} onChange={(event) => patch(item.id, { label: event.target.value })} />
          <div className="flex items-center gap-2">
            <Input type="number" value={item.sort_order} onChange={(event) => patch(item.id, { sort_order: Number(event.target.value) || 0 })} />
            <Checkbox label="Active" checked={item.is_active} onChange={(checked) => patch(item.id, { is_active: checked })} />
          </div>
          <Button variant="outline" onClick={() => saveOption(item)} disabled={busy}>Save</Button>
        </div>)}
        {items.length === 0 ? <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>No business-approved project consultation options are configured yet.</p> : null}
      </div>
    </div>
  </div>;
}