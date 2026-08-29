"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import { QRCodeSVG } from "qrcode.react";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseSummary = {
  id: string;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  is_active: boolean;
};

type ZoneRow = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;

  qr_code: string | null;
  qr_payload: string | null;
  qr_svg_url: string | null;

  created_at: string;
  updated_at: string;

  warehouse: WarehouseSummary | null;

  shelf_count: number;

  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
};

type ZonesTableProps = {
  warehouseId?: string;
};

type ZoneStockSummary = {
  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
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

function formatNumber(value: number | string | null | undefined) {
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

export default function ZonesTable({ warehouseId }: ZonesTableProps) {
  const router = useRouter();

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  const filteredZones = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return zones;
    }

    return zones.filter((zone) => {
      const searchableText = [
        zone.code,
        zone.name,
        zone.description,
        zone.qr_code,
        zone.qr_payload,
        zone.warehouse?.code,
        zone.warehouse?.name,
        zone.warehouse?.warehouse_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [zones, query]);

  const selectedWarehouse = useMemo(() => {
    if (!warehouseId) return null;

    return (
      zones.find((zone) => zone.warehouse_id === warehouseId)?.warehouse ?? null
    );
  }, [zones, warehouseId]);

  async function loadZones() {
    setIsLoading(true);
    setErrorMessage(null);

    let zonesQuery = supabase
      .from("zones")
      .select(`
        id,
        warehouse_id,
        code,
        name,
        description,
        is_active,
        qr_code,
        qr_payload,
        qr_svg_url,
        created_at,
        updated_at,
        warehouses (
          id,
          code,
          name,
          warehouse_type,
          is_active
        ),
        locations (
          id
        )
      `);

    if (warehouseId) {
      zonesQuery = zonesQuery.eq("warehouse_id", warehouseId);
    }

    const { data: zoneData, error: zoneError } = await zonesQuery;

    if (zoneError) {
      setErrorMessage(zoneError.message);
      setZones([]);
      setIsLoading(false);
      return;
    }

    let stockQuery = supabase
      .from("v_location_stock_summary")
      .select(
        "zone_id, warehouse_id, total_quantity, total_reserved_quantity, total_available_quantity"
      );

    if (warehouseId) {
      stockQuery = stockQuery.eq("warehouse_id", warehouseId);
    }

    const { data: stockData, error: stockError } = await stockQuery;

    if (stockError) {
      setErrorMessage(stockError.message);
      setZones([]);
      setIsLoading(false);
      return;
    }

    const stockByZone = new Map<string, ZoneStockSummary>();

    for (const row of stockData ?? []) {
      if (!row.zone_id) continue;

      const current = stockByZone.get(row.zone_id) ?? {
        total_quantity: 0,
        total_reserved_quantity: 0,
        total_available_quantity: 0,
      };

      current.total_quantity += Number(row.total_quantity ?? 0);
      current.total_reserved_quantity += Number(
        row.total_reserved_quantity ?? 0
      );
      current.total_available_quantity += Number(
        row.total_available_quantity ?? 0
      );

      stockByZone.set(row.zone_id, current);
    }

    const mappedZones: ZoneRow[] =
      zoneData?.map((zone: any) => {
        const warehouseRaw = Array.isArray(zone.warehouses)
          ? zone.warehouses[0]
          : zone.warehouses;

        const stock = stockByZone.get(zone.id) ?? {
          total_quantity: 0,
          total_reserved_quantity: 0,
          total_available_quantity: 0,
        };

        return {
          id: zone.id,
          warehouse_id: zone.warehouse_id,
          code: zone.code,
          name: zone.name,
          description: zone.description,
          is_active: zone.is_active,

          qr_code: zone.qr_code,
          qr_payload: zone.qr_payload,
          qr_svg_url: zone.qr_svg_url,

          created_at: zone.created_at,
          updated_at: zone.updated_at,

          warehouse: warehouseRaw
            ? {
              id: warehouseRaw.id,
              code: warehouseRaw.code,
              name: warehouseRaw.name,
              warehouse_type:
                warehouseRaw.warehouse_type ?? "sellable",
              is_active: warehouseRaw.is_active,
            }
            : null,

          shelf_count: zone.locations?.length ?? 0,

          total_quantity: stock.total_quantity,
          total_reserved_quantity: stock.total_reserved_quantity,
          total_available_quantity: stock.total_available_quantity,
        };
      }) ?? [];

    mappedZones.sort((a, b) => {
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }

      const warehouseComparison = (a.warehouse?.code ?? "").localeCompare(
        b.warehouse?.code ?? ""
      );

      if (warehouseComparison !== 0) {
        return warehouseComparison;
      }

      return a.code.localeCompare(b.code);
    });

    setZones(mappedZones);
    setIsLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    void getCurrentProfile().then(({ profile }) => {
      if (mounted) {
        setCanManage(
          profile ? hasPermission(profile.role, "warehouse.manage") : false
        );
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadZones();
  }, [warehouseId]);

  function openZoneEdit(zoneId: string) {
    if (!canManage) return;
    router.push(`/zones/${zoneId}/edit`);
  }

  async function handleToggleStatus(zone: ZoneRow) {
    if (!canManage) return;
    setActionLoadingId(zone.id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("zones")
      .update({
        is_active: !zone.is_active,
      })
      .eq("id", zone.id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadZones();
    setActionLoadingId(null);
  }
  async function handleDeleteZone(zone: ZoneRow) {
    if (!canManage) return;
    setErrorMessage(null);

    if (
      Number(zone.total_quantity) !== 0 ||
      Number(zone.total_reserved_quantity) !== 0 ||
      Number(zone.total_available_quantity) !== 0
    ) {
      setErrorMessage(
        `${zone.warehouse?.code ?? ""} / ${zone.code} cannot be deleted because it contains stock. Transfer all products to another zone first.`
      );

      return;
    }

    const confirmed = window.confirm(
      `Delete ${zone.warehouse?.code ?? ""} / ${zone.code} — ${zone.name}?\n\nThis action is permanent. The zone can only be deleted when it contains no stock and no locations.`
    );

    if (!confirmed) {
      return;
    }

    setActionLoadingId(zone.id);

    const { error } = await supabase.rpc(
      "delete_zone_if_empty",
      {
        p_zone_id: zone.id,
      }
    );

    if (error) {
      let message = error.message;

      if (message.includes("ZONE_HAS_STOCK")) {
        message =
          "This zone still contains stock. Transfer all products to another zone before deleting it.";
      }

      if (message.includes("ZONE_HAS_LOCATIONS")) {
        message =
          "This zone still contains shelf locations. Move or delete the empty locations before deleting the zone.";
      }

      if (message.includes("ZONE_NOT_FOUND")) {
        message =
          "This zone no longer exists. The list will be refreshed.";
      }

      setErrorMessage(message);
      setActionLoadingId(null);

      await loadZones();

      return;
    }

    await loadZones();

    setActionLoadingId(null);
  }
  const addZoneHref = warehouseId
    ? `/zones/new?warehouse=${warehouseId}`
    : "/zones/new";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Zone List
            </h3>

            {selectedWarehouse && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                {selectedWarehouse.code}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {selectedWarehouse
              ? `Manage zones inside ${selectedWarehouse.name}.`
              : "Manage warehouse zones, QR identities, shelf structure, and current stock."}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="text"
            placeholder="Search warehouse, zone or QR..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[320px]"
          />

          {warehouseId && (
            <Link
              href="/zones"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              All Warehouses
            </Link>
          )}

          {canManage && (
            <Link
              href={addZoneHref}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
            >
              Add Zone
            </Link>
          )}
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
                Zone
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Warehouse
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                QR
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Structure
              </th>

              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Stock
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
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Loading zones...
                </td>
              </tr>
            ) : filteredZones.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No zones found.
                </td>
              </tr>
            ) : (
              filteredZones.map((zone) => {
                const isActionLoading = actionLoadingId === zone.id;

                return (
                  <tr
                    key={zone.id}
                    onDoubleClick={canManage ? () => openZoneEdit(zone.id) : undefined}
                    title={canManage ? "Double click to edit" : undefined}
                    className={`${canManage ? "cursor-pointer " : ""}transition hover:bg-gray-50 dark:hover:bg-white/[0.03]`}
                  >
                    <td className="px-5 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {zone.code}
                          </span>

                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                            {zone.name}
                          </span>
                        </div>

                        <p className="mt-1 max-w-[380px] text-xs text-gray-500 dark:text-gray-400">
                          {zone.description || "No description."}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {zone.warehouse ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {zone.warehouse.code}
                            </span>

                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${warehouseTypeClass(
                                zone.warehouse.warehouse_type
                              )}`}
                            >
                              {formatWarehouseType(
                                zone.warehouse.warehouse_type
                              )}
                            </span>
                          </div>

                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {zone.warehouse.name}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          -
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex min-w-[290px] items-center gap-4">
                        <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700">
                          {zone.qr_payload ? (
                            <QRCodeSVG
                              value={zone.qr_payload}
                              size={72}
                              level="M"
                              includeMargin={false}
                            />
                          ) : (
                            <div className="flex h-[72px] w-[72px] items-center justify-center text-xs text-gray-400">
                              No QR
                            </div>
                          )}
                        </div>

                        <div className="max-w-[190px]">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            QR Code
                          </p>

                          <p className="mt-1 break-all font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {zone.qr_code || "-"}
                          </p>

                          <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            Payload
                          </p>

                          <p className="mt-1 break-all font-mono text-[11px] text-gray-500 dark:text-gray-400">
                            {zone.qr_payload || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                        {zone.shelf_count} Shelves
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {formatNumber(zone.total_quantity)}
                        </p>

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Available:{" "}
                          {formatNumber(zone.total_available_quantity)}
                        </p>

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Reserved:{" "}
                          {formatNumber(zone.total_reserved_quantity)}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          zone.is_active
                        )}`}
                      >
                        {zone.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(zone.updated_at)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex min-w-[260px] items-center justify-end gap-2">
                        {canManage && (
                          <Link
                            href={`/zones/${zone.id}/edit`}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                          >
                            Edit
                          </Link>
                        )}

                        <Link
                          href={`/locations?zone=${zone.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Locations
                        </Link>

                        {canManage && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleStatus(zone);
                            }}
                            disabled={isActionLoading}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${zone.is_active
                              ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"
                              : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
                              }`}
                          >
                            {zone.is_active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteZone(zone);
                            }}
                            disabled={isActionLoading}
                            className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/20"
                          >
                            Delete
                          </button>
                        )}
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