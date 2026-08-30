"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/reports/csv";

type ReportTab = "products" | "locations";
type ProductStatusFilter = "all" | "low" | "out" | "reserved" | "ok";

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
  total_count?: number | string;
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
  total_count?: number | string;
};
type FilterOption = { filter_kind: "brand" | "category" | "warehouse"; filter_key: string; filter_label: string };

const PAGE_SIZE = 50;

const controlClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return n(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function productState(row: ProductStockRow) {
  const available = n(row.total_available_quantity);
  if (available <= 0) return { key: "out", label: "OUT OF STOCK", className: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400" };
  if (row.is_low_stock) return { key: "low", label: "LOW STOCK", className: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400" };
  if (n(row.total_reserved_quantity) > 0) return { key: "reserved", label: "RESERVED", className: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" };
  return { key: "ok", label: "OK", className: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function InventoryReport() {
  const [tab, setTab] = useState<ReportTab>("products");
  const [products, setProducts] = useState<ProductStockRow[]>([]);
  const [locations, setLocations] = useState<LocationStockRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [productOffset, setProductOffset] = useState(0);
  const [locationOffset, setLocationOffset] = useState(0);
  const [productTotal, setProductTotal] = useState(0);
  const [locationTotal, setLocationTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const requestIdRef = useRef(0);

  async function loadReport(nextProductOffset = 0, nextLocationOffset = 0) {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    const [productResult, locationResult] = await Promise.all([
      supabase.rpc("search_inventory_product_report_page", {
        p_query: query.trim(), p_status: statusFilter, p_category: categoryFilter,
        p_brand: brandFilter, p_offset: nextProductOffset, p_limit: PAGE_SIZE,
        p_export_all: false,
      }),
      supabase.rpc("search_inventory_location_report_page", {
        p_query: query.trim(), p_warehouse_id: warehouseFilter === "all" ? null : warehouseFilter,
        p_offset: nextLocationOffset, p_limit: PAGE_SIZE, p_export_all: false,
      }),
    ]);

    const error = productResult.error || locationResult.error;
    if (requestId !== requestIdRef.current) return;
    if (error) {
      setErrorMessage(error.message);
      setProducts([]);
      setLocations([]);
      setProductTotal(0);
      setLocationTotal(0);
      setProductOffset(0);
      setLocationOffset(0);
    } else {
      setProducts((productResult.data ?? []) as ProductStockRow[]);
      setLocations((locationResult.data ?? []) as LocationStockRow[]);
      const nextProducts = (productResult.data ?? []) as ProductStockRow[];
      const nextLocations = (locationResult.data ?? []) as LocationStockRow[];
      setProductTotal(n(nextProducts[0]?.total_count));
      setLocationTotal(n(nextLocations[0]?.total_count));
      setProductOffset(nextProductOffset);
      setLocationOffset(nextLocationOffset);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReport(0, 0); }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, categoryFilter, brandFilter, warehouseFilter]);

  useEffect(() => {
    async function loadFilterOptions() {
      const { data, error } = await supabase.rpc("get_inventory_report_filter_options");
      if (error) { setErrorMessage("Report filters are temporarily unavailable."); return; }
      setFilterOptions((data ?? []) as FilterOption[]);
    }
    void loadFilterOptions();
  }, []);

  const categories = useMemo(() => filterOptions.filter((option) => option.filter_kind === "category"), [filterOptions]);
  const brands = useMemo(() => filterOptions.filter((option) => option.filter_kind === "brand"), [filterOptions]);
  const warehouses = useMemo(() => filterOptions.filter((option) => option.filter_kind === "warehouse"), [filterOptions]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((row) => {
      const state = productState(row);
      if (statusFilter !== "all" && state.key !== statusFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (brandFilter !== "all" && row.brand !== brandFilter) return false;
      if (!normalized) return true;
      return [row.sku, row.barcode, row.product_name, row.brand, row.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [products, query, statusFilter, categoryFilter, brandFilter]);

  const filteredLocations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return locations.filter((row) => {
      if (warehouseFilter !== "all" && row.warehouse_id !== warehouseFilter) return false;
      if (!normalized) return true;
      return [row.location_code, row.location_name, row.warehouse_code, row.warehouse_name, row.zone_code, row.zone_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [locations, query, warehouseFilter]);

  const productSummary = useMemo(() => ({
    products: filteredProducts.length,
    onHand: filteredProducts.reduce((sum, row) => sum + n(row.total_quantity), 0),
    reserved: filteredProducts.reduce((sum, row) => sum + n(row.total_reserved_quantity), 0),
    available: filteredProducts.reduce((sum, row) => sum + n(row.total_available_quantity), 0),
    lowStock: filteredProducts.filter((row) => row.is_low_stock).length,
  }), [filteredProducts]);

  const locationSummary = useMemo(() => ({
    locations: filteredLocations.length,
    occupied: filteredLocations.filter((row) => n(row.product_count) > 0).length,
    products: filteredLocations.reduce((sum, row) => sum + n(row.product_count), 0),
    onHand: filteredLocations.reduce((sum, row) => sum + n(row.total_quantity), 0),
    available: filteredLocations.reduce((sum, row) => sum + n(row.total_available_quantity), 0),
  }), [filteredLocations]);

  async function exportCurrent() {
    const date = new Date().toISOString().slice(0, 10);
    if (tab === "products") {
      const exportRows: ProductStockRow[] = [];
      let offset = 0;
      do {
        const { data, error } = await supabase.rpc("search_inventory_product_report_page", {
          p_query: query.trim(), p_status: statusFilter, p_category: categoryFilter,
          p_brand: brandFilter, p_offset: offset, p_limit: 100, p_export_all: false,
        });
        if (error) { setErrorMessage("Inventory export is temporarily unavailable."); return; }
        const page = (data ?? []) as ProductStockRow[];
        exportRows.push(...page); offset += page.length;
        if (page.length === 0 || offset >= n(page[0]?.total_count)) break;
      } while (true);
      downloadCsv(`inventory-product-summary-${date}.csv`, ["SKU", "Product", "Brand", "Category", "Warehouses", "Locations", "On Hand", "Reserved", "Available", "Minimum", "Status", "Last Update"], exportRows.map((row) => [row.sku, row.product_name, row.brand ?? "", row.category ?? "", row.warehouse_count, row.location_count, row.total_quantity, row.total_reserved_quantity, row.total_available_quantity, row.min_stock_level, productState(row).label, row.last_inventory_update ?? ""]));
    } else {
      const exportRows: LocationStockRow[] = [];
      let offset = 0;
      do {
        const { data, error } = await supabase.rpc("search_inventory_location_report_page", {
          p_query: query.trim(), p_warehouse_id: warehouseFilter === "all" ? null : warehouseFilter,
          p_offset: offset, p_limit: 100, p_export_all: false,
        });
        if (error) { setErrorMessage("Inventory export is temporarily unavailable."); return; }
        const page = (data ?? []) as LocationStockRow[];
        exportRows.push(...page); offset += page.length;
        if (page.length === 0 || offset >= n(page[0]?.total_count)) break;
      } while (true);
      downloadCsv(`inventory-location-summary-${date}.csv`, ["Warehouse", "Zone", "Location", "Type", "Products", "On Hand", "Reserved", "Available", "Max Capacity", "Current Capacity", "Capacity Usage %"], exportRows.map((row) => [row.warehouse_code, row.zone_code ?? "", row.location_code, row.location_type, row.product_count, row.total_quantity, row.total_reserved_quantity, row.total_available_quantity, row.max_capacity ?? "", row.current_capacity, row.capacity_usage_percent ?? ""]));
    }
  }

  const summaryCards = tab === "products"
    ? [
        ["Products", productTotal],
        ["Page On Hand", formatNumber(productSummary.onHand)],
        ["Page Reserved", formatNumber(productSummary.reserved)],
        ["Page Available", formatNumber(productSummary.available)],
        ["Page Low Stock", productSummary.lowStock],
      ]
    : [
        ["Locations", locationTotal],
        ["Page Occupied", locationSummary.occupied],
        ["Page Product Slots", formatNumber(locationSummary.products)],
        ["Page On Hand", formatNumber(locationSummary.onHand)],
        ["Page Available", formatNumber(locationSummary.available)],
      ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab("products")} className={`h-10 rounded-lg px-4 text-sm font-medium ${tab === "products" ? "bg-brand-500 text-white" : "border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"}`}>Product Summary</button>
        <button type="button" onClick={() => setTab("locations")} className={`h-10 rounded-lg px-4 text-sm font-medium ${tab === "locations" ? "bg-brand-500 text-white" : "border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"}`}>Location Utilization</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={String(value)} />)}
      </div>

      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{tab === "products" ? "Inventory by Product" : "Inventory by Location"}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tab === "products" ? "Aggregated stock, reservations, availability, thresholds, and stock status." : "Warehouse and shelf utilization with stock and capacity totals."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "products" ? "Search product..." : "Search location..."} className={`${controlClass} w-[240px]`} />
            {tab === "products" ? <>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProductStatusFilter)} className={controlClass}><option value="all">All Statuses</option><option value="low">Low Stock</option><option value="out">Out of Stock</option><option value="reserved">Reserved</option><option value="ok">OK</option></select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={controlClass}><option value="all">All Categories</option>{categories.map((option) => <option key={option.filter_key} value={option.filter_key}>{option.filter_label}</option>)}</select>
              <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className={controlClass}><option value="all">All Brands</option>{brands.map((option) => <option key={option.filter_key} value={option.filter_key}>{option.filter_label}</option>)}</select>
            </> : <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} className={controlClass}><option value="all">All Warehouses</option>{warehouses.map((option) => <option key={option.filter_key} value={option.filter_key}>{option.filter_label}</option>)}</select>}
            <button type="button" onClick={() => void loadReport(0, 0)} className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]">Refresh</button>
            <button type="button" onClick={() => void exportCurrent()} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">Export CSV</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === "products" ? (
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Product","Brand / Category","Warehouses","Locations","On Hand","Reserved","Available","Minimum","Status","Last Update"].map((label) => <th key={label} className={`${["Warehouses","Locations","On Hand","Reserved","Available","Minimum"].includes(label) ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading ? <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-500">Loading inventory report...</td></tr> : filteredProducts.length === 0 ? <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-500">No products match the current filters.</td></tr> : filteredProducts.map((row) => { const state = productState(row); return <tr key={row.product_id}><td className="px-5 py-4"><p className="text-sm font-semibold text-gray-800 dark:text-white/90">{row.sku}</p><p className="text-xs text-gray-500">{row.product_name}</p></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300"><p>{row.brand || "—"}</p><p className="text-xs text-gray-400">{row.category || "—"}</p></td><td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.warehouse_count)}</td><td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.location_count)}</td><td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{formatNumber(row.total_quantity)}</td><td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{formatNumber(row.total_reserved_quantity)}</td><td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{formatNumber(row.total_available_quantity)}</td><td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{formatNumber(row.min_stock_level)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>{state.label}</span></td><td className="px-5 py-4 text-sm text-gray-500">{formatDate(row.last_inventory_update)}</td></tr>; })}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Warehouse","Zone","Location","Type","Products","On Hand","Reserved","Available","Capacity"].map((label) => <th key={label} className={`${["Products","On Hand","Reserved","Available","Capacity"].includes(label) ? "text-right" : "text-left"} px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400`}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">Loading location report...</td></tr> : filteredLocations.length === 0 ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">No locations match the current filters.</td></tr> : filteredLocations.map((row) => <tr key={row.location_id}><td className="px-5 py-4"><p className="text-sm font-semibold text-gray-800 dark:text-white/90">{row.warehouse_code}</p><p className="text-xs text-gray-500">{row.warehouse_name}</p></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.zone_code || "—"}</td><td className="px-5 py-4"><p className="text-sm font-medium text-gray-800 dark:text-white/90">{row.location_code}</p><p className="text-xs text-gray-500">{row.location_name}</p></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{String(row.location_type).replaceAll("_", " ")}</td><td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{formatNumber(row.product_count)}</td><td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{formatNumber(row.total_quantity)}</td><td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{formatNumber(row.total_reserved_quantity)}</td><td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{formatNumber(row.total_available_quantity)}</td><td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{row.capacity_usage_percent == null ? "—" : `${formatNumber(row.capacity_usage_percent)}%`}</td></tr>)}
              </tbody>
            </table>
          )}
        </div>
        <ReportPagination
          offset={tab === "products" ? productOffset : locationOffset}
          total={tab === "products" ? productTotal : locationTotal}
          loading={isLoading}
          onPage={(nextOffset) => void loadReport(tab === "products" ? nextOffset : productOffset, tab === "locations" ? nextOffset : locationOffset)}
        />
      </div>
    </div>
  );
}

function ReportPagination({ offset, total, loading, onPage }: { offset: number; total: number; loading: boolean; onPage: (offset: number) => void }) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PAGE_SIZE, total);
  return <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400"><span>Showing {first}–{last} of {total}</span><div className="flex gap-2"><button type="button" disabled={loading || offset === 0} onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))} className="rounded-lg border px-3 py-2 disabled:opacity-50">Previous</button><button type="button" disabled={loading || offset + PAGE_SIZE >= total} onClick={() => onPage(offset + PAGE_SIZE)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Next</button></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}
