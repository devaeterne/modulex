"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { updateCustomerOrderCustomerReference } from "@/lib/customers/order-reference-domain";

type Props = {
  customerId: string;
  orderId: string;
};

function normalize(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export default function CustomerOrderReferenceEditor({ customerId, orderId }: Props) {
  const [reference, setReference] = useState("");
  const [savedReference, setSavedReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReference() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("customer_orders")
        .select("customer_reference")
        .eq("id", orderId)
        .eq("customer_id", customerId)
        .single();

      if (!active) return;

      if (loadError) {
        setError(loadError.message);
      } else {
        const current = normalize(data?.customer_reference);
        setReference(current);
        setSavedReference(current);
      }
      setLoading(false);
    }

    void loadReference();
    return () => {
      active = false;
    };
  }, [customerId, orderId]);

  const changed = useMemo(
    () => normalize(reference) !== normalize(savedReference),
    [reference, savedReference]
  );

  async function saveReference() {
    if (!changed || saving) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const revision = await updateCustomerOrderCustomerReference({
        orderId,
        customerReference: reference,
        revisionReason: "Customer reference updated from Edit Order",
      });

      if (revision === 0) {
        setMessage("Customer Reference update was submitted for approval.");
      } else {
        const normalized = normalize(reference);
        setReference(normalized);
        setSavedReference(normalized);
        setMessage(
          revision < 0
            ? "Customer Reference is already up to date."
            : `Customer Reference saved as revision ${revision}.`
        );
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Customer Reference could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Customer Reference</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Save this field independently. Products, Vendor Cabinet package data, pricing, and totals are not changed.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="order-customer-reference-only" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Customer Reference
          </label>
          <input
            id="order-customer-reference-only"
            type="text"
            value={reference}
            disabled={loading || saving}
            onChange={(event) => {
              setReference(event.target.value);
              setMessage(null);
              setError(null);
            }}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-white/90"
            placeholder={loading ? "Loading..." : "Customer PO / reference"}
          />
        </div>
        <button
          type="button"
          onClick={() => void saveReference()}
          disabled={loading || saving || !changed}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Customer Reference"}
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-success-600 dark:text-success-400">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </section>
  );
}
