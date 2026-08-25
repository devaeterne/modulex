"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  warehouse_type: WarehouseType;
  is_active: boolean;
  qr_code: string | null;
  qr_payload: string | null;
  qr_svg_url: string | null;
  created_at: string;
  updated_at: string;
  zone_count?: number;
  location_count?: number;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function WarehousesTable() {
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredWarehouses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return warehouses;

    return warehouses.filter((warehouse) => {
      const searchableText = [
        warehouse.code,
        warehouse.name,
        warehouse.description,
        warehouse.warehouse_type,
        warehouse.qr_code,
        warehouse.qr_payload,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [warehouses, query]);

  async function loadWarehouses() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("warehouses")
      .select(
        `
        id,
        name,
        code,
        description,
        address,
        city,
        country,
        warehouse_type,
        is_active,
        qr_code,
        qr_payload,
        qr_svg_url,
        created_at,
        updated_at,
        zones(id),
        locations(id)
      `
      )
      .order("code", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setWarehouses([]);
      setIsLoading(false);
      return;
    }

    const mappedRows =
      data?.map((warehouse: any) => ({
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        description: warehouse.description,
        address: warehouse.address,
        city: warehouse.city,
        country: warehouse.country,
        warehouse_type: warehouse.warehouse_type ?? "sellable",
        is_active: warehouse.is_active,
        qr_code: warehouse.qr_code,
        qr_payload: warehouse.qr_payload,
        qr_svg_url: warehouse.qr_svg_url,
        created_at: warehouse.created_at,
        updated_at: warehouse.updated_at,
        zone_count: warehouse.zones?.length ?? 0,
        location_count: warehouse.locations?.length ?? 0,
      })) ?? [];

    setWarehouses(mappedRows);
    setIsLoading(false);
  }

  useEffect(() => {
    loadWarehouses();
  }, []);

  function openWarehouseEdit(warehouseId: string) {
    router.push(`/warehouses/${warehouseId}/edit`);
  }

  async function handleToggleStatus(warehouse: WarehouseRow) {
    setActionLoadingId(warehouse.id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("warehouses")
      .update({ is_active: !warehouse.is_active })
      .eq("id", warehouse.id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadWarehouses();
    setActionLoadingId(null);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Warehouse List
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage sellable and non-sellable warehouses used in QR-based stock operations.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="text"
            placeholder="Search code, name, type, QR..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[300px]"
          />

          <Link
            href="/warehouses/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add Warehouse
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
                Warehouse
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Type
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                QR
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Structure
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
                  colSpan={7}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Loading warehouses...
                </td>
              </tr>
            ) : filteredWarehouses.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No warehouses found.
                </td>
              </tr>
            ) : (
              filteredWarehouses.map((warehouse) => {
                const isActionLoading = actionLoadingId === warehouse.id;

                return (
                  <tr
                    key={warehouse.id}
                    onDoubleClick={() => openWarehouseEdit(warehouse.id)}
                    title="Double click to edit"
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {warehouse.code}
                          </span>
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                            {warehouse.name}
                          </span>
                        </div>

                        <p className="mt-1 max-w-[420px] text-xs text-gray-500 dark:text-gray-400">
                          {warehouse.description || "No description."}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${warehouseTypeClass(
                          warehouse.warehouse_type
                        )}`}
                      >
                        {formatWarehouseType(warehouse.warehouse_type)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-800 dark:text-white/90">
                          {warehouse.qr_code || "-"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {warehouse.qr_payload || "-"}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                          {warehouse.zone_count ?? 0} Zones
                        </span>
                        <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                          {warehouse.location_count ?? 0} Shelves
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          warehouse.is_active
                        )}`}
                      >
                        {warehouse.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(warehouse.updated_at)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex min-w-[260px] items-center justify-end gap-2">
                        <Link
                          href={`/warehouses/${warehouse.id}/edit`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Edit
                        </Link>

                        <Link
                          href={`/zones?warehouse=${warehouse.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Zones
                        </Link>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleStatus(warehouse);
                          }}
                          disabled={isActionLoading}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${warehouse.is_active
                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"
                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
                            }`}
                        >
                          {warehouse.is_active ? "Deactivate" : "Activate"}
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