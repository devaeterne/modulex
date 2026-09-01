"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { supabase } from "@/lib/supabase/client";

type ReviewStatus = "PENDING" | "APPROVED" | "IGNORED";
type ChangeState = "NEW" | "UPDATED" | "UNCHANGED";

type VendorCatalogItem = {
  id: string;
  vendor_code: string;
  external_id: string;
  sku: string | null;
  title: string;
  product_url: string;
  vendor_price_reference: number | null;
  vendor_currency: string | null;
  change_state: ChangeState;
  review_status: ReviewStatus;
  canonical_product_id: string | null;
  last_seen_at: string;
};

type SyncResult = {
  vendorCode: string;
  status: "SUCCEEDED" | "FAILED";
  counts: {
    discovered: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
  };
};

type SyncResponse = {
  status?: "SUCCEEDED" | "PARTIAL_FAILURE";
  results?: SyncResult[];
  error?: string;
};

const REVIEW_STATUSES: ReviewStatus[] = ["PENDING", "APPROVED", "IGNORED"];
const CHANGE_FILTERS: Array<{ state: ChangeState; label: string }> = [
  { state: "NEW", label: "New" },
  { state: "UPDATED", label: "Updated" },
  { state: "UNCHANGED", label: "Synced / Unchanged" },
];

function formatPrice(item: VendorCatalogItem) {
  if (item.vendor_price_reference === null) return "—";
  const currency = item.vendor_currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(item.vendor_price_reference);
  } catch {
    return `${item.vendor_price_reference} ${currency}`;
  }
}

function badgeClass(state: ChangeState) {
  if (state === "NEW") return "bg-success-50 text-success-700";
  if (state === "UPDATED") return "bg-warning-50 text-warning-700";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.05] dark:text-gray-300";
}

export default function VendorImportsPage() {
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("PENDING");
  const [changeStates, setChangeStates] = useState<ChangeState[]>(["NEW", "UPDATED"]);
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (changeStates.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("vendor_catalog_items")
      .select(
        "id,vendor_code,external_id,sku,title,product_url,vendor_price_reference,vendor_currency,change_state,review_status,canonical_product_id,last_seen_at"
      )
      .eq("review_status", reviewStatus)
      .in("change_state", changeStates)
      .order("last_seen_at", { ascending: false })
      .limit(100);

    if (queryError) {
      setError(queryError.message);
      setItems([]);
    } else {
      setItems((data ?? []) as VendorCatalogItem[]);
    }
    setLoading(false);
  }, [changeStates, reviewStatus]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const pendingCount = useMemo(
    () => (reviewStatus === "PENDING" ? items.length : null),
    [items.length, reviewStatus]
  );

  function toggleChangeState(state: ChangeState) {
    setChangeStates((current) =>
      current.includes(state)
        ? current.filter((item) => item !== state)
        : [...current, state]
    );
  }

  async function runVendorSync() {
    setSyncing(true);
    setError(null);
    setSyncMessage(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your admin session could not be verified. Please sign in again.");
      }

      const response = await fetch("/api/vendor-catalog/sync", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ vendors: ["karran", "ruvati"] }),
      });

      const payload = (await response.json().catch(() => ({}))) as SyncResponse;
      if (!response.ok) {
        throw new Error(payload.error || `Vendor sync failed with HTTP ${response.status}.`);
      }

      const results = payload.results ?? [];
      const totals = results.reduce(
        (sum, result) => ({
          discovered: sum.discovered + result.counts.discovered,
          created: sum.created + result.counts.created,
          updated: sum.updated + result.counts.updated,
          unchanged: sum.unchanged + result.counts.unchanged,
          failed: sum.failed + result.counts.failed,
        }),
        { discovered: 0, created: 0, updated: 0, unchanged: 0, failed: 0 }
      );

      setSyncMessage(
        `Sync complete: ${totals.discovered} discovered, ${totals.created} new, ${totals.updated} updated, ${totals.unchanged} unchanged, ${totals.failed} failed.`
      );
      await loadItems();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function setStatus(itemId: string, nextStatus: ReviewStatus) {
    setUpdatingId(itemId);
    setError(null);

    const { error: updateError } = await supabase
      .from("vendor_catalog_items")
      .update({ review_status: nextStatus })
      .eq("id", itemId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setItems((current) => current.filter((item) => item.id !== itemId));
    }
    setUpdatingId(null);
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Vendor Import Review" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Vendor Import Review</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review vendor catalog discoveries before linking them to canonical Modulex products.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runVendorSync()}
          disabled={syncing}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? "Running Vendor Sync…" : "Run Vendor Sync"}
        </button>
      </div>

      <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/10 dark:text-warning-200">
        Vendor prices are reference data only. APPROVED does not publish or overwrite a Modulex product.
        Store publication still requires a Modulex selling price greater than zero.
      </div>

      {syncMessage ? (
        <div className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-800 dark:border-success-900/50 dark:bg-success-900/10 dark:text-success-200">
          {syncMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2" aria-label="Review status filters">
              {REVIEW_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setReviewStatus(status)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    reviewStatus === status
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {pendingCount === null ? `${items.length} records` : `${pendingCount} pending records`} · latest 100 matches
            </p>
          </div>

          <fieldset className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <legend className="sr-only">Catalog change filters</legend>
            {CHANGE_FILTERS.map(({ state, label }) => (
              <label
                key={state}
                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={changeStates.includes(state)}
                  onChange={() => toggleChangeState(state)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        </div>

        {error ? (
          <div className="m-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/10 dark:text-error-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading vendor imports…</div>
        ) : changeStates.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Select at least one catalog state to show vendor imports.
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No matching {reviewStatus.toLowerCase()} vendor imports.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Vendor price</th>
                  <th className="px-4 py-3 font-medium">Canonical link</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                  <th className="px-4 py-3 text-right font-medium">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-3 font-medium uppercase text-gray-700 dark:text-gray-200">
                      {item.vendor_code}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(item.change_state)}`}>
                        {item.change_state}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {item.sku || "—"}
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <a
                        href={item.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        {item.title}
                      </a>
                      <div className="mt-1 truncate text-xs text-gray-400">{item.external_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{formatPrice(item)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {item.canonical_product_id || "Not linked"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(item.last_seen_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {reviewStatus !== "APPROVED" ? (
                          <button
                            type="button"
                            disabled={updatingId === item.id}
                            onClick={() => void setStatus(item.id, "APPROVED")}
                            className="rounded-lg border border-success-200 px-2.5 py-1.5 text-xs font-semibold text-success-700 hover:bg-success-50 disabled:opacity-50 dark:border-success-900/60 dark:text-success-400"
                          >
                            APPROVED
                          </button>
                        ) : null}
                        {reviewStatus !== "IGNORED" ? (
                          <button
                            type="button"
                            disabled={updatingId === item.id}
                            onClick={() => void setStatus(item.id, "IGNORED")}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
                          >
                            IGNORED
                          </button>
                        ) : null}
                        {reviewStatus !== "PENDING" ? (
                          <button
                            type="button"
                            disabled={updatingId === item.id}
                            onClick={() => void setStatus(item.id, "PENDING")}
                            className="rounded-lg border border-warning-200 px-2.5 py-1.5 text-xs font-semibold text-warning-700 hover:bg-warning-50 disabled:opacity-50 dark:border-warning-900/60 dark:text-warning-300"
                          >
                            PENDING
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
