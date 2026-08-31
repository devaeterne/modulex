"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hasPermission } from "@/lib/auth/permissions";
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
  product_type?: string | null;
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
  total_count?: number | string;
};

type RetryAction =
  | { type: "load" }
  | { type: "threshold"; row: StockRow };

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const RPC_PAGE_SIZE = 100;

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

const inputClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus-visible:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numberValue(value));
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function stockState(row: StockRow) {
  const available = numberValue(row.total_available_quantity);
  if (available <= 0) {
    return {
      label: "OUT OF STOCK",
      className: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
    };
  }
  if (row.is_low_stock) {
    return {
      label: "LOW STOCK",
      className: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
    };
  }
  if (numberValue(row.total_reserved_quantity) > 0) {
    return {
      label: "PARTIALLY RESERVED",
      className: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
    };
  }
  return {
    label: "OK",
    className: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
  };
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function reportLowStockError(context: string, error: unknown) {
  console.error(`[Low Stock] ${context}`, error);
}

export default function LowStockManager() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("alerts");
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canEditThresholds = hasPermission(profile?.roles, "products.manage");

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setRetryAction(null);

    const nextRows: StockRow[] = [];
    let nextOffset = 0;
    let loadError: unknown = null;
    do {
      const { data, error } = await supabase.rpc("search_low_stock_page", {
        p_query: "", p_view: "all", p_offset: nextOffset,
        p_limit: RPC_PAGE_SIZE, p_export_all: false,
      });
      if (error) {
        loadError = error;
        break;
      }
      const page = (data ?? []) as StockRow[];
      nextRows.push(...page);
      nextOffset += page.length;
      if (page.length === 0 || nextOffset >= numberValue(page[0]?.total_count)) break;
    } while (true);

    if (loadError) {
      reportLowStockError("stock summary load failed", loadError);
      setRows([]);
      setErrorMessage("Low-stock data is temporarily unavailable. Please try again.");
      setRetryAction({ type: "load" });
    } else {
      setRows(nextRows);
      setThresholdDrafts({});
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const { profile: currentProfile, error } = await getCurrentProfile();
      if (cancelled) return;

      if (error) {
        reportLowStockError("profile load failed", error);
      }
      setProfile(currentProfile ?? null);
      await loadRows();
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [loadRows]);

  const summary = useMemo(() => {
    const alerts = rows.filter((row) => row.is_low_stock);
    return {
      products: rows.length,
      alerts: alerts.length,
      outOfStock: alerts.filter((row) => numberValue(row.total_available_quantity) <= 0).length,
      thresholdsSet: rows.filter((row) => numberValue(row.min_stock_level) > 0).length,
      shortfallByUnit: alerts.reduce<Record<string, number>>((acc, row) => { const unit = row.unit || "Unknown"; acc[unit] = (acc[unit] ?? 0) + Math.max(numberValue(row.min_stock_level) - numberValue(row.total_available_quantity), 0); return acc; }, {}),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === "alerts" && !row.is_low_stock) return false;
      if (view === "unset" && numberValue(row.min_stock_level) > 0) return false;
      if (!normalized) return true;
      return [row.sku, row.barcode, row.product_name, row.brand, row.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [rows, query, view]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const offset = (currentPage - 1) * pageSize;
    return filteredRows.slice(offset, offset + pageSize);
  }, [currentPage, filteredRows, pageSize]);

  const startRow = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, filteredRows.length);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  async function saveThreshold(row: StockRow) {
    const raw = thresholdDrafts[row.product_id] ?? String(numberValue(row.min_stock_level));
    const nextValue = Number(raw);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      setErrorMessage("Minimum stock level must be zero or greater.");
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
      reportLowStockError("minimum stock update failed", error);
      setErrorMessage("We couldn’t update the minimum stock level. Please try again.");
      setRetryAction({ type: "threshold", row });
      setSavingId(null);
      return;
    }

    setSuccessMessage(`${row.sku} minimum stock level updated.`);
    setRetryAction(null);
    setSavingId(null);
    await loadRows();
  }

  async function exportAlerts() {
    setErrorMessage(null);
    const alertRows: StockRow[] = [];
    let exportOffset = 0;
    do {
      const { data, error } = await supabase.rpc("search_low_stock_page", {
        p_query: query.trim(), p_view: "alerts", p_offset: exportOffset,
        p_limit: RPC_PAGE_SIZE, p_export_all: false,
      });
      if (error) {
        reportLowStockError("alert export failed", error);
        setErrorMessage("Low-stock export is temporarily unavailable. Please try again.");
        return;
      }
      const page = (data ?? []) as StockRow[];
      alertRows.push(...page);
      exportOffset += page.length;
      if (page.length === 0 || exportOffset >= numberValue(page[0]?.total_count)) break;
    } while (true);
    const header = [
      "SKU",
      "Product",
      "Brand",
      "Category",
      "On Hand",
      "Reserved",
      "Available",
      "Minimum",
      "Shortfall",
      "Status",
    ];
    const lines = alertRows.map((row) => {
      const state = stockState(row);
      return [
        row.sku,
        row.product_name,
        row.brand ?? "",
        row.category ?? "",
        formatNumber(row.total_quantity),
        formatNumber(row.total_reserved_quantity),
        formatNumber(row.total_available_quantity),
        formatNumber(row.min_stock_level),
        formatNumber(
          Math.max(
            numberValue(row.min_stock_level) - numberValue(row.total_available_quantity),
            0
          )
        ),
        state.label,
      ]
        .map(csvCell)
        .join(",");
    });
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `low-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5" aria-busy={isLoading || Boolean(savingId)}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active Products" value={summary.products} />
        <Metric
          label="Low Stock Alerts"
          value={summary.alerts}
          emphasis={summary.alerts > 0 ? "warning" : "success"}
        />
        <Metric
          label="Out of Stock"
          value={summary.outOfStock}
          emphasis={summary.outOfStock > 0 ? "error" : "default"}
        />
        <Metric label="Thresholds Set" value={`${summary.thresholdsSet}/${summary.products}`} />
        <Metric label="Shortfall by UOM" value={Object.entries(summary.shortfallByUnit).map(([unit, value]) => `${unit}: ${formatNumber(value)}`).join(" · ") || "—"} />
      </div>

      {summary.thresholdsSet === 0 && !isLoading ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
          Minimum stock thresholds are not configured yet. Use <strong>Threshold Not Set</strong> to assign reorder levels; low-stock alerts become operational once those values are defined.
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
                    if (retryAction.type === "load") {
                      void loadRows();
                      return;
                    }
                    void saveThreshold(retryAction.row);
                  }}
                  className={`font-medium text-error-800 underline underline-offset-2 dark:text-error-300 ${focusClass}`}
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
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Low Stock Control</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Availability includes reservations. Minimum levels can be maintained by users with product management access.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="low-stock-search" className="sr-only">
                Search low stock products
              </label>
              <input
                id="low-stock-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search SKU, product, brand..."
                className={`${inputClass} w-full sm:w-[280px]`}
              />
            </div>
            <div>
              <label htmlFor="low-stock-view" className="sr-only">
                Filter low stock products
              </label>
              <select
                id="low-stock-view"
                value={view}
                onChange={(event) => {
                  setView(event.target.value as ViewFilter);
                  setCurrentPage(1);
                }}
                className={`${inputClass} min-w-[180px]`}
              >
                <option value="alerts">Alerts Only</option>
                <option value="all">All Products</option>
                <option value="unset">Threshold Not Set</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void loadRows()}
              className={`h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${focusClass}`}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void exportAlerts()}
              disabled={summary.alerts === 0}
              className={`h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}
            >
              Export Alerts
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {[
                  "Product",
                  "Type / Category",
                  "On Hand",
                  "Reserved",
                  "Available",
                  "Minimum",
                  "Shortfall",
                  "Status",
                  "Action",
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className={`${[
                      "On Hand",
                      "Reserved",
                      "Available",
                      "Minimum",
                      "Shortfall",
                    ].includes(label) ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">
                    Loading stock thresholds...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">
                    {view === "alerts"
                      ? "No low-stock alerts right now."
                      : "No products match the current filters."}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const state = stockState(row);
                  const minimum = numberValue(row.min_stock_level);
                  const available = numberValue(row.total_available_quantity);
                  const draft = thresholdDrafts[row.product_id] ?? String(minimum);
                  const changed = Number(draft) !== minimum;
                  return (
                    <tr key={row.product_id}>
                      <td className="px-5 py-4">
                        <Link
                          href={`/products/${row.product_id}`}
                          className={`text-sm font-semibold text-gray-800 transition hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400 ${focusClass}`}
                        >
                          {row.sku}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">{row.product_name}</p>
                        {row.barcode ? <p className="text-xs text-gray-400">{row.barcode}</p> : null}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <p>{row.product_type || "Standard"} · {row.category || "—"}</p>
                        <p className="text-xs text-gray-400">{row.brand || "No brand"}</p>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                        {formatNumber(row.total_quantity)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">
                        {formatNumber(row.total_reserved_quantity)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">
                        {formatNumber(row.total_available_quantity)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {canEditThresholds ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft}
                            aria-label={`Minimum stock level for ${row.sku}`}
                            onChange={(event) =>
                              setThresholdDrafts((current) => ({
                                ...current,
                                [row.product_id]: event.target.value,
                              }))
                            }
                            className={`${inputClass} w-24 text-right`}
                          />
                        ) : (
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {formatNumber(row.min_stock_level)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.is_low_stock
                          ? formatNumber(Math.max(minimum - available, 0))
                          : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>
                          {state.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {canEditThresholds ? (
                          <button
                            type="button"
                            disabled={!changed || savingId === row.product_id}
                            onClick={() => void saveThreshold(row)}
                            aria-label={`Save minimum stock level for ${row.sku}`}
                            className={`h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${focusClass}`}
                          >
                            {savingId === row.product_id ? "Saving..." : "Save"}
                          </button>
                        ) : (
                          <Link
                            href={`/products/${row.product_id}`}
                            className={`text-sm font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400 ${focusClass}`}
                          >
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center">
            <p aria-live="polite">
              Showing {startRow}–{endRow} of {filteredRows.length} matching products
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="low-stock-page-size" className="text-xs font-medium">
                Rows per page
              </label>
              <select
                id="low-stock-page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
                className={`${inputClass} h-9 min-w-[76px] py-0`}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Low stock pagination">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1 || filteredRows.length === 0}
              className={`h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${focusClass}`}
            >
              Previous
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                aria-current={currentPage === page ? "page" : undefined}
                className={`h-9 min-w-9 rounded-lg px-3 text-sm font-medium transition ${
                  currentPage === page
                    ? "bg-brand-500 text-white"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                } ${focusClass}`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages || filteredRows.length === 0}
              className={`h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${focusClass}`}
            >
              Next
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = "default",
}: {
  label: string;
  value: string | number;
  emphasis?: "default" | "success" | "warning" | "error";
}) {
  const valueClass =
    emphasis === "error"
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
