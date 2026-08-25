"use client";

import React, { useEffect, useState } from "react";
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
};

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
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

export default function InventoryTable() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadInventory(searchQuery = "") {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("search_stock", {
      p_query: searchQuery,
      p_limit: 100,
    });

    if (error) {
      setErrorMessage(error.message);
      setRows([]);
      setIsLoading(false);
      return;
    }

    setRows((data as InventoryRow[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadInventory();
  }, []);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadInventory(query.trim());
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Stock Overview
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View products by warehouse, zone, shelf location, and available stock.
          </p>
        </div>

        <form onSubmit={handleSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="text"
            placeholder="Search SKU, barcode, product, location..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[360px]"
          />
        </form>
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
                Product
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Warehouse
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Zone
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Location
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Quantity
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Reserved
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Available
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Status
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
                  Loading inventory...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No inventory records found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.inventory_id}>
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.sku}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {row.product_name}
                      </p>
                      {row.barcode && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Barcode: {row.barcode}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.warehouse_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {row.warehouse_name}
                      </p>
                    </div>
                  </td>

                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {row.zone_code ? (
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          {row.zone_code}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {row.zone_name || "-"}
                        </p>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.location_code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {row.location_name}
                      </p>
                    </div>
                  </td>

                  <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                    {formatNumber(row.quantity)}
                  </td>

                  <td className="px-5 py-4 text-right text-sm text-gray-600 dark:text-gray-300">
                    {formatNumber(row.reserved_quantity)}
                  </td>

                  <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                    {formatNumber(row.available_quantity)}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                        row.stock_status
                      )}`}
                    >
                      {formatStatus(row.stock_status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}