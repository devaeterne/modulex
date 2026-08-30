"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StockStatus = "OK" | "LOW_STOCK" | "PARTIALLY_RESERVED" | string;

type InventoryRow = {
  inventory_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  qr_code: string | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  stock_status: StockStatus;
  total_count: number;
};

type FilterLocationRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;
};

type InventoryFilters = {
  query: string;
  warehouseId: string;
  zoneId: string;
  locationId: string;
  stockStatus: string;
};

type InventoryTableProps = {
  mode?: "overview" | "shelf";
};

const PAGE_SIZE = 25;
const EMPTY_FILTERS: InventoryFilters = {
  query: "",
  warehouseId: "",
  zoneId: "",
  locationId: "",
  stockStatus: "",
};

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

function formatNumber(value: number | string | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

function statusClass(status: StockStatus) {
  switch (status) {
    case "OK":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
    case "LOW_STOCK":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
    case "PARTIALLY_RESERVED":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
  }
}

function formatStatus(status: StockStatus) {
  return String(status).replaceAll("_", " ");
}

export default function InventoryTable({ mode = "overview" }: InventoryTableProps) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [filterLocations, setFilterLocations] = useState<FilterLocationRow[]>([]);
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isShelfMode = mode === "shelf";

  const warehouses = useMemo(() => {
    const byId = new Map<string, { id: string; code: string; name: string }>();
    for (const row of filterLocations) {
      byId.set(row.warehouse_id, { id: row.warehouse_id, code: row.warehouse_code, name: row.warehouse_name });
    }
    return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [filterLocations]);

  const zones = useMemo(() => {
    const byId = new Map<string, { id: string; code: string; name: string }>();
    for (const row of filterLocations) {
      if (!row.zone_id || !row.zone_code) continue;
      if (filters.warehouseId && row.warehouse_id !== filters.warehouseId) continue;
      byId.set(row.zone_id, { id: row.zone_id, code: row.zone_code, name: row.zone_name || row.zone_code });
    }
    return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [filterLocations, filters.warehouseId]);

  const locations = useMemo(
    () => filterLocations
      .filter((row) => (!filters.warehouseId || row.warehouse_id === filters.warehouseId) && (!filters.zoneId || row.zone_id === filters.zoneId))
      .sort((a, b) => a.location_code.localeCompare(b.location_code)),
    [filterLocations, filters.warehouseId, filters.zoneId],
  );

  const loadInventory = useCallback(async (nextFilters: InventoryFilters, nextOffset: number) => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("search_stock_page", {
      p_query: nextFilters.query,
      p_warehouse_id: nextFilters.warehouseId || null,
      p_zone_id: nextFilters.zoneId || null,
      p_location_id: nextFilters.locationId || null,
      p_stock_status: nextFilters.stockStatus || null,
      p_offset: nextOffset,
      p_limit: PAGE_SIZE,
    });

    if (error) {
      console.error("Failed to load inventory", error);
      setErrorMessage("Inventory could not be loaded. Try again.");
      setRows([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    const nextRows = (data as InventoryRow[]) ?? [];
    setRows(nextRows);
    setTotalCount(Number(nextRows[0]?.total_count ?? 0));
    setOffset(nextOffset);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    async function loadFilterOptions() {
      setIsLoadingFilters(true);
      const { data, error } = await supabase
        .from("v_location_stock_summary")
        .select("location_id, location_code, location_name, warehouse_id, warehouse_code, warehouse_name, zone_id, zone_code, zone_name")
        .eq("is_active", true)
        .order("warehouse_code", { ascending: true })
        .order("location_code", { ascending: true });

      if (error) {
        console.error("Failed to load inventory filter options", error);
      } else {
        setFilterLocations((data as FilterLocationRow[]) ?? []);
      }
      setIsLoadingFilters(false);
    }

    void loadFilterOptions();
    void loadInventory(EMPTY_FILTERS, 0);
  }, [loadInventory]);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = { ...filters, query: filters.query.trim() };
    setAppliedFilters(nextFilters);
    void loadInventory(nextFilters, 0);
  }

  function handleWarehouseChange(nextWarehouseId: string) {
    setFilters((current) => ({ ...current, warehouseId: nextWarehouseId, zoneId: "", locationId: "" }));
  }

  function handleZoneChange(nextZoneId: string) {
    setFilters((current) => ({ ...current, zoneId: nextZoneId, locationId: "" }));
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canGoPrevious = offset > 0 && !isLoading;
  const canGoNext = offset + PAGE_SIZE < totalCount && !isLoading;
  const firstVisible = totalCount === 0 ? 0 : offset + 1;
  const lastVisible = Math.min(offset + rows.length, totalCount);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {isShelfMode ? "Shelf Inventory" : "Stock Overview"}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isShelfMode
                ? "Review on-hand stock by warehouse, zone, and shelf location. Use Scan QR / Barcode for guided stock changes."
                : "View on-hand, reserved, and available stock with server-side filters and pagination."}
            </p>
          </div>
          {isShelfMode ? (
            <Link href="/scan" className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]">
              Scan QR / Barcode
            </Link>
          ) : null}
        </div>

        <form onSubmit={handleSearch} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="md:col-span-2 xl:col-span-2">
            <label htmlFor={`inventory-search-${mode}`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Search inventory</label>
            <input
              id={`inventory-search-${mode}`}
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              type="search"
              placeholder="SKU, barcode, product, location..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div>
            <label htmlFor={`inventory-warehouse-${mode}`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Warehouse</label>
            <select id={`inventory-warehouse-${mode}`} value={filters.warehouseId} onChange={(event) => handleWarehouseChange(event.target.value)} disabled={isLoadingFilters} className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`inventory-zone-${mode}`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Zone</label>
            <select id={`inventory-zone-${mode}`} value={filters.zoneId} onChange={(event) => handleZoneChange(event.target.value)} disabled={isLoadingFilters} className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
              <option value="">All zones</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.code} — {zone.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`inventory-location-${mode}`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Location</label>
            <select id={`inventory-location-${mode}`} value={filters.locationId} onChange={(event) => setFilters((current) => ({ ...current, locationId: event.target.value }))} disabled={isLoadingFilters} className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
              <option value="">All locations</option>
              {locations.map((location) => <option key={location.location_id} value={location.location_id}>{location.location_code} — {location.location_name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`inventory-status-${mode}`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Stock status</label>
            <div className="flex gap-2">
              <select id={`inventory-status-${mode}`} value={filters.stockStatus} onChange={(event) => setFilters((current) => ({ ...current, stockStatus: event.target.value }))} className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
                <option value="">All statuses</option>
                <option value="OK">OK</option>
                <option value="LOW_STOCK">Low stock</option>
                <option value="PARTIALLY_RESERVED">Partially reserved</option>
              </select>
              <button type="submit" className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50" disabled={isLoading}>Apply</button>
            </div>
          </div>
        </form>
      </div>

      {errorMessage && (
        <div role="alert" className="m-5 flex flex-col gap-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400 sm:flex-row sm:items-center sm:justify-between">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => void loadInventory(appliedFilters, offset)} className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500">Try again</button>
        </div>
      )}

      <div className="overflow-x-auto" aria-busy={isLoading}>
        <table className="min-w-[1040px] divide-y divide-gray-100 dark:divide-gray-800">
          <caption className="sr-only">{isShelfMode ? "Shelf inventory by product and location" : "Inventory by product and location"}</caption>
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr>
              <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Product</th>
              <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Warehouse</th>
              <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Zone</th>
              <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Location</th>
              <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">On Hand</th>
              <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Reserved</th>
              <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Available</th>
              <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400" role="status">Loading inventory...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No inventory records found.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.inventory_id}>
                <td className="px-5 py-4"><div><p className="text-sm font-medium text-gray-800 dark:text-white/90">{row.sku}</p><p className="text-xs text-gray-500 dark:text-gray-400">{row.product_name}</p>{row.barcode && <p className="text-xs text-gray-400 dark:text-gray-500">Barcode: {row.barcode}</p>}</div></td>
                <td className="px-5 py-4"><div><p className="text-sm font-medium text-gray-800 dark:text-white/90">{row.warehouse_code}</p><p className="text-xs text-gray-500 dark:text-gray-400">{row.warehouse_name}</p></div></td>
                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{row.zone_code ? <div><p className="font-medium text-gray-800 dark:text-white/90">{row.zone_code}</p><p className="text-xs text-gray-500 dark:text-gray-400">{row.zone_name || "-"}</p></div> : "-"}</td>
                <td className="px-5 py-4"><div><p className="text-sm font-medium text-gray-800 dark:text-white/90">{row.location_code}</p><p className="text-xs text-gray-500 dark:text-gray-400">{row.location_name}</p></div></td>
                <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{formatNumber(row.quantity)}</td>
                <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">{formatNumber(row.reserved_quantity)}</td>
                <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">{formatNumber(row.available_quantity)}</td>
                <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.stock_status)}`}>{formatStatus(row.stock_status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite">Showing {firstVisible}–{lastVisible} of {totalCount} · Page {currentPage} of {totalPages}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadInventory(appliedFilters, Math.max(0, offset - PAGE_SIZE))} disabled={!canGoPrevious} className="h-9 rounded-lg border border-gray-200 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]">Previous</button>
          <button type="button" onClick={() => void loadInventory(appliedFilters, offset + PAGE_SIZE)} disabled={!canGoNext} className="h-9 rounded-lg border border-gray-200 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]">Next</button>
        </div>
      </div>
    </div>
  );
}
