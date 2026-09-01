"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
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

type ZonesTableProps = { warehouseId?: string };
type ZoneStockSummary = {
  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
};

function formatWarehouseType(type: WarehouseType) {
  return type === "sellable" ? "Sellable" : "Non-sellable";
}

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
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
    if (!normalizedQuery) return zones;
    return zones.filter((zone) =>
      [
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
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [zones, query]);

  const selectedWarehouse = useMemo(() => {
    if (!warehouseId) return null;
    return zones.find((zone) => zone.warehouse_id === warehouseId)?.warehouse ?? null;
  }, [zones, warehouseId]);

  async function loadZones() {
    setIsLoading(true);
    setErrorMessage(null);

    let zonesQuery = supabase.from("zones").select(`
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
      warehouses (id, code, name, warehouse_type, is_active),
      locations (id)
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
      .select("zone_id, warehouse_id, total_quantity, total_reserved_quantity, total_available_quantity");

    if (warehouseId) stockQuery = stockQuery.eq("warehouse_id", warehouseId);

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
      current.total_reserved_quantity += Number(row.total_reserved_quantity ?? 0);
      current.total_available_quantity += Number(row.total_available_quantity ?? 0);
      stockByZone.set(row.zone_id, current);
    }

    const mappedZones: ZoneRow[] =
      zoneData?.map((zone: any) => {
        const warehouseRaw = Array.isArray(zone.warehouses) ? zone.warehouses[0] : zone.warehouses;
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
                warehouse_type: warehouseRaw.warehouse_type ?? "sellable",
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
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const warehouseComparison = (a.warehouse?.code ?? "").localeCompare(b.warehouse?.code ?? "");
      return warehouseComparison !== 0 ? warehouseComparison : a.code.localeCompare(b.code);
    });

    setZones(mappedZones);
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
    void loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  function openZoneEdit(zoneId: string) {
    if (!canManage) return;
    router.push(`/zones/${zoneId}/edit`);
  }

  async function handleToggleStatus(zone: ZoneRow) {
    if (!canManage) return;
    setActionLoadingId(zone.id);
    setErrorMessage(null);
    const { error } = await supabase.from("zones").update({ is_active: !zone.is_active }).eq("id", zone.id);
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
        `${zone.warehouse?.code ?? ""} / ${zone.code} cannot be deleted because it contains stock. Transfer all products to another zone first.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete ${zone.warehouse?.code ?? ""} / ${zone.code} — ${zone.name}?\n\nThis action is permanent. The zone can only be deleted when it contains no stock and no locations.`,
    );
    if (!confirmed) return;

    setActionLoadingId(zone.id);
    const { error } = await supabase.rpc("delete_zone_if_empty", { p_zone_id: zone.id });

    if (error) {
      let message = error.message;
      if (message.includes("ZONE_HAS_STOCK")) {
        message = "This zone still contains stock. Transfer all products to another zone before deleting it.";
      }
      if (message.includes("ZONE_HAS_LOCATIONS")) {
        message = "This zone still contains shelf locations. Move or delete the empty locations before deleting the zone.";
      }
      if (message.includes("ZONE_NOT_FOUND")) {
        message = "This zone no longer exists. The list will be refreshed.";
      }
      setErrorMessage(message);
      setActionLoadingId(null);
      await loadZones();
      return;
    }

    await loadZones();
    setActionLoadingId(null);
  }

  const addZoneHref = warehouseId ? `/zones/new?warehouse=${warehouseId}` : "/zones/new";
  const description = selectedWarehouse
    ? `Manage zones inside ${selectedWarehouse.name}.`
    : "Manage warehouse zones, QR identities, shelf structure, and current stock.";

  return (
    <ComponentCard title="Zone List" desc={description}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {selectedWarehouse ? (
            <Badge color="primary" size="sm">
              {selectedWarehouse.code}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-[320px]">
            <Label htmlFor="zone-search" className="sr-only">Search zones</Label>
            <Input
              id="zone-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search warehouse, zone or QR..."
            />
          </div>

          {warehouseId ? (
            <Link
              href="/zones"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              All Warehouses
            </Link>
          ) : null}

          {canManage ? (
            <Link
              href={addZoneHref}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              Add Zone
            </Link>
          ) : null}
        </div>
      </div>

      {errorMessage ? <Alert variant="error" title="Zone action failed" message={errorMessage} /> : null}

      <TableViewport>
        <Table variant="admin" className="w-full min-w-[1520px]">
          <TableHeader variant="admin">
            <TableRow>
              {["Zone", "Warehouse", "QR", "Structure", "Stock", "Status", "Updated"].map((label) => (
                <TableCell key={label} isHeader variant="admin" className="text-left">
                  {label}
                </TableCell>
              ))}
              <TableCell isHeader variant="admin" className="text-right">Actions</TableCell>
            </TableRow>
          </TableHeader>

          <TableBody variant="admin">
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} variant="admin" className="py-8 text-center">
                  <span role="status">Loading zones...</span>
                </TableCell>
              </TableRow>
            ) : filteredZones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} variant="admin" className="py-8 text-center">No zones found.</TableCell>
              </TableRow>
            ) : (
              filteredZones.map((zone) => {
                const isActionLoading = actionLoadingId === zone.id;
                return (
                  <TableRow
                    key={zone.id}
                    onDoubleClick={canManage ? () => openZoneEdit(zone.id) : undefined}
                    title={canManage ? "Double click to edit" : undefined}
                    className={canManage ? "cursor-pointer" : undefined}
                  >
                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-800 dark:text-white/90">{zone.code}</span>
                          <Badge color="light" size="sm">{zone.name}</Badge>
                        </div>
                        <p className="max-w-[380px] text-xs text-gray-500 dark:text-gray-400">
                          {zone.description || "No description."}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      {zone.warehouse ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-gray-800 dark:text-white/90">{zone.warehouse.code}</span>
                            <Badge color={zone.warehouse.warehouse_type === "sellable" ? "success" : "warning"} size="sm">
                              {formatWarehouseType(zone.warehouse.warehouse_type)}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{zone.warehouse.name}</p>
                        </div>
                      ) : "-"}
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="flex min-w-[290px] items-center gap-4">
                        <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
                          {zone.qr_payload ? (
                            <QRCodeSVG value={zone.qr_payload} size={72} level="M" includeMargin={false} />
                          ) : (
                            <div className="flex h-[72px] w-[72px] items-center justify-center text-xs text-gray-400">No QR</div>
                          )}
                        </div>
                        <div className="max-w-[190px] space-y-2">
                          <p className="break-all font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{zone.qr_code || "-"}</p>
                          <p className="break-all font-mono text-[11px] text-gray-500 dark:text-gray-400">{zone.qr_payload || "-"}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <Badge color="light" size="sm">{zone.shelf_count} Shelves</Badge>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-gray-800 dark:text-white/90">Total: {formatNumber(zone.total_quantity)}</p>
                        <p className="text-gray-500 dark:text-gray-400">Available: {formatNumber(zone.total_available_quantity)}</p>
                        <p className="text-gray-500 dark:text-gray-400">Reserved: {formatNumber(zone.total_reserved_quantity)}</p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <Badge color={zone.is_active ? "success" : "light"} size="sm">
                        {zone.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>

                    <TableCell variant="admin" className="align-top text-gray-500 dark:text-gray-400">
                      {formatDate(zone.updated_at)}
                    </TableCell>

                    <TableCell variant="admin" className="align-top text-right">
                      <div className="flex min-w-[300px] items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        {canManage ? (
                          <Link
                            href={`/zones/${zone.id}/edit`}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                          >
                            Edit
                          </Link>
                        ) : null}
                        <Link
                          href={`/locations?zone=${zone.id}`}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Locations
                        </Link>
                        {canManage ? (
                          <Button size="sm" variant="outline" disabled={isActionLoading} onClick={() => void handleToggleStatus(zone)}>
                            {zone.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="outline" disabled={isActionLoading} onClick={() => void handleDeleteZone(zone)}>
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
