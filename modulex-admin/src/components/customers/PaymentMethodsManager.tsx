"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import type { PaymentMethod } from "@/lib/customers/types";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

function makeSystemKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `payment_${Date.now()}`;
}

export default function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCommission, setNewCommission] = useState("0");

  const sorted = useMemo(
    () => [...methods].sort((a, b) => a.sort_order - b.sort_order),
    [methods]
  );

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("payment_methods")
      .select("id, system_key, name, commission_percent, sort_order, is_active, created_at, updated_at")
      .order("sort_order");

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setMethods((data ?? []) as PaymentMethod[]);
    setIsLoading(false);
  }

  useEffect(() => {
    async function init() {
      const { profile, error } = await getCurrentProfile();
      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }
      setCanEdit(hasPermission(profile?.roles, "finance.manage"));
      await load();
    }
    init();
  }, []);

  async function addMethod() {
    const name = newName.trim();
    const commission = Number(newCommission || 0);
    if (!name) return setErrorMessage("Payment method name is required.");
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      return setErrorMessage("Commission must be between 0 and 100%.");
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextSort = sorted.length ? Math.max(...sorted.map((m) => m.sort_order)) + 10 : 10;
    const { error } = await supabase.from("payment_methods").insert({
      system_key: makeSystemKey(name),
      name,
      commission_percent: commission,
      sort_order: nextSort,
      is_active: true,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setNewName("");
    setNewCommission("0");
    await load();
    setSuccessMessage("Payment method added.");
    setIsSaving(false);
  }

  async function saveMethod(method: PaymentMethod) {
    const commission = Number(method.commission_percent);
    if (!method.name.trim()) return setErrorMessage("Payment method name cannot be empty.");
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      return setErrorMessage("Commission must be between 0 and 100%.");
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("payment_methods")
      .update({
        name: method.name.trim(),
        commission_percent: commission,
        is_active: method.is_active,
        sort_order: method.sort_order,
      })
      .eq("id", method.id);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    await load();
    setSuccessMessage("Payment method saved.");
    setIsSaving(false);
  }

  async function move(method: PaymentMethod, direction: -1 | 1) {
    const index = sorted.findIndex((item) => item.id === method.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return;

    const other = sorted[swapIndex];
    setIsSaving(true);
    const first = await supabase.from("payment_methods").update({ sort_order: other.sort_order }).eq("id", method.id);
    if (first.error) {
      setErrorMessage(first.error.message);
      setIsSaving(false);
      return;
    }
    const second = await supabase.from("payment_methods").update({ sort_order: method.sort_order }).eq("id", other.id);
    if (second.error) {
      setErrorMessage(second.error.message);
      setIsSaving(false);
      return;
    }
    await load();
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
          <p className="text-sm text-gray-500">Loading payment methods...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Payment Methods</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage the payment methods available on customer orders and the commission added to each method.
        </p>
      </div>

      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{successMessage}</div>}

      {canEdit && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Add Payment Method</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Card, Cash, Bank Transfer" className={inputClass} />
            <div className="relative">
              <input value={newCommission} onChange={(e) => setNewCommission(e.target.value)} inputMode="decimal" className={`${inputClass} pr-8`} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">%</span>
            </div>
            <button disabled={isSaving} onClick={addMethod} className={primaryButtonClass}>Add Method</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {['Order','Payment Method','System Key','Commission','Status','Actions'].map((label) => (
                  <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sorted.map((method, index) => (
                <tr key={method.id}>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button disabled={!canEdit || isSaving || index === 0} onClick={() => move(method, -1)} className={secondaryButtonClass}>↑</button>
                      <button disabled={!canEdit || isSaving || index === sorted.length - 1} onClick={() => move(method, 1)} className={secondaryButtonClass}>↓</button>
                    </div>
                  </td>
                  <td className="min-w-[240px] px-4 py-3">
                    <input disabled={!canEdit} value={method.name} onChange={(e) => setMethods((current) => current.map((item) => item.id === method.id ? { ...item, name: e.target.value } : item))} className={inputClass} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{method.system_key}</td>
                  <td className="w-[160px] px-4 py-3">
                    <div className="relative">
                      <input disabled={!canEdit} value={String(method.commission_percent)} onChange={(e) => setMethods((current) => current.map((item) => item.id === method.id ? { ...item, commission_percent: e.target.value } : item))} inputMode="decimal" className={`${inputClass} pr-8`} />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <input disabled={!canEdit} type="checkbox" checked={method.is_active} onChange={(e) => setMethods((current) => current.map((item) => item.id === method.id ? { ...item, is_active: e.target.checked } : item))} className="h-4 w-4 accent-brand-500" />
                      {method.is_active ? 'Active' : 'Inactive'}
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    {canEdit && <button disabled={isSaving} onClick={() => saveMethod(method)} className={primaryButtonClass}>Save</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
