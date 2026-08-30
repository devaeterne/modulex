"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/reports/csv";

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
  total_count?: number | string;
};

type FilterOption = { filter_kind: "brand" | "category" | "warehouse"; filter_key: string; filter_label: string };
const MOVEMENT_TYPES = ["in", "out", "transfer", "adjustment", "reservation", "release", "return", "damage"];

const controlClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";
const PAGE_SIZE = 50;

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return n(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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

function exclusiveDateTo(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export default function MovementReport() {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const requestIdRef = useRef(0);

  async function loadReport(nextOffset = 0) {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc("search_inventory_movement_report_page", {
      p_query: query.trim(),
      p_movement_type: typeFilter === "all" ? null : typeFilter,
      p_warehouse_id: warehouseFilter === "all" ? null : warehouseFilter,
      p_date_from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
      p_date_to: exclusiveDateTo(dateTo),
      p_offset: nextOffset,
      p_limit: PAGE_SIZE,
      p_export_all: false,
    });

    if (requestId !== requestIdRef.current) return;
    if (error) {
      setRows([]);
      setTotalCount(0);
      setOffset(0);
      setErrorMessage(error.message);
    } else {
      const nextRows = (data ?? []) as MovementRow[];
      setRows(nextRows);
      setTotalCount(n(nextRows[0]?.total_count));
      setOffset(nextOffset);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReport(0); }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, typeFilter, warehouseFilter, dateFrom, dateTo]);

  useEffect(() => {
    async function loadFilterOptions() {
      const { data, error } = await supabase.rpc("get_inventory_report_filter_options");
      if (error) { setErrorMessage("Report filters are temporarily unavailable."); return; }
      setFilterOptions((data ?? []) as FilterOption[]);
    }
    void loadFilterOptions();
  }, []);

  const warehouses = useMemo(() => filterOptions.filter((option) => option.filter_kind === "warehouse"), [filterOptions]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.movement_type !== typeFilter) return false;
      if (warehouseFilter !== "all" && row.from_warehouse_id !== warehouseFilter && row.to_warehouse_id !== warehouseFilter) return false;
      const created = new Date(row.created_at).getTime();
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      if (!normalized) return true;
      return [row.reference_no, row.sku, row.product_name, row.barcode, row.reason, row.notes, row.created_by_name, row.created_by_email, row.from_location_code, row.to_location_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [rows, query, typeFilter, warehouseFilter, dateFrom, dateTo]);

  const summary = useMemo(() => ({
    events: filteredRows.length,
    units: filteredRows.reduce((sum, row) => sum + n(row.quantity), 0),
    inbound: filteredRows.filter((row) => row.movement_type === "in" || row.movement_type === "return").reduce((sum, row) => sum + n(row.quantity), 0),
    outbound: filteredRows.filter((row) => row.movement_type === "out" || row.movement_type === "damage").reduce((sum, row) => sum + n(row.quantity), 0),
    transfers: filteredRows.filter((row) => row.movement_type === "transfer").reduce((sum, row) => sum + n(row.quantity), 0),
    reservations: filteredRows.filter((row) => row.movement_type === "reservation").reduce((sum, row) => sum + n(row.quantity), 0),
  }), [filteredRows]);

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setWarehouseFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  async function exportReport() {
    const date = new Date().toISOString().slice(0, 10);
    const exportRows: MovementRow[] = [];
    let exportOffset = 0;
    do {
      const { data, error } = await supabase.rpc("search_inventory_movement_report_page", {
        p_query: query.trim(), p_movement_type: typeFilter === "all" ? null : typeFilter,
        p_warehouse_id: warehouseFilter === "all" ? null : warehouseFilter,
        p_date_from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
        p_date_to: exclusiveDateTo(dateTo), p_offset: exportOffset,
        p_limit: 200, p_export_all: false,
      });
      if (error) { setErrorMessage("Movement export is temporarily unavailable."); return; }
      const page = (data ?? []) as MovementRow[];
      exportRows.push(...page); exportOffset += page.length;
      if (page.length === 0 || exportOffset >= n(page[0]?.total_count)) break;
    } while (true);
    downloadCsv(`movement-report-${date}.csv`, ["Date", "Reference", "SKU", "Product", "Movement Type", "Quantity", "From Warehouse", "From Location", "To Warehouse", "To Location", "Reason", "Notes", "User"], exportRows.map((row) => [formatDate(row.created_at), row.reference_no ?? "", row.sku, row.product_name, movementLabel(row.movement_type), row.quantity, row.from_warehouse_code ?? "", row.from_location_code ?? "", row.to_warehouse_code ?? "", row.to_location_code ?? "", row.reason ?? "", row.notes ?? "", row.created_by_name || row.created_by_email || "System"]));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Events" value={String(totalCount)} />
        <Metric label="Page Units Moved" value={formatNumber(summary.units)} />
        <Metric label="Page Stock In" value={formatNumber(summary.inbound)} />
        <Metric label="Page Stock Out" value={formatNumber(summary.outbound)} />
        <Metric label="Page Transfers" value={formatNumber(summary.transfers)} />
        <Metric label="Page Reservations" value={formatNumber(summary.reservations)} />
      </div>

      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Inventory Movement Report</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Analyze receipts, issues, transfers, adjustments, reservations, releases, returns, and damage movements.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadReport(0)} className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]">Refresh</button>
              <button type="button" onClick={() => void exportReport()} disabled={totalCount === 0} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">Export CSV</button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, SKU, user..." className={`${controlClass} xl:col-span-2`} />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={controlClass}><option value="all">All Types</option>{MOVEMENT_TYPES.map((type) => <option key={type} value={type}>{movementLabel(type)}</option>)}</select>
            <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} className={controlClass}><option value="all">All Warehouses</option>{warehouses.map((option) => <option key={option.filter_key} value={option.filter_key}>{option.filter_label}</option>)}</select>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" className={controlClass} />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" className={controlClass} />
          </div>
          <div className="mt-3 flex justify-end"><button type="button" onClick={clearFilters} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">Clear filters</button></div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Date","Reference","Product","Type","Quantity","From","To","Reason","User"].map((label) => <th key={label} className={`${label === "Quantity" ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">Loading movement report...</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">No movements match the current filters.</td></tr> : filteredRows.map((row) => <tr key={row.movement_id}>
                <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(row.created_at)}</td>
                <td className="px-5 py-4"><p className="text-sm font-medium text-gray-800 dark:text-white/90">{row.reference_no || "—"}</p>{row.notes && <p className="max-w-[220px] truncate text-xs text-gray-400">{row.notes}</p>}</td>
                <td className="px-5 py-4"><p className="text-sm font-semibold text-gray-800 dark:text-white/90">{row.sku}</p><p className="text-xs text-gray-500">{row.product_name}</p></td>
                <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${movementClass(row.movement_type)}`}>{movementLabel(row.movement_type)}</span></td>
                <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{formatNumber(row.quantity)}</td>
                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.from_location_code ? <><p className="font-medium text-gray-800 dark:text-white/90">{row.from_location_code}</p><p className="text-xs text-gray-400">{row.from_warehouse_code || "—"}</p></> : "—"}</td>
                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.to_location_code ? <><p className="font-medium text-gray-800 dark:text-white/90">{row.to_location_code}</p><p className="text-xs text-gray-400">{row.to_warehouse_code || "—"}</p></> : "—"}</td>
                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.reason || "—"}</td>
                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300"><p>{row.created_by_name || "System"}</p>{row.created_by_email && <p className="text-xs text-gray-400">{row.created_by_email}</p>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400"><span>Showing {totalCount === 0 ? 0 : offset + 1}–{Math.min(offset + rows.length, totalCount)} of {totalCount}</span><div className="flex gap-2"><button type="button" disabled={isLoading || offset === 0} onClick={() => void loadReport(Math.max(0, offset - PAGE_SIZE))} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><button type="button" disabled={isLoading || offset + PAGE_SIZE >= totalCount} onClick={() => void loadReport(offset + PAGE_SIZE)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div></div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}
