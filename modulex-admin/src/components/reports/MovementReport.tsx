"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadCsv } from "@/lib/reports/csv";
import { supabase } from "@/lib/supabase/client";

type MovementRow = {
  movement_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  barcode: string | null;
  movement_type: string;
  quantity: number | string;
  reference_no: string | null;
  reason: string | null;
  notes: string | null;
  from_warehouse_id: string | null;
  from_warehouse_code: string | null;
  from_warehouse_name: string | null;
  from_location_id: string | null;
  from_location_code: string | null;
  from_location_name: string | null;
  to_warehouse_id: string | null;
  to_warehouse_code: string | null;
  to_warehouse_name: string | null;
  to_location_id: string | null;
  to_location_code: string | null;
  to_location_name: string | null;
  created_by_id: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  created_at: string;
  total_count: number | string;
  summary_units: number | string;
  summary_inbound: number | string;
  summary_outbound: number | string;
  summary_transfers: number | string;
  summary_reservations: number | string;
  summary_releases: number | string;
};

type WarehouseOption = { id: string; code: string; name: string };
type FacetRow = {
  categories: string[] | null;
  brands: string[] | null;
  warehouses: WarehouseOption[] | null;
  movement_types: string[] | null;
};

type Filters = {
  query: string;
  movementType: string;
  warehouseId: string;
  dateFrom: string;
  dateTo: string;
};

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EMPTY_FILTERS: Filters = { query: "", movementType: "", warehouseId: "", dateFrom: "", dateTo: "" };
const controlClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus-visible:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";
const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return numberFormatter.format(n(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function movementLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function movementClass(type: string) {
  if (type === "in" || type === "return") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (type === "out" || type === "damage") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (type === "transfer") return "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400";
  if (type === "adjustment") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  if (type === "reservation") return "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400";
  if (type === "release") return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  return "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
}

function dateStartIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function dateEndIso(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
}

function reportError(context: string, error: unknown) {
  console.error(`[Movement Report] ${context}`, error);
}

export default function MovementReport() {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [movementTypes, setMovementTypes] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({
    summary_units: 0,
    summary_inbound: 0,
    summary_outbound: 0,
    summary_transfers: 0,
    summary_reservations: 0,
    summary_releases: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFacets = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_inventory_report_facets");
    if (error) {
      reportError("facets load failed", error);
      return;
    }
    const facet = ((data as FacetRow[]) ?? [])[0];
    setWarehouses(Array.isArray(facet?.warehouses) ? facet.warehouses : []);
    setMovementTypes(facet?.movement_types ?? []);
  }, []);

  const loadPage = useCallback(async (nextFilters: Filters, nextOffset: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc("search_inventory_movement_report_page", {
      p_query: nextFilters.query || null,
      p_movement_type: nextFilters.movementType || null,
      p_warehouse_id: nextFilters.warehouseId || null,
      p_created_from: dateStartIso(nextFilters.dateFrom),
      p_created_to: dateEndIso(nextFilters.dateTo),
      p_offset: nextOffset,
      p_limit: PAGE_SIZE,
    });
    if (error) {
      reportError("load failed", error);
      setRows([]);
      setTotalCount(0);
      setErrorMessage("Movement report is temporarily unavailable. Please try again.");
      setIsLoading(false);
      return;
    }
    const nextRows = (data as MovementRow[]) ?? [];
    const first = nextRows[0];
    setRows(nextRows);
    setTotalCount(n(first?.total_count));
    setSummary({
      summary_units: n(first?.summary_units),
      summary_inbound: n(first?.summary_inbound),
      summary_outbound: n(first?.summary_outbound),
      summary_transfers: n(first?.summary_transfers),
      summary_reservations: n(first?.summary_reservations),
      summary_releases: n(first?.summary_releases),
    });
    setOffset(nextOffset);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadFacets();
    void loadPage(EMPTY_FILTERS, 0);
  }, [loadFacets, loadPage]);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstVisible = totalCount === 0 ? 0 : offset + 1;
  const lastVisible = Math.min(offset + rows.length, totalCount);

  function applyFilters() {
    const nextFilters = { ...filters, query: filters.query.trim() };
    setAppliedFilters(nextFilters);
    void loadPage(nextFilters, 0);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void loadPage(EMPTY_FILTERS, 0);
  }

  async function exportReport() {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const allRows: MovementRow[] = [];
      let exportOffset = 0;
      let exportTotal = Number.POSITIVE_INFINITY;
      while (exportOffset < exportTotal) {
        const { data, error } = await supabase.rpc("search_inventory_movement_report_page", {
          p_query: appliedFilters.query || null,
          p_movement_type: appliedFilters.movementType || null,
          p_warehouse_id: appliedFilters.warehouseId || null,
          p_created_from: dateStartIso(appliedFilters.dateFrom),
          p_created_to: dateEndIso(appliedFilters.dateTo),
          p_offset: exportOffset,
          p_limit: EXPORT_PAGE_SIZE,
        });
        if (error) throw error;
        const page = (data as MovementRow[]) ?? [];
        exportTotal = n(page[0]?.total_count);
        allRows.push(...page);
        if (page.length === 0) break;
        exportOffset += page.length;
      }
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(
        `movement-report-${date}.csv`,
        ["Date", "Reference", "SKU", "Product", "Movement Type", "Quantity", "From Warehouse", "From Location", "To Warehouse", "To Location", "Reason", "Notes", "User"],
        allRows.map((row) => [formatDate(row.created_at), row.reference_no ?? "", row.sku, row.product_name, movementLabel(row.movement_type), row.quantity, row.from_warehouse_code ?? "", row.from_location_code ?? "", row.to_warehouse_code ?? "", row.to_location_code ?? "", row.reason ?? "", row.notes ?? "", row.created_by_name || row.created_by_email || "System"])
      );
    } catch (error) {
      reportError("export failed", error);
      setErrorMessage("The filtered movement report could not be exported. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5" aria-busy={isLoading}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Events" value={formatNumber(totalCount)} />
        <Metric label="Units Moved" value={formatNumber(summary.summary_units)} />
        <Metric label="Stock In" value={formatNumber(summary.summary_inbound)} />
        <Metric label="Stock Out" value={formatNumber(summary.summary_outbound)} />
        <Metric label="Transfers" value={formatNumber(summary.summary_transfers)} />
        <Metric label="Reserve / Release" value={`${formatNumber(summary.summary_reservations)} / ${formatNumber(summary.summary_releases)}`} />
      </div>

      {errorMessage ? <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Inventory Movement Report</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Server-side filters, pagination, aggregate totals, and complete paged CSV export.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadPage(appliedFilters, offset)} className={`h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>Refresh</button>
              <button type="button" onClick={() => void exportReport()} disabled={totalCount === 0 || isExporting} className={`h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>{isExporting ? "Exporting..." : "Export CSV"}</button>
            </div>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); applyFilters(); }} className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search reference, SKU, user..." className={`${controlClass} xl:col-span-2`} />
            <select value={filters.movementType} onChange={(event) => setFilters((current) => ({ ...current, movementType: event.target.value }))} className={controlClass} aria-label="Movement type">
              <option value="">All Types</option>{movementTypes.map((type) => <option key={type} value={type}>{movementLabel(type)}</option>)}
            </select>
            <select value={filters.warehouseId} onChange={(event) => setFilters((current) => ({ ...current, warehouseId: event.target.value }))} className={controlClass} aria-label="Warehouse">
              <option value="">All Warehouses</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
            </select>
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} aria-label="Date from" className={controlClass} />
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} aria-label="Date to" className={controlClass} />
            <div className="flex gap-2 xl:col-span-6 xl:justify-end">
              <button type="button" onClick={clearFilters} className={`h-9 px-3 text-sm font-medium text-gray-500 ${focusClass}`}>Clear filters</button>
              <button type="submit" className={`h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-gray-900 ${focusClass}`}>Apply</button>
            </div>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Date", "Reference", "Product", "Type", "Quantity", "From", "To", "Reason", "User"].map((label) => <th key={label} scope="col" className={`${label === "Quantity" ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">Loading movement report...</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">No movements match the current filters.</td></tr> : rows.map((row) => (
                <tr key={row.movement_id}>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(row.created_at)}</td>
                  <td className="px-5 py-4"><p className="text-sm font-medium text-gray-800 dark:text-white/90">{row.reference_no || "—"}</p>{row.notes ? <p className="max-w-[220px] truncate text-xs text-gray-400">{row.notes}</p> : null}</td>
                  <td className="px-5 py-4"><p className="text-sm font-semibold text-gray-800 dark:text-white/90">{row.sku}</p><p className="text-xs text-gray-500">{row.product_name}</p></td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${movementClass(row.movement_type)}`}>{movementLabel(row.movement_type)}</span></td>
                  <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{formatNumber(row.quantity)}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.from_location_code ? <><p className="font-medium">{row.from_location_code}</p><p className="text-xs text-gray-400">{row.from_warehouse_code || "—"}</p></> : "—"}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.to_location_code ? <><p className="font-medium">{row.to_location_code}</p><p className="text-xs text-gray-400">{row.to_warehouse_code || "—"}</p></> : "—"}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.reason || "—"}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300"><p>{row.created_by_name || "System"}</p>{row.created_by_email ? <p className="text-xs text-gray-400">{row.created_by_email}</p> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {firstVisible}–{lastVisible} of {totalCount}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={offset === 0 || isLoading} onClick={() => void loadPage(appliedFilters, Math.max(0, offset - PAGE_SIZE))} className={`h-9 rounded-lg border border-gray-200 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 ${focusClass}`}>Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" disabled={offset + PAGE_SIZE >= totalCount || isLoading} onClick={() => void loadPage(appliedFilters, offset + PAGE_SIZE)} className={`h-9 rounded-lg border border-gray-200 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 ${focusClass}`}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}
