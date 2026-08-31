"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";
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

type BadgeColor = "success" | "error" | "warning" | "light";

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

function statusColor(status: StockStatus): BadgeColor {
  switch (status) {
    case "OK":
      return "success";
    case "LOW_STOCK":
      return "error";
    case "PARTIALLY_RESERVED":
      return "warning";
    default:
      return "light";
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
      byId.set(row.warehouse_id, {
        id: row.warehouse_id,
        code: row.warehouse_code,
        name: row.warehouse_name,
      });
    }
    return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [filterLocations]);

  const zones = useMemo(() => {
    const byId = new Map<string, { id: string; code: string; name: string }>();
    for (const row of filterLocations) {
      if (!row.zone_id || !row.zone_code) continue;
      if (filters.warehouseId && row.warehouse_id !== filters.warehouseId) continue;
      byId.set(row.zone_id, {
        id: row.zone_id,
        code: row.zone_code,
        name: row.zone_name || row.zone_code,
      });
    }
    return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [filterLocations, filters.warehouseId]);

  const locations = useMemo(
    () =>
      filterLocations
        .filter(
          (row) =>
            (!filters.warehouseId || row.warehouse_id === filters.warehouseId) &&
            (!filters.zoneId || row.zone_id === filters.zoneId),
        )
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
        .select(
          "location_id, location_code, location_name, warehouse_id, warehouse_code, warehouse_name, zone_id, zone_code, zone_name",
        )
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
    setFilters((current) => ({
      ...current,
      warehouseId: nextWarehouseId,
      zoneId: "",
      locationId: "",
    }));
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
    <ComponentCard
      title={isShelfMode ? "Shelf Inventory" : "Stock Overview"}
      desc={
        isShelfMode
          ? "Review on-hand stock by warehouse, zone, and shelf location. Use Scan QR / Barcode for guided stock changes."
          : "View on-hand, reserved, and available stock with server-side filters and pagination."
      }
    >
      {isShelfMode ? (
        <div className="flex justify-end">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
          >
            Scan QR / Barcode
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="md:col-span-2 xl:col-span-2">
          <Label htmlFor={`inventory-search-${mode}`}>Search inventory</Label>
          <Input
            id={`inventory-search-${mode}`}
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            type="search"
            placeholder="SKU, barcode, product, location..."
          />
        </div>

        <div>
          <Label htmlFor={`inventory-warehouse-${mode}`}>Warehouse</Label>
          <Select
            id={`inventory-warehouse-${mode}`}
            value={filters.warehouseId}
            onChange={handleWarehouseChange}
            disabled={isLoadingFilters}
            allowEmpty
            placeholder="All warehouses"
            options={warehouses.map((warehouse) => ({
              value: warehouse.id,
              label: `${warehouse.code} — ${warehouse.name}`,
            }))}
          />
        </div>

        <div>
          <Label htmlFor={`inventory-zone-${mode}`}>Zone</Label>
          <Select
            id={`inventory-zone-${mode}`}
            value={filters.zoneId}
            onChange={handleZoneChange}
            disabled={isLoadingFilters}
            allowEmpty
            placeholder="All zones"
            options={zones.map((zone) => ({
              value: zone.id,
              label: `${zone.code} — ${zone.name}`,
            }))}
          />
        </div>

        <div>
          <Label htmlFor={`inventory-location-${mode}`}>Location</Label>
          <Select
            id={`inventory-location-${mode}`}
            value={filters.locationId}
            onChange={(value) =>
              setFilters((current) => ({ ...current, locationId: value }))
            }
            disabled={isLoadingFilters}
            allowEmpty
            placeholder="All locations"
            options={locations.map((location) => ({
              value: location.location_id,
              label: `${location.location_code} — ${location.location_name}`,
            }))}
          />
        </div>

        <div>
          <Label htmlFor={`inventory-status-${mode}`}>Stock status</Label>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select
                id={`inventory-status-${mode}`}
                value={filters.stockStatus}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, stockStatus: value }))
                }
                allowEmpty
                placeholder="All statuses"
                options={[
                  { value: "OK", label: "OK" },
                  { value: "LOW_STOCK", label: "Low stock" },
                  { value: "PARTIALLY_RESERVED", label: "Partially reserved" },
                ]}
              />
            </div>
            <Button type="submit" size="sm" disabled={isLoading} className="shrink-0">
              Apply
            </Button>
          </div>
        </div>
      </form>

      {errorMessage ? (
        <div role="alert" className="space-y-3">
          <Alert variant="error" title="Inventory unavailable" message={errorMessage} />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadInventory(appliedFilters, offset)}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <div aria-busy={isLoading}>
        <TableViewport>
          <Table variant="admin" className="w-full min-w-[1040px]">
            <caption className="sr-only">
              {isShelfMode
                ? "Shelf inventory by product and location"
                : "Inventory by product and location"}
            </caption>
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin" className="text-left">Product</TableCell>
                <TableCell isHeader variant="admin" className="text-left">Warehouse</TableCell>
                <TableCell isHeader variant="admin" className="text-left">Zone</TableCell>
                <TableCell isHeader variant="admin" className="text-left">Location</TableCell>
                <TableCell isHeader variant="admin" className="text-right">On Hand</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Reserved</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Available</TableCell>
                <TableCell isHeader variant="admin" className="text-left">Status</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} variant="admin" className="py-8 text-center text-gray-500 dark:text-gray-400">
                    <span role="status">Loading inventory...</span>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} variant="admin" className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No inventory records found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.inventory_id}>
                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">{row.sku}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{row.product_name}</p>
                      {row.barcode ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500">Barcode: {row.barcode}</p>
                      ) : null}
                    </TableCell>
                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">{row.warehouse_code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{row.warehouse_name}</p>
                    </TableCell>
                    <TableCell variant="admin">
                      {row.zone_code ? (
                        <>
                          <p className="font-medium text-gray-800 dark:text-white/90">{row.zone_code}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{row.zone_name || "-"}</p>
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">{row.location_code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{row.location_name}</p>
                    </TableCell>
                    <TableCell variant="admin" className="text-right font-medium text-gray-800 dark:text-white/90">
                      {formatNumber(row.quantity)}
                    </TableCell>
                    <TableCell variant="admin" className="text-right">
                      {formatNumber(row.reserved_quantity)}
                    </TableCell>
                    <TableCell variant="admin" className="text-right font-medium text-gray-800 dark:text-white/90">
                      {formatNumber(row.available_quantity)}
                    </TableCell>
                    <TableCell variant="admin">
                      <Badge color={statusColor(row.stock_status)} size="sm">
                        {formatStatus(row.stock_status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableViewport>
      </div>

      <div className="flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite">
          Showing {firstVisible}–{lastVisible} of {totalCount} · Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadInventory(appliedFilters, Math.max(0, offset - PAGE_SIZE))}
            disabled={!canGoPrevious}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadInventory(appliedFilters, offset + PAGE_SIZE)}
            disabled={!canGoNext}
          >
            Next
          </Button>
        </div>
      </div>
    </ComponentCard>
  );
}
