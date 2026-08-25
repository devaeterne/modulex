"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import QRPreview from "@/components/qr/QRPreview";

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

type LocationsTableProps = {
  zoneId?: string;
  warehouseId?: string;
};

function statusClass(isActive: boolean) {
  return isActive
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
    : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
}

function warehouseTypeClass(type: WarehouseType) {
  switch (type) {
    case "sellable":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";

    case "non_sellable":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";

    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
  }
}

function formatWarehouseType(type: WarehouseType) {
  switch (type) {
    case "sellable":
      return "Sellable";

    case "non_sellable":
      return "Non-sellable";

    default:
      return type;
  }
}

function formatLocationType(value: string) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
    )
    .join(" ");
}

function formatNumber(
  value: number | string | null | undefined
) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function LocationsTable({
  zoneId,
  warehouseId,
}: LocationsTableProps) {
  const router = useRouter();

  const [locations, setLocations] = useState<LocationRow[]>(
    []
  );

  const [selectedZone, setSelectedZone] =
    useState<ZoneSummary | null>(null);

  const [selectedWarehouse, setSelectedWarehouse] =
    useState<WarehouseSummary | null>(null);

  const [query, setQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  const [actionLoadingId, setActionLoadingId] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null);

  const filteredLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return locations;
    }

    return locations.filter((location) => {
      const searchableText = [
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
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
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
          warehouses (
            id,
            code,
            name,
            warehouse_type,
            is_active
          )
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

      const warehouseRaw = Array.isArray(data.warehouses)
        ? data.warehouses[0]
        : data.warehouses;

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
          warehouse_type:
            warehouseRaw.warehouse_type ?? "sellable",
          is_active: warehouseRaw.is_active,
        });
      }

      return;
    }

    if (warehouseId) {
      const { data, error } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          warehouse_type,
          is_active
        `)
        .eq("id", warehouseId)
        .maybeSingle();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (!data) {
        setErrorMessage(
          "Selected warehouse could not be found."
        );
        return;
      }

      setSelectedWarehouse({
        id: data.id,
        code: data.code,
        name: data.name,
        warehouse_type:
          data.warehouse_type ?? "sellable",
        is_active: data.is_active,
      });
    }
  }

  async function loadLocations() {
    setIsLoading(true);
    setErrorMessage(null);

    let locationsQuery = supabase
      .from("locations")
      .select(`
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
        warehouses (
          id,
          code,
          name,
          warehouse_type,
          is_active
        ),
        zones (
          id,
          warehouse_id,
          code,
          name,
          is_active
        )
      `);

    if (zoneId) {
      locationsQuery = locationsQuery.eq(
        "zone_id",
        zoneId
      );
    }

    if (warehouseId) {
      locationsQuery = locationsQuery.eq(
        "warehouse_id",
        warehouseId
      );
    }

    let stockQuery = supabase
      .from("v_location_stock_summary")
      .select(`
        location_id,
        product_count,
        total_quantity,
        total_reserved_quantity,
        total_available_quantity,
        current_capacity,
        capacity_usage_percent
      `);

    if (zoneId) {
      stockQuery = stockQuery.eq("zone_id", zoneId);
    }

    if (warehouseId) {
      stockQuery = stockQuery.eq(
        "warehouse_id",
        warehouseId
      );
    }

    const [
      { data: locationData, error: locationError },
      { data: stockData, error: stockError },
    ] = await Promise.all([
      locationsQuery,
      stockQuery,
    ]);

    if (locationError) {
      setErrorMessage(locationError.message);
      setLocations([]);
      setIsLoading(false);
      return;
    }

    if (stockError) {
      setErrorMessage(stockError.message);
      setLocations([]);
      setIsLoading(false);
      return;
    }

    const stockByLocation = new Map<
      string,
      LocationStockSummary
    >();

    for (const row of stockData ?? []) {
      stockByLocation.set(row.location_id, {
        location_id: row.location_id,

        product_count: Number(row.product_count ?? 0),

        total_quantity: Number(
          row.total_quantity ?? 0
        ),

        total_reserved_quantity: Number(
          row.total_reserved_quantity ?? 0
        ),

        total_available_quantity: Number(
          row.total_available_quantity ?? 0
        ),

        current_capacity: Number(
          row.current_capacity ?? 0
        ),

        capacity_usage_percent:
          row.capacity_usage_percent === null
            ? null
            : Number(row.capacity_usage_percent),
      });
    }

    const mappedLocations: LocationRow[] =
      locationData?.map((location: any) => {
        const warehouseRaw = Array.isArray(
          location.warehouses
        )
          ? location.warehouses[0]
          : location.warehouses;

        const zoneRaw = Array.isArray(location.zones)
          ? location.zones[0]
          : location.zones;

        const stock = stockByLocation.get(
          location.id
        ) ?? {
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

          max_capacity:
            location.max_capacity === null
              ? null
              : Number(location.max_capacity),

          is_active: location.is_active,

          created_at: location.created_at,
          updated_at: location.updated_at,

          warehouse: warehouseRaw
            ? {
              id: warehouseRaw.id,
              code: warehouseRaw.code,
              name: warehouseRaw.name,

              warehouse_type:
                warehouseRaw.warehouse_type ??
                "sellable",

              is_active:
                warehouseRaw.is_active,
            }
            : null,

          zone: zoneRaw
            ? {
              id: zoneRaw.id,
              warehouse_id:
                zoneRaw.warehouse_id,
              code: zoneRaw.code,
              name: zoneRaw.name,
              is_active: zoneRaw.is_active,
            }
            : null,

          product_count: stock.product_count,

          total_quantity: stock.total_quantity,

          total_reserved_quantity:
            stock.total_reserved_quantity,

          total_available_quantity:
            stock.total_available_quantity,

          current_capacity:
            stock.current_capacity,

          capacity_usage_percent:
            stock.capacity_usage_percent,
        };
      }) ?? [];

    mappedLocations.sort((a, b) => {
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }

      const warehouseComparison = (
        a.warehouse?.code ?? ""
      ).localeCompare(
        b.warehouse?.code ?? ""
      );

      if (warehouseComparison !== 0) {
        return warehouseComparison;
      }

      const zoneComparison = (
        a.zone?.code ?? ""
      ).localeCompare(b.zone?.code ?? "");

      if (zoneComparison !== 0) {
        return zoneComparison;
      }

      return a.code.localeCompare(b.code);
    });

    setLocations(mappedLocations);

    await loadFilterContext();

    setIsLoading(false);
  }

  useEffect(() => {
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, warehouseId]);

  function openLocationEdit(locationId: string) {
    router.push(
      `/locations/${locationId}/edit`
    );
  }

  async function handleToggleStatus(
    location: LocationRow
  ) {
    setActionLoadingId(location.id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("locations")
      .update({
        is_active: !location.is_active,
      })
      .eq("id", location.id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadLocations();

    setActionLoadingId(null);
  }

  async function handleDeleteLocation(
    location: LocationRow
  ) {
    setErrorMessage(null);

    if (
      Number(location.total_quantity) !== 0 ||
      Number(location.total_reserved_quantity) !== 0 ||
      Number(location.total_available_quantity) !== 0
    ) {
      setErrorMessage(
        `${location.code} cannot be deleted because it contains stock. Transfer all products to another location first.`
      );

      return;
    }

    const confirmed = window.confirm(
      `Delete ${location.code} — ${location.name}?\n\nThis action is permanent. The location can only be deleted when it contains no stock.`
    );

    if (!confirmed) {
      return;
    }

    setActionLoadingId(location.id);

    const { error } = await supabase.rpc(
      "delete_location_if_empty",
      {
        p_location_id: location.id,
      }
    );

    if (error) {
      let message = error.message;

      if (
        message.includes("LOCATION_HAS_STOCK")
      ) {
        message =
          "This location still contains stock. Transfer all products to another location before deleting it.";
      }

      if (
        message.includes("LOCATION_HAS_HISTORY")
      ) {
        message =
          "This location is referenced by stock history and cannot be permanently deleted. Deactivate it instead.";
      }

      if (
        message.includes("LOCATION_NOT_FOUND")
      ) {
        message =
          "This location no longer exists. The list will be refreshed.";
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
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Location List
            </h3>

            {selectedWarehouse && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                {selectedWarehouse.code}
              </span>
            )}

            {selectedZone && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300">
                Zone {selectedZone.code}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {pageDescription}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            type="text"
            placeholder="Search location, zone or QR..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[320px]"
          />

          {(zoneId || warehouseId) && (
            <Link
              href="/locations"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              All Locations
            </Link>
          )}

          <Link
            href={addLocationHref}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add Location
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Location
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Warehouse / Zone
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                QR
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Products
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Stock
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Capacity
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Status
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Updated
              </th>

              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Loading locations...
                </td>
              </tr>
            ) : filteredLocations.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No locations found.
                </td>
              </tr>
            ) : (
              filteredLocations.map((location) => {
                const isActionLoading =
                  actionLoadingId === location.id;

                return (
                  <tr
                    key={location.id}
                    onDoubleClick={() =>
                      openLocationEdit(location.id)
                    }
                    title="Double click to edit"
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {location.code}
                          </span>

                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-400">
                            {formatLocationType(
                              location.location_type
                            )}
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {location.name}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {location.warehouse?.code ??
                              "-"}
                          </span>

                          {location.warehouse && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${warehouseTypeClass(
                                location.warehouse
                                  .warehouse_type
                              )}`}
                            >
                              {formatWarehouseType(
                                location.warehouse
                                  .warehouse_type
                              )}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {location.zone
                            ? `Zone ${location.zone.code} — ${location.zone.name}`
                            : "No zone"}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex min-w-[290px] items-center gap-4">
                        <QRPreview
                          value={
                            location.qr_payload ||
                            location.qr_code ||
                            ""
                          }
                          code={location.qr_code || undefined}
                          size={72}
                        />

                        <div className="max-w-[190px]">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            QR Code
                          </p>

                          <p className="mt-1 break-all font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {location.qr_code || "-"}
                          </p>

                          <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            Payload
                          </p>

                          <p className="mt-1 break-all font-mono text-[11px] text-gray-500 dark:text-gray-400">
                            {location.qr_payload || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatNumber(
                        location.product_count
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          Total:{" "}
                          {formatNumber(
                            location.total_quantity
                          )}
                        </p>

                        <p className="text-success-700 dark:text-success-400">
                          Available:{" "}
                          {formatNumber(
                            location.total_available_quantity
                          )}
                        </p>

                        <p className="text-warning-700 dark:text-warning-400">
                          Reserved:{" "}
                          {formatNumber(
                            location.total_reserved_quantity
                          )}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {location.max_capacity === null ? (
                        <span className="text-xs text-gray-400">
                          Not set
                        </span>
                      ) : (
                        <div className="space-y-1 text-xs">
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {formatNumber(
                              location.current_capacity
                            )}{" "}
                            /{" "}
                            {formatNumber(
                              location.max_capacity
                            )}
                          </p>

                          {location.capacity_usage_percent !==
                            null && (
                              <p className="text-gray-500 dark:text-gray-400">
                                {formatNumber(
                                  location.capacity_usage_percent
                                )}
                                %
                              </p>
                            )}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          location.is_active
                        )}`}
                      >
                        {location.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(
                        location.updated_at
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex min-w-[280px] items-center justify-end gap-2">
                        <Link
                          href={`/locations/${location.id}/edit`}
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();

                            handleToggleStatus(
                              location
                            );
                          }}
                          disabled={isActionLoading}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${location.is_active
                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"
                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
                            }`}
                        >
                          {location.is_active
                            ? "Deactivate"
                            : "Activate"}
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();

                            handleDeleteLocation(
                              location
                            );
                          }}
                          disabled={isActionLoading}
                          className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}