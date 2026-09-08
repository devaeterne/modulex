"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import Alert from "@/components/ui/alert/Alert";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";

export default function AdministrativeFeeSettings() {
  const [value, setValue] = useState("3.000");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const [{ profile, error: profileError }, settingsResult] = await Promise.all([
        getCurrentProfile(),
        supabase.from("general_settings").select("administrative_fee_default_percent").eq("id", 1).single(),
      ]);
      if (profileError || settingsResult.error) {
        setMessage({ variant: "error", text: "Administrative Fee settings could not be loaded." });
        setLoading(false);
        return;
      }
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      setValue(Number(settingsResult.data.administrative_fee_default_percent ?? 3).toFixed(3));
      setLoading(false);
    }
    void load();
  }, []);

  async function save() {
    const percent = Number(value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setMessage({ variant: "error", text: "Administrative Fee must be between 0% and 100%." });
      return;
    }

    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("general_settings")
      .update({ administrative_fee_default_percent: Number(percent.toFixed(3)) })
      .eq("id", 1);
    setSaving(false);

    if (error) {
      setMessage({ variant: "error", text: "Administrative Fee default could not be saved." });
      return;
    }
    setValue(percent.toFixed(3));
    setMessage({ variant: "success", text: "Administrative Fee default saved. Existing Orders are unchanged." });
  }

  return (
    <ComponentCard
      title="Administrative Fee"
      desc="Internal sell/revenue adjustment. New Orders snapshot this default; existing Orders never change when the company default changes."
    >
      <div className="max-w-xl space-y-4">
        {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Saved" : "Unable to save"} message={message.text} /> : null}
        <div>
          <Label htmlFor="administrative-fee-default-percent">Default Administrative Fee (%)</Label>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <Input
                id="administrative-fee-default-percent"
                type="number"
                min="0"
                max="100"
                step="0.001"
                inputMode="decimal"
                value={value}
                disabled={loading || saving || !canEdit}
                onChange={(event) => {
                  setValue(event.target.value);
                  setMessage(null);
                }}
                hint="Default 3.000%. This is internal pricing and is never shown as a separate customer-facing fee line."
              />
            </div>
            {canEdit ? <Button disabled={loading || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Default"}</Button> : null}
          </div>
        </div>
      </div>
    </ComponentCard>
  );
}
