"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type LocationRow = {
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: string;
  qr_code: string | null;

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;

  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;

  product_count: number;
  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;

  max_capacity: number | null;
  current_capacity: number | null;
  capacity_usage_percent: number | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatLocationType(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(isActive: boolean) {
  return isActive
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
    : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
}

function capacityClass(percent: number | null) {
  const value = Number(percent ?? 0);

  if (value >= 90) {
    return "text-error-600 dark:text-error-400";
  }

  if (value >= 70) {
    return "text-warning-600 dark:text-warning-400";
  }

  return "text-gray-700 dark:text-gray-300";
}

export default function LocationsTable() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadLocations() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("v_location_stock_summary")
      .select(
        "location_id, location_code, location_name, location_type, qr_code, warehouse_id, warehouse_code, warehouse_name, zone_id, zone_code, zone_name, product_count, total_quantity, total_reserved_quantity, total_available_quantity, max_capacity, current_capacity, capacity_usage_percent, is_active, created_at, updated_at"
      )
      .order("warehouse_code", { ascending: true })
      .order("location_code", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLocations([]);
      setIsLoading(false);
      return;
    }

    setLocations((data as LocationRow[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadLocations();
  }, []);

  const filteredLocations = locations.filter((location) => {
    const search = query.trim().toLowerCase();

    if (!search) return true;

    return [
      location.location_code,
      location.location_name,
      location.location_type,
      location.qr_code,
      location.warehouse_code,
      location.warehouse_name,
      location.zone_code,
      location.zone_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

  async function handleToggleStatus(location: LocationRow) {
    setActionLoadingId(location.location_id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("locations")
      .update({ is_active: !location.is_active })
      .eq("id", location.location_id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadLocations();
    setActionLoadingId(null);
  }

  async function handleRegenerateQr(location: LocationRow) {
    const confirmed = window.confirm(
      `Regenerate QR code for ${location.location_code}? Existing printed labels may need to be replaced.`
    );

    if (!confirmed) return;

    setActionLoadingId(location.location_id);
    setErrorMessage(null);

    const { error } = await supabase.rpc("assign_location_qr_code", {
      p_location_id: location.location_id,
      p_force_regenerate: true,
    });

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadLocations();
    setActionLoadingId(null);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Location List
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage shelf locations, QR payloads, capacity, and current stock.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="text"
            placeholder="Search warehouse, zone, location or QR..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[340px]"
          />

          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add Location
          </button>
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
                Warehouse
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Zone
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                QR Code
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Products
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Stock
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Capacity
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Status
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
                const isActionLoading = actionLoadingId === location.location_id;

                return (
                  <tr key={location.location_id}>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {location.location_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {location.location_name}
                      </p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {formatLocationType(location.location_type)}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {location.warehouse_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {location.warehouse_name}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      {location.zone_code ? (
                        <>
                          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {location.zone_code}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {location.zone_name || "-"}
                          </p>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          -
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="max-w-[260px]">
                        <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                          {location.qr_code || "-"}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatNumber(location.product_count)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {formatNumber(location.total_quantity)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Available: {formatNumber(location.total_available_quantity)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Reserved: {formatNumber(location.total_reserved_quantity)}
                      </p>
                    </td>

                    <td
                      className={`px-5 py-4 text-right text-sm font-medium ${capacityClass(
                        location.capacity_usage_percent
                      )}`}
                    >
                      {location.capacity_usage_percent === null
                        ? "-"
                        : `${formatNumber(location.capacity_usage_percent)}%`}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          location.is_active
                        )}`}
                      >
                        {location.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex min-w-[260px] items-center justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRegenerateQr(location)}
                          disabled={isActionLoading}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          QR
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(location)}
                          disabled={isActionLoading}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${location.is_active
                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"
                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
                            }`}
                        >
                          {location.is_active ? "Deactivate" : "Activate"}
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