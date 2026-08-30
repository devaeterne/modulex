"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STORE_CHROME_DESTINATIONS,
  STORE_CHROME_PLACEMENTS,
  loadStoreChromeItems,
  saveStoreChromeItem,
  storeChromeDestinationHref,
  type StoreChromeDestinationKey,
  type StoreChromeItem,
  type StoreChromeStatus,
} from "@/lib/store/chrome";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const primaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";

function StatusBadge({ status }: { status: StoreChromeStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        status === "published"
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
          : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"
      }`}
    >
      {status}
    </span>
  );
}

export default function StoreChromeSettings({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<StoreChromeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadStoreChromeItems());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Store navigation and footer links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () => STORE_CHROME_PLACEMENTS.map((placement) => ({
      ...placement,
      items: items.filter((item) => item.placement === placement.value),
    })),
    [items],
  );

  function patchItem<K extends keyof StoreChromeItem>(id: string, key: K, value: StoreChromeItem[K]) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
    setSuccess(null);
  }

  async function persist(item: StoreChromeItem, status: StoreChromeStatus) {
    setBusyId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await saveStoreChromeItem(
        item.id,
        {
          placement: item.placement,
          destinationKey: item.destinationKey,
          label: item.label,
          sortOrder: item.sortOrder,
        },
        status,
      );
      await load();
      setSuccess(status === "published" ? `${item.label.trim()} published.` : `${item.label.trim()} saved as draft.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Store chrome update failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        Loading navigation and footer links...
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Navigation & Footer Links</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Manage approved public link labels, destinations, order and publication state. Destinations are restricted to code-owned Oakwell routes; arbitrary URLs and portal routes are not available here.
        </p>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
          {success}
        </div>
      ) : null}

      <div className="mt-5 space-y-6">
        {grouped.map((group) => (
          <div key={group.value}>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{group.label}</h3>
            <div className="mt-3 space-y-3">
              {group.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No managed links are configured for this placement.
                </p>
              ) : null}

              {group.items.map((item) => {
                const disabled = !canEdit || busyId === item.id;
                const destinationHref = storeChromeDestinationHref(item.destinationKey);

                return (
                  <div key={item.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <StatusBadge status={item.status} />
                      <span className="text-xs text-gray-400">
                        {destinationHref ?? "Unsupported destination"}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px]">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Label</span>
                        <input
                          type="text"
                          value={item.label}
                          onChange={(event) => patchItem(item.id, "label", event.target.value)}
                          disabled={disabled}
                          maxLength={80}
                          className={inputClass}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Destination</span>
                        <select
                          value={item.destinationKey}
                          onChange={(event) => patchItem(
                            item.id,
                            "destinationKey",
                            event.target.value as StoreChromeDestinationKey,
                          )}
                          disabled={disabled}
                          className={inputClass}
                        >
                          {STORE_CHROME_DESTINATIONS.map((destination) => (
                            <option key={destination.key} value={destination.key}>
                              {destination.label} — {destination.href}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort order</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.sortOrder}
                          onChange={(event) => patchItem(item.id, "sortOrder", Number(event.target.value))}
                          disabled={disabled}
                          className={inputClass}
                        />
                      </label>
                    </div>

                    {canEdit ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void persist(item, "draft")}
                          className={secondaryButton}
                        >
                          Save draft
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void persist(item, "published")}
                          className={primaryButton}
                        >
                          {item.status === "published" ? "Publish changes" : "Publish"}
                        </button>
                        {item.status === "published" ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void persist(item, "draft")}
                            className={secondaryButton}
                          >
                            Unpublish
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
