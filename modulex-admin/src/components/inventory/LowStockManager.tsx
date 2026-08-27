"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

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
};

const inputClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return numberValue(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function stockState(row: StockRow) {
  const available = numberValue(row.total_available_quantity);
  if (available <= 0) return { label: "OUT OF STOCK", className: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400" };
  if (row.is_low_stock) return { label: "LOW STOCK", className: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400" };
  if (numberValue(row.total_reserved_quantity) > 0) return { label: "PARTIALLY RESERVED", className: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" };
  return { label: "OK", className: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" };
}

export default function LowStockManager() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("alerts");
  const [canEditThresholds, setCanEditThresholds] = useState(false);
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadRows() {
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from("v_product_stock_summary")
      .select("product_id,sku,barcode,product_name,brand,category,unit,min_stock_level,product_status,location_count,warehouse_count,total_quantity,total_reserved_quantity,total_available_quantity,is_low_stock,stock_status,last_inventory_update")
      .eq("product_status", "active")
      .order("sku")
      .limit(1000);

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
    } else {
      setRows((data ?? []) as StockRow[]);
      setThresholdDrafts({});
    }
    setIsLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const { profile } = await getCurrentProfile();
      setCanEditThresholds(["super_admin", "admin"].includes(profile?.role ?? ""));
      await loadRows();
    }
    initialize();
  }, []);

  const summary = useMemo(() => {
    const alerts = rows.filter((row) => row.is_low_stock);
    return {
      products: rows.length,
      alerts: alerts.length,
      outOfStock: alerts.filter((row) => numberValue(row.total_available_quantity) <= 0).length,
      thresholdsSet: rows.filter((row) => numberValue(row.min_stock_level) > 0).length,
      shortfall: alerts.reduce((sum, row) => sum + Math.max(numberValue(row.min_stock_level) - numberValue(row.total_available_quantity), 0), 0),
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

  async function saveThreshold(row: StockRow) {
    const raw = thresholdDrafts[row.product_id] ?? String(numberValue(row.min_stock_level));
    const nextValue = Number(raw);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      setErrorMessage("Minimum stock level must be zero or greater.");
      return;
    }

    setSavingId(row.product_id);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.from("products").update({ min_stock_level: nextValue }).eq("id", row.product_id);
    if (error) {
      setErrorMessage(error.message);
      setSavingId(null);
      return;
    }

    setSuccessMessage(`${row.sku} minimum stock level updated.`);
    setSavingId(null);
    await loadRows();
  }

  function exportAlerts() {
    const alertRows = rows.filter((row) => row.is_low_stock);
    const header = ["SKU", "Product", "Brand", "Category", "On Hand", "Reserved", "Available", "Minimum", "Shortfall", "Status"];
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
        formatNumber(Math.max(numberValue(row.min_stock_level) - numberValue(row.total_available_quantity), 0)),
        state.label,
      ].map(csvCell).join(",");
    });
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `low-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active Products" value={summary.products} />
        <Metric label="Low Stock Alerts" value={summary.alerts} emphasis={summary.alerts > 0 ? "warning" : "success"} />
        <Metric label="Out of Stock" value={summary.outOfStock} emphasis={summary.outOfStock > 0 ? "error" : "default"} />
        <Metric label="Thresholds Set" value={`${summary.thresholdsSet}/${summary.products}`} />
        <Metric label="Total Shortfall" value={formatNumber(summary.shortfall)} />
      </div>

      {summary.thresholdsSet === 0 && !isLoading && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
          Minimum stock thresholds are not configured yet. Use <strong>Threshold Not Set</strong> to assign reorder levels; low-stock alerts become operational once those values are defined.
        </div>
      )}

      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}
      {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">{successMessage}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Low Stock Control</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Availability includes reservations. Minimum levels can be maintained here by Admin and Super Admin users.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, product, brand..." className={`${inputClass} w-full sm:w-[280px]`} />
            <select value={view} onChange={(event) => setView(event.target.value as ViewFilter)} className={`${inputClass} min-w-[180px]`}>
              <option value="alerts">Alerts Only</option>
              <option value="all">All Products</option>
              <option value="unset">Threshold Not Set</option>
            </select>
            <button type="button" onClick={loadRows} className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]">Refresh</button>
            <button type="button" onClick={exportAlerts} disabled={summary.alerts === 0} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">Export Alerts</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {['Product','Category','On Hand','Reserved','Available','Minimum','Shortfall','Status','Action'].map((label) => <th key={label} className={`${['On Hand','Reserved','Available','Minimum','Shortfall'].includes(label) ? 'text-right' : 'text-left'} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">Loading stock thresholds...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">{view === "alerts" ? "No low-stock alerts right now." : "No products match the current filters."}</td></tr>
              ) : filteredRows.map((row) => {
                const state = stockState(row);
                const minimum = numberValue(row.min_stock_level);
                const available = numberValue(row.total_available_quantity);
                const draft = thresholdDrafts[row.product_id] ?? String(minimum);
                const changed = Number(draft) !== minimum;
                return (
                  <tr key={row.product_id}>
                    <td className="px-5 py-4"><Link href={`/products/${row.product_id}`} className="text-sm font-semibold text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400">{row.sku}</Link><p className="mt-0.5 text-xs text-gray-500">{row.product_name}</p>{row.barcode && <p className="text-xs text-gray-400">{row.barcode}</p>}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300"><p>{row.category || "—"}</p><p className="text-xs text-gray-400">{row.brand || "No brand"}</p></td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{formatNumber(row.total_quantity)}</td>
                    <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{formatNumber(row.total_reserved_quantity)}</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{formatNumber(row.total_available_quantity)}</td>
                    <td className="px-5 py-4 text-right">{canEditThresholds ? <input type="number" min="0" step="0.01" value={draft} onChange={(event) => setThresholdDrafts((current) => ({ ...current, [row.product_id]: event.target.value }))} className={`${inputClass} w-24 text-right`} /> : <span className="text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.min_stock_level)}</span>}</td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{row.is_low_stock ? formatNumber(Math.max(minimum - available, 0)) : "—"}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>{state.label}</span></td>
                    <td className="px-5 py-4">{canEditThresholds ? <button type="button" disabled={!changed || savingId === row.product_id} onClick={() => saveThreshold(row)} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]">{savingId === row.product_id ? "Saving..." : "Save"}</button> : <Link href={`/products/${row.product_id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">View</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, emphasis = "default" }: { label: string; value: string | number; emphasis?: "default" | "success" | "warning" | "error" }) {
  const valueClass = emphasis === "error" ? "text-error-600 dark:text-error-400" : emphasis === "warning" ? "text-warning-600 dark:text-warning-400" : emphasis === "success" ? "text-success-600 dark:text-success-400" : "text-gray-800 dark:text-white/90";
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p></div>;
}
