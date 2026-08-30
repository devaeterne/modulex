"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hasPermission } from "@/lib/auth/permissions";
import { downloadCsv } from "@/lib/reports/csv";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";

type ViewFilter = "alerts" | "all" | "unset";

type StockRow = {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  unit: string;
  min_stock_level: number | string;
  product_status: string;
  location_count: number | string;
  warehouse_count: number | string;
  total_quantity: number | string;
  total_reserved_quantity: number | string;
  total_available_quantity: number | string;
  is_low_stock: boolean;
  stock_status: string;
  last_inventory_update: string | null;
  threshold_configured: boolean;
  is_out_of_stock: boolean;
  is_stock_alert: boolean;
  total_count: number | string;
};

type LowStockSummary = {
  summary_active_products: number | string;
  summary_stock_alerts: number | string;
  summary_out_of_stock: number | string;
  summary_thresholds_set: number | string;
  summary_threshold_shortfall: number | string;
};

type RetryAction = { type: "load" } | { type: "threshold"; row: StockRow };

const PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 500;
const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";
const inputClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus-visible:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return numberFormatter.format(n(value));
}

function stockState(row: StockRow) {
  switch (row.stock_status) {
    case "OUT_OF_STOCK":
      return {
        label: "OUT OF STOCK",
        className: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
      };
    case "LOW_STOCK":
      return {
        label: "LOW STOCK",
        className: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
      };
    case "PARTIALLY_RESERVED":
      return {
        label: "PARTIALLY RESERVED",
        className: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
      };
    default:
      return {
        label: "OK",
        className: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
      };
  }
}

function reportError(context: string, error: unknown) {
  console.error(`[Low Stock] ${context}`, error);
}

export default function LowStockManager() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("alerts");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedView, setAppliedView] = useState<ViewFilter>("alerts");
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<LowStockSummary>({
    summary_active_products: 0,
    summary_stock_alerts: 0,
    summary_out_of_stock: 0,
    summary_thresholds_set: 0,
    summary_threshold_shortfall: 0,
  });
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canEditThresholds = hasPermission(profile?.roles, "products.manage");

  const loadPage = useCallback(async (nextQuery: string, nextView: ViewFilter, nextOffset: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    setRetryAction(null);

    const [pageResult, summaryResult] = await Promise.all([
      supabase.rpc("search_low_stock_page", {
        p_query: nextQuery || null,
        p_view: nextView,
        p_offset: nextOffset,
        p_limit: PAGE_SIZE,
      }),
      supabase.rpc("get_low_stock_summary"),
    ]);

    const error = pageResult.error || summaryResult.error;
    if (error) {
      reportError("load failed", error);
      setRows([]);
      setTotalCount(0);
      setErrorMessage("Low-stock data is temporarily unavailable. Please try again.");
      setRetryAction({ type: "load" });
      setIsLoading(false);
      return;
    }

    const nextRows = (pageResult.data as StockRow[]) ?? [];
    const nextSummary = ((summaryResult.data as LowStockSummary[]) ?? [])[0];
    setRows(nextRows);
    setTotalCount(n(nextRows[0]?.total_count));
    setSummary(
      nextSummary ?? {
        summary_active_products: 0,
        summary_stock_alerts: 0,
        summary_out_of_stock: 0,
        summary_thresholds_set: 0,
        summary_threshold_shortfall: 0,
      }
    );
    setOffset(nextOffset);
    setThresholdDrafts({});
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const { profile: currentProfile, error } = await getCurrentProfile();
      if (cancelled) return;
      if (error) reportError("profile load failed", error);
      setProfile(currentProfile ?? null);
      await loadPage("", "alerts", 0);
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstVisible = totalCount === 0 ? 0 : offset + 1;
  const lastVisible = Math.min(offset + rows.length, totalCount);

  const configuredRatio = useMemo(
    () => `${formatNumber(summary.summary_thresholds_set)}/${formatNumber(summary.summary_active_products)}`,
    [summary.summary_active_products, summary.summary_thresholds_set]
  );

  function applyFilters() {
    const nextQuery = query.trim();
    setAppliedQuery(nextQuery);
    setAppliedView(view);
    void loadPage(nextQuery, view, 0);
  }

  function refresh() {
    void loadPage(appliedQuery, appliedView, offset);
  }

  async function saveThreshold(row: StockRow) {
    const raw = thresholdDrafts[row.product_id] ?? String(n(row.min_stock_level));
    const nextValue = Number(raw);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      setErrorMessage("Minimum stock level must be zero or greater. Zero means threshold is unset.");
      setRetryAction(null);
      return;
    }

    setSavingId(row.product_id);
    setErrorMessage(null);
    setRetryAction(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("products")
      .update({ min_stock_level: nextValue })
      .eq("id", row.product_id);

    if (error) {
      reportError("minimum stock update failed", error);
      setErrorMessage("We couldn’t update the minimum stock level. Please try again.");
      setRetryAction({ type: "threshold", row });
      setSavingId(null);
      return;
    }

    setSuccessMessage(
      nextValue === 0
        ? `${row.sku} threshold cleared.`
        : `${row.sku} minimum stock level updated.`
    );
    setSavingId(null);
    await loadPage(appliedQuery, appliedView, 0);
  }

  async function exportAlerts() {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const allRows: StockRow[] = [];
      let exportOffset = 0;
      let exportTotal = Number.POSITIVE_INFINITY;

      while (exportOffset < exportTotal) {
        const { data, error } = await supabase.rpc("search_low_stock_page", {
          p_query: appliedQuery || null,
          p_view: "alerts",
          p_offset: exportOffset,
          p_limit: EXPORT_PAGE_SIZE,
        });
        if (error) throw error;
        const page = (data as StockRow[]) ?? [];
        exportTotal = n(page[0]?.total_count);
        allRows.push(...page);
        if (page.length === 0) break;
        exportOffset += page.length;
      }

      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(
        `low-stock-alerts-${date}.csv`,
        ["SKU", "Product", "Brand", "Category", "On Hand", "Reserved", "Available", "Minimum", "Threshold", "Status"],
        allRows.map((row) => [
          row.sku,
          row.product_name,
          row.brand ?? "",
          row.category ?? "",
          row.total_quantity,
          row.total_reserved_quantity,
          row.total_available_quantity,
          row.min_stock_level,
          row.threshold_configured ? "Configured" : "Unset",
          stockState(row).label,
        ])
      );
    } catch (error) {
      reportError("export failed", error);
      setErrorMessage("Low-stock alerts could not be exported. Please try again.");
      setRetryAction(null);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5" aria-busy={isLoading || Boolean(savingId)}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active Products" value={formatNumber(summary.summary_active_products)} />
        <Metric
          label="Stock Alerts"
          value={formatNumber(summary.summary_stock_alerts)}
          emphasis={n(summary.summary_stock_alerts) > 0 ? "warning" : "success"}
        />
        <Metric
          label="Out of Stock"
          value={formatNumber(summary.summary_out_of_stock)}
          emphasis={n(summary.summary_out_of_stock) > 0 ? "error" : "default"}
        />
        <Metric label="Thresholds Set" value={configuredRatio} />
        <Metric label="Threshold Shortfall" value={formatNumber(summary.summary_threshold_shortfall)} />
      </div>

      {n(summary.summary_thresholds_set) === 0 && !isLoading ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
          Minimum stock thresholds are not configured yet. <strong>0 means unset.</strong> Out-of-stock alerts remain active even without a threshold; Low Stock starts only after a positive threshold is configured.
        </div>
      ) : null}

      <div aria-live="polite" className="space-y-3">
        {errorMessage ? (
          <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{errorMessage}</span>
              {retryAction ? (
                <button
                  type="button"
                  onClick={() => {
                    if (retryAction.type === "load") refresh();
                    else void saveThreshold(retryAction.row);
                  }}
                  className={`font-medium underline underline-offset-2 ${focusClass}`}
                >
                  {retryAction.type === "load" ? "Retry" : "Retry update"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {successMessage}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Low Stock Control</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Available = On Hand − Reserved. Out of Stock is independent of thresholds; Low Stock requires a positive minimum.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters();
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div>
              <label htmlFor="low-stock-search" className="sr-only">Search low stock products</label>
              <input
                id="low-stock-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search SKU, product, brand..."
                className={`${inputClass} w-full sm:w-[280px]`}
              />
            </div>
            <div>
              <label htmlFor="low-stock-view" className="sr-only">Filter low stock products</label>
              <select
                id="low-stock-view"
                value={view}
                onChange={(event) => setView(event.target.value as ViewFilter)}
                className={`${inputClass} min-w-[180px]`}
              >
                <option value="alerts">Stock Alerts</option>
                <option value="all">All Products</option>
                <option value="unset">Threshold Not Set</option>
              </select>
            </div>
            <button type="submit" className={`h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-gray-900 ${focusClass}`}>Apply</button>
            <button type="button" onClick={refresh} className={`h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>Refresh</button>
            <button
              type="button"
              onClick={() => void exportAlerts()}
              disabled={n(summary.summary_stock_alerts) === 0 || isExporting}
              className={`h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}
            >
              {isExporting ? "Exporting..." : "Export Alerts"}
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {["Product", "Category", "On Hand", "Reserved", "Available", "Minimum", "Threshold", "Status", "Action"].map((label) => (
                  <th key={label} scope="col" className={`${["On Hand", "Reserved", "Available", "Minimum"].includes(label) ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">Loading stock thresholds...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">No products match the current filters.</td></tr>
              ) : rows.map((row) => {
                const state = stockState(row);
                const minimum = n(row.min_stock_level);
                const draft = thresholdDrafts[row.product_id] ?? String(minimum);
                const changed = Number(draft) !== minimum;
                return (
                  <tr key={row.product_id}>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{row.sku}</p>
                      <p className="text-xs text-gray-500">{row.product_name}</p>
                      {row.barcode ? <p className="text-xs text-gray-400">{row.barcode}</p> : null}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      <p>{row.category || "—"}</p><p className="text-xs text-gray-400">{row.brand || "No brand"}</p>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{formatNumber(row.total_quantity)}</td>
                    <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{formatNumber(row.total_reserved_quantity)}</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{formatNumber(row.total_available_quantity)}</td>
                    <td className="px-5 py-4 text-right">
                      {canEditThresholds ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft}
                          aria-label={`Minimum stock level for ${row.sku}`}
                          onChange={(event) => setThresholdDrafts((current) => ({ ...current, [row.product_id]: event.target.value }))}
                          className={`${inputClass} w-24 text-right`}
                        />
                      ) : <span className="text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.min_stock_level)}</span>}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.threshold_configured ? "Configured" : "Unset"}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>{state.label}</span></td>
                    <td className="px-5 py-4">
                      {canEditThresholds ? (
                        <button
                          type="button"
                          disabled={!changed || savingId === row.product_id}
                          onClick={() => void saveThreshold(row)}
                          className={`h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}
                        >
                          {savingId === row.product_id ? "Saving..." : "Save"}
                        </button>
                      ) : <span className="text-xs text-gray-400">View only</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {firstVisible}–{lastVisible} of {totalCount}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0 || isLoading}
              onClick={() => void loadPage(appliedQuery, appliedView, Math.max(0, offset - PAGE_SIZE))}
              className={`h-9 rounded-lg border border-gray-200 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 ${focusClass}`}
            >Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= totalCount || isLoading}
              onClick={() => void loadPage(appliedQuery, appliedView, offset + PAGE_SIZE)}
              className={`h-9 rounded-lg border border-gray-200 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 ${focusClass}`}
            >Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, emphasis = "default" }: { label: string; value: string; emphasis?: "default" | "success" | "warning" | "error" }) {
  const valueClass = emphasis === "error"
    ? "text-error-600 dark:text-error-400"
    : emphasis === "warning"
      ? "text-warning-600 dark:text-warning-400"
      : emphasis === "success"
        ? "text-success-600 dark:text-success-400"
        : "text-gray-800 dark:text-white/90";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
