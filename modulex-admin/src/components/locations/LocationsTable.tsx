"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
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
import QRPreview from "@/components/qr/QRPreview";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseSummary = {
  id: string;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  is_active: boolean;
};

type ZoneSummary = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type LocationRow = {
  id: string;
  warehouse_id: string;
  zone_id: string | null;
  code: string;
  name: string;
  location_type: string;
  qr_code: string | null;
  qr_payload: string | null;
  qr_svg_url: string | null;
  max_capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  warehouse: WarehouseSummary | null;
  zone: ZoneSummary | null;
  product_count: number;
  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
  current_capacity: number;
  capacity_usage_percent: number | null;
};

type LocationStockSummary = {
  location_id: string;
  product_count: number;
  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
  current_capacity: number;
  capacity_usage_percent: number | null;
};

type LocationsTableProps = { zoneId?: string; warehouseId?: string };

function formatWarehouseType(type: WarehouseType) {
  return type === "sellable" ? "Sellable" : "Non-sellable";
}

function formatLocationType(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export default function LocationsTable({ zoneId, warehouseId }: LocationsTableProps) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [selectedZone, setSelectedZone] = useState<ZoneSummary | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseSummary | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  const filteredLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return locations;
    return locations.filter((location) =>
      [
        location.code,
        location.name,
        location.location_type,
        location.qr_code,
        location.qr_payload,
        location.warehouse?.code,
        location.warehouse?.name,
        location.zone?.code,
        location.zone?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [locations, query]);

  async function loadFilterContext() {
    setSelectedZone(null);
    setSelectedWarehouse(null);

    if (zoneId) {
      const { data, error } = await supabase
        .from("zones")
        .select(`
          id,
          warehouse_id,
          code,
          name,
          is_active,
          warehouses (id, code, name, warehouse_type, is_active)
        `)
        .eq("id", zoneId)
        .maybeSingle();

      if (error) {
        setErrorMessage(error.message);
        return;
      }
      if (!data) {
        setErrorMessage("Selected zone could not be found.");
        return;
      }

      const warehouseRaw = Array.isArray(data.warehouses) ? data.warehouses[0] : data.warehouses;
      setSelectedZone({
        id: data.id,
        warehouse_id: data.warehouse_id,
        code: data.code,
        name: data.name,
        is_active: data.is_active,
      });
      if (warehouseRaw) {
        setSelectedWarehouse({
          id: warehouseRaw.id,
          code: warehouseRaw.code,
          name: warehouseRaw.name,
          warehouse_type: warehouseRaw.warehouse_type ?? "sellable",
          is_active: warehouseRaw.is_active,
        });
      }
      return;
    }

    if (warehouseId) {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name, warehouse_type, is_active")
        .eq("id", warehouseId)
        .maybeSingle();

      if (error) {
        setErrorMessage(error.message);
        return;
      }
      if (!data) {
        setErrorMessage("Selected warehouse could not be found.");
        return;
      }
      setSelectedWarehouse({
        id: data.id,
        code: data.code,
        name: data.name,
        warehouse_type: data.warehouse_type ?? "sellable",
        is_active: data.is_active,
      });
    }
  }

  async function loadLocations() {
    setIsLoading(true);
    setErrorMessage(null);

    let locationsQuery = supabase.from("locations").select(`
      id,
      warehouse_id,
      zone_id,
      code,
      name,
      location_type,
      qr_code,
      qr_payload,
      qr_svg_url,
      max_capacity,
      is_active,
      created_at,
      updated_at,
      warehouses (id, code, name, warehouse_type, is_active),
      zones (id, warehouse_id, code, name, is_active)
    `);

    if (zoneId) {
      locationsQuery = locationsQuery.eq("zone_id", zoneId);
    }
    if (warehouseId) {
      locationsQuery = locationsQuery.eq("warehouse_id", warehouseId);
    }

    let stockQuery = supabase.from("v_location_stock_summary").select(`
      location_id,
      product_count,
      total_quantity,
      total_reserved_quantity,
      total_available_quantity,
      current_capacity,
      capacity_usage_percent
    `);
    if (zoneId) stockQuery = stockQuery.eq("zone_id", zoneId);
    if (warehouseId) stockQuery = stockQuery.eq("warehouse_id", warehouseId);

    const [locationResult, stockResult] = await Promise.all([locationsQuery, stockQuery]);
    if (locationResult.error) {
      setErrorMessage(locationResult.error.message);
      setLocations([]);
      setIsLoading(false);
      return;
    }
    if (stockResult.error) {
      setErrorMessage(stockResult.error.message);
      setLocations([]);
      setIsLoading(false);
      return;
    }

    const stockByLocation = new Map<string, LocationStockSummary>();
    for (const row of stockResult.data ?? []) {
      stockByLocation.set(row.location_id, {
        location_id: row.location_id,
        product_count: Number(row.product_count ?? 0),
        total_quantity: Number(row.total_quantity ?? 0),
        total_reserved_quantity: Number(row.total_reserved_quantity ?? 0),
        total_available_quantity: Number(row.total_available_quantity ?? 0),
        current_capacity: Number(row.current_capacity ?? 0),
        capacity_usage_percent:
          row.capacity_usage_percent === null ? null : Number(row.capacity_usage_percent),
      });
    }

    const mappedLocations: LocationRow[] =
      locationResult.data?.map((location: any) => {
        const warehouseRaw = Array.isArray(location.warehouses)
          ? location.warehouses[0]
          : location.warehouses;
        const zoneRaw = Array.isArray(location.zones) ? location.zones[0] : location.zones;
        const stock = stockByLocation.get(location.id) ?? {
          location_id: location.id,
          product_count: 0,
          total_quantity: 0,
          total_reserved_quantity: 0,
          total_available_quantity: 0,
          current_capacity: 0,
          capacity_usage_percent: null,
        };

        return {
          id: location.id,
          warehouse_id: location.warehouse_id,
          zone_id: location.zone_id,
          code: location.code,
          name: location.name,
          location_type: location.location_type,
          qr_code: location.qr_code,
          qr_payload: location.qr_payload,
          qr_svg_url: location.qr_svg_url,
          max_capacity: location.max_capacity === null ? null : Number(location.max_capacity),
          is_active: location.is_active,
          created_at: location.created_at,
          updated_at: location.updated_at,
          warehouse: warehouseRaw
            ? {
                id: warehouseRaw.id,
                code: warehouseRaw.code,
                name: warehouseRaw.name,
                warehouse_type: warehouseRaw.warehouse_type ?? "sellable",
                is_active: warehouseRaw.is_active,
              }
            : null,
          zone: zoneRaw
            ? {
                id: zoneRaw.id,
                warehouse_id: zoneRaw.warehouse_id,
                code: zoneRaw.code,
                name: zoneRaw.name,
                is_active: zoneRaw.is_active,
              }
            : null,
          product_count: stock.product_count,
          total_quantity: stock.total_quantity,
          total_reserved_quantity: stock.total_reserved_quantity,
          total_available_quantity: stock.total_available_quantity,
          current_capacity: stock.current_capacity,
          capacity_usage_percent: stock.capacity_usage_percent,
        };
      }) ?? [];

    mappedLocations.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const warehouseComparison = (a.warehouse?.code ?? "").localeCompare(b.warehouse?.code ?? "");
      if (warehouseComparison !== 0) return warehouseComparison;
      const zoneComparison = (a.zone?.code ?? "").localeCompare(b.zone?.code ?? "");
      return zoneComparison !== 0 ? zoneComparison : a.code.localeCompare(b.code);
    });

    setLocations(mappedLocations);
    await loadFilterContext();
    setIsLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    void getCurrentProfile().then(({ profile }) => {
      if (mounted) {
        setCanManage(profile ? hasPermission(profile.role, "warehouse.manage") : false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, warehouseId]);

  function openLocationEdit(locationId: string) {
    if (!canManage) return;
    router.push(`/locations/${locationId}/edit`);
  }

  async function handleToggleStatus(location: LocationRow) {
    if (!canManage) return;
    setActionLoadingId(location.id);
    setErrorMessage(null);
    const { error } = await supabase
      .from("locations")
      .update({ is_active: !location.is_active })
      .eq("id", location.id);
    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }
    await loadLocations();
    setActionLoadingId(null);
  }

  async function handleDeleteLocation(location: LocationRow) {
    if (!canManage) return;
    setErrorMessage(null);

    if (
      Number(location.total_quantity) !== 0 ||
      Number(location.total_reserved_quantity) !== 0 ||
      Number(location.total_available_quantity) !== 0
    ) {
      setErrorMessage(
        `${location.code} cannot be deleted because it contains stock. Transfer all products to another location first.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete ${location.code} — ${location.name}?\n\nThis action is permanent. The location can only be deleted when it contains no stock.`,
    );
    if (!confirmed) return;

    setActionLoadingId(location.id);
    const { error } = await supabase.rpc("delete_location_if_empty", {
      p_location_id: location.id,
    });

    if (error) {
      let message = error.message;
      if (message.includes("LOCATION_HAS_STOCK")) {
        message = "This location still contains stock. Transfer all products to another location before deleting it.";
      }
      if (message.includes("LOCATION_HAS_HISTORY")) {
        message = "This location is referenced by stock history and cannot be permanently deleted. Deactivate it instead.";
      }
      if (message.includes("LOCATION_NOT_FOUND")) {
        message = "This location no longer exists. The list will be refreshed.";
      }
      setErrorMessage(message);
      setActionLoadingId(null);
      await loadLocations();
      return;
    }

    await loadLocations();
    setActionLoadingId(null);
  }

  const addLocationHref = zoneId
    ? `/locations/new?zone=${zoneId}`
    : warehouseId
      ? `/locations/new?warehouse=${warehouseId}`
      : "/locations/new";

  const pageDescription = selectedZone
    ? `Manage shelf locations inside ${selectedWarehouse?.code ?? ""} / ${selectedZone.code} — ${selectedZone.name}.`
    : selectedWarehouse
      ? `Manage shelf locations inside ${selectedWarehouse.name}.`
      : "Manage warehouse shelf locations, QR identities, capacity, and current stock.";

  return (
    <ComponentCard title="Location List" desc={pageDescription}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {selectedWarehouse ? <Badge color="primary" size="sm">{selectedWarehouse.code}</Badge> : null}
          {selectedZone ? <Badge color="light" size="sm">Zone {selectedZone.code}</Badge> : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-[320px]">
            <Label htmlFor="location-search" className="sr-only">Search locations</Label>
            <Input
              id="location-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search location, zone or QR..."
            />
          </div>

          {zoneId || warehouseId ? (
            <Link
              href="/locations"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              All Locations
            </Link>
          ) : null}

          {canManage ? (
            <Link
              href={addLocationHref}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              Add Location
            </Link>
          ) : null}
        </div>
      </div>

      {errorMessage ? <Alert variant="error" title="Location action failed" message={errorMessage} /> : null}

      <TableViewport>
        <Table variant="admin" className="w-full min-w-[1680px]">
          <TableHeader variant="admin">
            <TableRow>
              {["Location", "Warehouse / Zone", "QR", "Products", "Stock", "Capacity", "Status", "Updated"].map(
                (label) => (
                  <TableCell key={label} isHeader variant="admin" className="text-left">{label}</TableCell>
                ),
              )}
              <TableCell isHeader variant="admin" className="text-right">Actions</TableCell>
            </TableRow>
          </TableHeader>

          <TableBody variant="admin">
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} variant="admin" className="py-8 text-center">
                  <span role="status">Loading locations...</span>
                </TableCell>
              </TableRow>
            ) : filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} variant="admin" className="py-8 text-center">No locations found.</TableCell>
              </TableRow>
            ) : (
              filteredLocations.map((location) => {
                const isActionLoading = actionLoadingId === location.id;
                return (
                  <TableRow
                    key={location.id}
                    onDoubleClick={canManage ? () => openLocationEdit(location.id) : undefined}
                    title={canManage ? "Double click to edit" : undefined}
                    className={canManage ? "cursor-pointer" : undefined}
                  >
                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-800 dark:text-white/90">{location.code}</span>
                          <Badge color="light" size="sm">{formatLocationType(location.location_type)}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{location.name}</p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-800 dark:text-white/90">{location.warehouse?.code ?? "-"}</span>
                          {location.warehouse ? (
                            <Badge color={location.warehouse.warehouse_type === "sellable" ? "success" : "warning"} size="sm">
                              {formatWarehouseType(location.warehouse.warehouse_type)}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {location.zone ? `Zone ${location.zone.code} — ${location.zone.name}` : "No zone"}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="flex min-w-[290px] items-center gap-4">
                        <QRPreview
                          value={location.qr_payload || location.qr_code || ""}
                          code={location.qr_code || undefined}
                          size={72}
                        />
                        <div className="max-w-[190px] space-y-2">
                          <p className="break-all font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{location.qr_code || "-"}</p>
                          <p className="break-all font-mono text-[11px] text-gray-500 dark:text-gray-400">{location.qr_payload || "-"}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top font-medium text-gray-800 dark:text-white/90">
                      {formatNumber(location.product_count)}
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-gray-800 dark:text-white/90">Total: {formatNumber(location.total_quantity)}</p>
                        <p className="text-success-700 dark:text-success-400">Available: {formatNumber(location.total_available_quantity)}</p>
                        <p className="text-warning-700 dark:text-warning-400">Reserved: {formatNumber(location.total_reserved_quantity)}</p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      {location.max_capacity === null ? (
                        <span className="text-xs text-gray-400">Not set</span>
                      ) : (
                        <div className="space-y-1 text-xs">
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {formatNumber(location.current_capacity)} / {formatNumber(location.max_capacity)}
                          </p>
                          {location.capacity_usage_percent !== null ? (
                            <p className="text-gray-500 dark:text-gray-400">{formatNumber(location.capacity_usage_percent)}%</p>
                          ) : null}
                        </div>
                      )}
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <Badge color={location.is_active ? "success" : "light"} size="sm">
                        {location.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>

                    <TableCell variant="admin" className="align-top text-gray-500 dark:text-gray-400">
                      {formatDate(location.updated_at)}
                    </TableCell>

                    <TableCell variant="admin" className="align-top text-right">
                      <div className="flex min-w-[280px] items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        {canManage ? (
                          <Link
                            href={`/locations/${location.id}/edit`}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                          >
                            Edit
                          </Link>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="outline" disabled={isActionLoading} onClick={() => void handleToggleStatus(location)}>
                            {location.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="outline" disabled={isActionLoading} onClick={() => void handleDeleteLocation(location)}>
                            <span className="text-error-600 dark:text-error-400">Delete</span>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableViewport>
    </ComponentCard>
  );
}
