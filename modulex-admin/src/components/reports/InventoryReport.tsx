"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/reports/csv";
import { supabase } from "@/lib/supabase/client";

type ReportTab = "products" | "locations";
type ProductStatusFilter = "all" | "low" | "out" | "reserved" | "ok" | "unset";

type ProductStockRow = {
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
  summary_on_hand: number | string;
  summary_reserved: number | string;
  summary_available: number | string;
  summary_low_stock: number | string;
  summary_out_of_stock: number | string;
  summary_thresholds_set: number | string;
};

type LocationStockRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;
  product_count: number | string;
  total_quantity: number | string;
  total_reserved_quantity: number | string;
  total_available_quantity: number | string;
  max_capacity: number | string | null;
  current_capacity: number | string;
  capacity_usage_percent: number | string | null;
  is_active: boolean;
  total_count: number | string;
  summary_occupied: number | string;
  summary_product_slots: number | string;
  summary_on_hand: number | string;
  summary_reserved: number | string;
  summary_available: number | string;
};

type WarehouseOption = { id: string; code: string; name: string };
type FacetRow = {
  categories: string[] | null;
  brands: string[] | null;
  warehouses: WarehouseOption[] | null;
  movement_types: string[] | null;
};

type ReportFilters = {
  query: string;
  status: ProductStatusFilter;
  category: string;
  brand: string;
  warehouseId: string;
};

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EMPTY_FILTERS: ReportFilters = {
  query: "",
  status: "all",
  category: "",
  brand: "",
  warehouseId: "",
};
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

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function productState(row: ProductStockRow) {
  const label = row.stock_status.replaceAll("_", " ");
  if (row.stock_status === "OUT_OF_STOCK") return { label, className: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400" };
  if (row.stock_status === "LOW_STOCK") return { label, className: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400" };
  if (row.stock_status === "PARTIALLY_RESERVED") return { label, className: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" };
  return { label: "OK", className: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" };
}

function reportError(context: string, error: unknown) {
  console.error(`[Inventory Report] ${context}`, error);
}

export default function InventoryReport() {
  const [tab, setTab] = useState<ReportTab>("products");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [productRows, setProductRows] = useState<ProductStockRow[]>([]);
  const [locationRows, setLocationRows] = useState<LocationStockRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [productSummary, setProductSummary] = useState({
    summary_on_hand: 0,
    summary_reserved: 0,
    summary_available: 0,
    summary_low_stock: 0,
    summary_out_of_stock: 0,
    summary_thresholds_set: 0,
  });
  const [locationSummary, setLocationSummary] = useState({
    summary_occupied: 0,
    summary_product_slots: 0,
    summary_on_hand: 0,
    summary_reserved: 0,
    summary_available: 0,
  });

  const loadFacets = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_inventory_report_facets");
    if (error) {
      reportError("facets load failed", error);
      return;
    }
    const facet = ((data as FacetRow[]) ?? [])[0];
    setCategories(facet?.categories ?? []);
    setBrands(facet?.brands ?? []);
    setWarehouses(Array.isArray(facet?.warehouses) ? facet.warehouses : []);
  }, []);

  const loadProductPage = useCallback(async (nextFilters: ReportFilters, nextOffset: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc("search_inventory_product_report_page", {
      p_query: nextFilters.query || null,
      p_status: nextFilters.status,
      p_category: nextFilters.category || null,
      p_brand: nextFilters.brand || null,
      p_offset: nextOffset,
      p_limit: PAGE_SIZE,
    });
    if (error) {
      reportError("product report load failed", error);
      setProductRows([]);
      setTotalCount(0);
      setErrorMessage("Inventory product report is temporarily unavailable. Please try again.");
      setIsLoading(false);
      return;
    }
    const rows = (data as ProductStockRow[]) ?? [];
    const first = rows[0];
    setProductRows(rows);
    setTotalCount(n(first?.total_count));
    setProductSummary({
      summary_on_hand: n(first?.summary_on_hand),
      summary_reserved: n(first?.summary_reserved),
      summary_available: n(first?.summary_available),
      summary_low_stock: n(first?.summary_low_stock),
      summary_out_of_stock: n(first?.summary_out_of_stock),
      summary_thresholds_set: n(first?.summary_thresholds_set),
    });
    setOffset(nextOffset);
    setIsLoading(false);
  }, []);

  const loadLocationPage = useCallback(async (nextFilters: ReportFilters, nextOffset: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase.rpc("search_inventory_location_report_page", {
      p_query: nextFilters.query || null,
      p_warehouse_id: nextFilters.warehouseId || null,
      p_offset: nextOffset,
      p_limit: PAGE_SIZE,
    });
    if (error) {
      reportError("location report load failed", error);
      setLocationRows([]);
      setTotalCount(0);
      setErrorMessage("Inventory location report is temporarily unavailable. Please try again.");
      setIsLoading(false);
      return;
    }
    const rows = (data as LocationStockRow[]) ?? [];
    const first = rows[0];
    setLocationRows(rows);
    setTotalCount(n(first?.total_count));
    setLocationSummary({
      summary_occupied: n(first?.summary_occupied),
      summary_product_slots: n(first?.summary_product_slots),
      summary_on_hand: n(first?.summary_on_hand),
      summary_reserved: n(first?.summary_reserved),
      summary_available: n(first?.summary_available),
    });
    setOffset(nextOffset);
    setIsLoading(false);
  }, []);

  const loadActivePage = useCallback((activeTab: ReportTab, nextFilters: ReportFilters, nextOffset: number) => {
    if (activeTab === "products") return loadProductPage(nextFilters, nextOffset);
    return loadLocationPage(nextFilters, nextOffset);
  }, [loadLocationPage, loadProductPage]);

  useEffect(() => {
    void loadFacets();
    void loadProductPage(EMPTY_FILTERS, 0);
  }, [loadFacets, loadProductPage]);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visibleRows = tab === "products" ? productRows.length : locationRows.length;
  const firstVisible = totalCount === 0 ? 0 : offset + 1;
  const lastVisible = Math.min(offset + visibleRows, totalCount);

  const summaryCards = useMemo(() => {
    if (tab === "products") {
      return [
        ["Products", totalCount],
        ["On Hand", productSummary.summary_on_hand],
        ["Reserved", productSummary.summary_reserved],
        ["Available", productSummary.summary_available],
        ["Low / Out", `${formatNumber(productSummary.summary_low_stock)} / ${formatNumber(productSummary.summary_out_of_stock)}`],
      ];
    }
    return [
      ["Locations", totalCount],
      ["Occupied", locationSummary.summary_occupied],
      ["Product Slots", locationSummary.summary_product_slots],
      ["On Hand", locationSummary.summary_on_hand],
      ["Available", locationSummary.summary_available],
    ];
  }, [locationSummary, productSummary, tab, totalCount]);

  function applyFilters() {
    const nextFilters = { ...filters, query: filters.query.trim() };
    setAppliedFilters(nextFilters);
    void loadActivePage(tab, nextFilters, 0);
  }

  function switchTab(nextTab: ReportTab) {
    setTab(nextTab);
    setOffset(0);
    void loadActivePage(nextTab, appliedFilters, 0);
  }

  async function exportCurrent() {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (tab === "products") {
        const allRows: ProductStockRow[] = [];
        let exportOffset = 0;
        let exportTotal = Number.POSITIVE_INFINITY;
        while (exportOffset < exportTotal) {
          const { data, error } = await supabase.rpc("search_inventory_product_report_page", {
            p_query: appliedFilters.query || null,
            p_status: appliedFilters.status,
            p_category: appliedFilters.category || null,
            p_brand: appliedFilters.brand || null,
            p_offset: exportOffset,
            p_limit: EXPORT_PAGE_SIZE,
          });
          if (error) throw error;
          const page = (data as ProductStockRow[]) ?? [];
          exportTotal = n(page[0]?.total_count);
          allRows.push(...page);
          if (page.length === 0) break;
          exportOffset += page.length;
        }
        downloadCsv(
          `inventory-product-summary-${date}.csv`,
          ["SKU", "Product", "Brand", "Category", "Warehouses", "Locations", "On Hand", "Reserved", "Available", "Minimum", "Threshold", "Status", "Last Update"],
          allRows.map((row) => [row.sku, row.product_name, row.brand ?? "", row.category ?? "", row.warehouse_count, row.location_count, row.total_quantity, row.total_reserved_quantity, row.total_available_quantity, row.min_stock_level, row.threshold_configured ? "Configured" : "Unset", productState(row).label, row.last_inventory_update ?? ""])
        );
      } else {
        const allRows: LocationStockRow[] = [];
        let exportOffset = 0;
        let exportTotal = Number.POSITIVE_INFINITY;
        while (exportOffset < exportTotal) {
          const { data, error } = await supabase.rpc("search_inventory_location_report_page", {
            p_query: appliedFilters.query || null,
            p_warehouse_id: appliedFilters.warehouseId || null,
            p_offset: exportOffset,
            p_limit: EXPORT_PAGE_SIZE,
          });
          if (error) throw error;
          const page = (data as LocationStockRow[]) ?? [];
          exportTotal = n(page[0]?.total_count);
          allRows.push(...page);
          if (page.length === 0) break;
          exportOffset += page.length;
        }
        downloadCsv(
          `inventory-location-summary-${date}.csv`,
          ["Warehouse", "Zone", "Location", "Type", "Products", "On Hand", "Reserved", "Available", "Max Capacity", "Current Capacity", "Capacity Usage %"],
          allRows.map((row) => [row.warehouse_code, row.zone_code ?? "", row.location_code, row.location_type, row.product_count, row.total_quantity, row.total_reserved_quantity, row.total_available_quantity, row.max_capacity ?? "", row.current_capacity, row.capacity_usage_percent ?? ""])
        );
      }
    } catch (error) {
      reportError("export failed", error);
      setErrorMessage("The filtered inventory report could not be exported. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5" aria-busy={isLoading}>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => switchTab("products")} className={`h-10 rounded-lg px-4 text-sm font-medium ${tab === "products" ? "bg-brand-500 text-white" : "border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"} ${focusClass}`}>Product Summary</button>
        <button type="button" onClick={() => switchTab("locations")} className={`h-10 rounded-lg px-4 text-sm font-medium ${tab === "locations" ? "bg-brand-500 text-white" : "border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"} ${focusClass}`}>Location Utilization</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={typeof value === "string" ? value : formatNumber(value)} />)}
      </div>

      {errorMessage ? <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{tab === "products" ? "Inventory by Product" : "Inventory by Location"}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Server-side filters, pagination, aggregates, and complete paged CSV export.</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); applyFilters(); }} className="flex flex-wrap gap-2">
            <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder={tab === "products" ? "Search product..." : "Search location..."} className={`${controlClass} w-[240px]`} />
            {tab === "products" ? (
              <>
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ProductStatusFilter }))} className={controlClass} aria-label="Product stock status">
                  <option value="all">All Statuses</option><option value="low">Low Stock</option><option value="out">Out of Stock</option><option value="reserved">Reserved</option><option value="ok">OK</option><option value="unset">Threshold Unset</option>
                </select>
                <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className={controlClass} aria-label="Product category">
                  <option value="">All Categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={filters.brand} onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))} className={controlClass} aria-label="Product brand">
                  <option value="">All Brands</option>{brands.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </>
            ) : (
              <select value={filters.warehouseId} onChange={(event) => setFilters((current) => ({ ...current, warehouseId: event.target.value }))} className={controlClass} aria-label="Warehouse">
                <option value="">All Warehouses</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
              </select>
            )}
            <button type="submit" className={`h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-gray-900 ${focusClass}`}>Apply</button>
            <button type="button" onClick={() => void loadActivePage(tab, appliedFilters, offset)} className={`h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>Refresh</button>
            <button type="button" onClick={() => void exportCurrent()} disabled={totalCount === 0 || isExporting} className={`h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>{isExporting ? "Exporting..." : "Export CSV"}</button>
          </form>
        </div>

        <div className="overflow-x-auto">
          {tab === "products" ? <ProductTable rows={productRows} isLoading={isLoading} /> : <LocationTable rows={locationRows} isLoading={isLoading} />}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {firstVisible}–{lastVisible} of {totalCount}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={offset === 0 || isLoading} onClick={() => void loadActivePage(tab, appliedFilters, Math.max(0, offset - PAGE_SIZE))} className={`h-9 rounded-lg border border-gray-200 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 ${focusClass}`}>Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" disabled={offset + PAGE_SIZE >= totalCount || isLoading} onClick={() => void loadActivePage(tab, appliedFilters, offset + PAGE_SIZE)} className={`h-9 rounded-lg border border-gray-200 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 ${focusClass}`}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductTable({ rows, isLoading }: { rows: ProductStockRow[]; isLoading: boolean }) {
  return (
    <table className="min-w-[1180px] divide-y divide-gray-100 dark:divide-gray-800">
      <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Product", "Brand / Category", "Warehouses", "Locations", "On Hand", "Reserved", "Available", "Minimum", "Threshold", "Status", "Last Update"].map((label) => <th key={label} scope="col" className={`${["Warehouses", "Locations", "On Hand", "Reserved", "Available", "Minimum"].includes(label) ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading ? <tr><td colSpan={11} className="px-5 py-10 text-center text-sm text-gray-500">Loading inventory report...</td></tr> : rows.length === 0 ? <tr><td colSpan={11} className="px-5 py-10 text-center text-sm text-gray-500">No products match the current filters.</td></tr> : rows.map((row) => { const state = productState(row); return (
          <tr key={row.product_id}>
            <td className="px-5 py-4"><p className="text-sm font-semibold text-gray-800 dark:text-white/90">{row.sku}</p><p className="text-xs text-gray-500">{row.product_name}</p></td>
            <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300"><p>{row.brand || "—"}</p><p className="text-xs text-gray-400">{row.category || "—"}</p></td>
            <td className="px-5 py-4 text-right text-sm">{formatNumber(row.warehouse_count)}</td><td className="px-5 py-4 text-right text-sm">{formatNumber(row.location_count)}</td>
            <td className="px-5 py-4 text-right text-sm font-medium">{formatNumber(row.total_quantity)}</td><td className="px-5 py-4 text-right text-sm">{formatNumber(row.total_reserved_quantity)}</td><td className="px-5 py-4 text-right text-sm font-semibold">{formatNumber(row.total_available_quantity)}</td><td className="px-5 py-4 text-right text-sm">{formatNumber(row.min_stock_level)}</td>
            <td className="px-5 py-4 text-sm text-gray-500">{row.threshold_configured ? "Configured" : "Unset"}</td>
            <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>{state.label}</span></td>
            <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">{formatDate(row.last_inventory_update)}</td>
          </tr>
        ); })}
      </tbody>
    </table>
  );
}

function LocationTable({ rows, isLoading }: { rows: LocationStockRow[]; isLoading: boolean }) {
  return (
    <table className="min-w-[1100px] divide-y divide-gray-100 dark:divide-gray-800">
      <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Warehouse", "Zone", "Location", "Type", "Products", "On Hand", "Reserved", "Available", "Capacity", "Usage"].map((label) => <th key={label} scope="col" className={`${["Products", "On Hand", "Reserved", "Available", "Capacity", "Usage"].includes(label) ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading ? <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-500">Loading location report...</td></tr> : rows.length === 0 ? <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-500">No locations match the current filters.</td></tr> : rows.map((row) => (
          <tr key={row.location_id}>
            <td className="px-5 py-4"><p className="text-sm font-semibold">{row.warehouse_code}</p><p className="text-xs text-gray-500">{row.warehouse_name}</p></td>
            <td className="px-5 py-4 text-sm">{row.zone_code || "—"}</td><td className="px-5 py-4"><p className="text-sm font-semibold">{row.location_code}</p><p className="text-xs text-gray-500">{row.location_name}</p></td><td className="px-5 py-4 text-sm">{row.location_type}</td>
            <td className="px-5 py-4 text-right text-sm">{formatNumber(row.product_count)}</td><td className="px-5 py-4 text-right text-sm font-medium">{formatNumber(row.total_quantity)}</td><td className="px-5 py-4 text-right text-sm">{formatNumber(row.total_reserved_quantity)}</td><td className="px-5 py-4 text-right text-sm font-semibold">{formatNumber(row.total_available_quantity)}</td>
            <td className="px-5 py-4 text-right text-sm">{row.max_capacity == null ? "—" : `${formatNumber(row.current_capacity)} / ${formatNumber(row.max_capacity)}`}</td><td className="px-5 py-4 text-right text-sm">{row.capacity_usage_percent == null ? "—" : `${formatNumber(row.capacity_usage_percent)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}
