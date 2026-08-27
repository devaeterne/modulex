"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

type TaxRule = {
  fulfillment_type: "pickup" | "delivery" | "delivery_installation";
  label: string;
  tax_rate: string | number | null;
  is_active: boolean;
  notes: string | null;
};

export default function TaxRulesSettings() {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setErrorMessage(profileError?.message || "Active staff profile is required.");
      setIsLoading(false);
      return;
    }
    setCanEdit(hasPermission(profile.role, "finance.manage"));
    const { data, error } = await supabase
      .from("order_tax_rules")
      .select("fulfillment_type, label, tax_rate, is_active, notes")
      .order("fulfillment_type");
    if (error) setErrorMessage(error.message);
    else setRules((data ?? []) as TaxRule[]);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function updateRule(type: TaxRule["fulfillment_type"], values: Partial<TaxRule>) {
    setRules((current) =>
      current.map((rule) =>
        rule.fulfillment_type === type ? { ...rule, ...values } : rule
      )
    );
  }

  async function save() {
    if (!canEdit || isSaving) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    for (const rule of rules) {
      const rate =
        rule.tax_rate === null || String(rule.tax_rate).trim() === ""
          ? null
          : Number(rule.tax_rate);
      if (
        rule.is_active &&
        (rate === null || !Number.isFinite(rate) || rate < 0 || rate > 100)
      ) {
        setErrorMessage(
          `${rule.label}: enter a tax rate between 0 and 100 before enabling the rule.`
        );
        return;
      }
    }

    setIsSaving(true);
    for (const rule of rules) {
      const rate =
        rule.tax_rate === null || String(rule.tax_rate).trim() === ""
          ? null
          : Number(rule.tax_rate);
      const { error } = await supabase
        .from("order_tax_rules")
        .update({
          tax_rate: rate,
          is_active: rule.is_active,
          notes: rule.notes?.trim() || null,
        })
        .eq("fulfillment_type", rule.fulfillment_type);
      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }
    }

    setSuccessMessage("Tax rules saved.");
    setIsSaving(false);
    await load();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
        Loading tax rules...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {errorMessage && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
          {successMessage}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Fulfillment Tax Rules
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Configure the rate the application expects for each fulfillment mode.
            No tax rate is prefilled by the system. When an active rule exists,
            a Sales user who tries to use a different rate is routed to approval.
          </p>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead>
              <tr>
                {["Fulfillment", "Tax Rate (%)", "Active", "Notes"].map((label) => (
                  <th key={label} className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rules.map((rule) => (
                <tr key={rule.fulfillment_type}>
                  <td className="px-3 py-4">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{rule.label}</p>
                    <p className="mt-1 text-xs text-gray-400">{rule.fulfillment_type.replaceAll("_", " ")}</p>
                  </td>
                  <td className="px-3 py-4">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      value={rule.tax_rate ?? ""}
                      disabled={!canEdit}
                      onChange={(event) => updateRule(rule.fulfillment_type, { tax_rate: event.target.value })}
                      placeholder="e.g. 6.000"
                      className="h-10 w-40 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </td>
                  <td className="px-3 py-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={rule.is_active}
                        disabled={!canEdit}
                        onChange={(event) => updateRule(rule.fulfillment_type, { is_active: event.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Use rule
                    </label>
                  </td>
                  <td className="px-3 py-4">
                    <input
                      value={rule.notes ?? ""}
                      disabled={!canEdit}
                      onChange={(event) => updateRule(rule.fulfillment_type, { notes: event.target.value })}
                      placeholder="Optional internal note"
                      className="h-10 min-w-72 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-xl bg-warning-50 px-4 py-3 text-sm leading-6 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          Use rates confirmed for the company’s actual tax jurisdiction and transaction type.
          The application enforces the configured business rule; it does not determine US tax law automatically.
        </div>

        {canEdit && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={isSaving}
              className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Tax Rules"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
