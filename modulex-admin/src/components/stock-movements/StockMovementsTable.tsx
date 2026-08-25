"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type MovementType =
  | "in"
  | "out"
  | "transfer"
  | "adjustment"
  | "return"
  | "damage"
  | "reservation"
  | "release"
  | string;

type StockMovement = {
  movement_id: string;
  reference_no: string | null;
  sku: string;
  product_name: string;
  barcode: string | null;
  movement_type: MovementType;
  quantity: number;
  from_warehouse_code: string | null;
  from_location_code: string | null;
  to_warehouse_code: string | null;
  to_location_code: string | null;
  reason: string | null;
  notes: string | null;
  created_by_email: string | null;
  created_at: string;
};

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

function movementTypeClass(type: MovementType) {
  switch (type) {
    case "in":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
    case "out":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
    case "transfer":
      return "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400";
    case "adjustment":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
    case "reservation":
      return "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400";
    case "release":
      return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
    case "damage":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
    case "return":
      return "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
  }
}

function formatMovementType(type: MovementType) {
  return String(type)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function StockMovementsTable() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadMovements() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("v_inventory_movement_history")
      .select(
        "movement_id, reference_no, sku, product_name, barcode, movement_type, quantity, from_warehouse_code, from_location_code, to_warehouse_code, to_location_code, reason, notes, created_by_email, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setErrorMessage(error.message);
      setMovements([]);
      setIsLoading(false);
      return;
    }

    setMovements((data as StockMovement[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadMovements();
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Movement History
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track stock entries, exits, transfers, reservations, and adjustments.
          </p>
        </div>

        <button
          type="button"
          onClick={loadMovements}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Refresh
        </button>
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
                Reference
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Product
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Type
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Quantity
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                From
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                To
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                User
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Date
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
                  Loading stock movements...
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No stock movements found.
                </td>
              </tr>
            ) : (
              movements.map((movement) => (
                <tr key={movement.movement_id}>
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {movement.reference_no || "-"}
                    </p>
                    {movement.reason && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {movement.reason}
                      </p>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {movement.sku}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {movement.product_name}
                    </p>
                    {movement.barcode && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Barcode: {movement.barcode}
                      </p>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${movementTypeClass(
                        movement.movement_type
                      )}`}
                    >
                      {formatMovementType(movement.movement_type)}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                    {formatNumber(movement.quantity)}
                  </td>

                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {movement.from_location_code ? (
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          {movement.from_location_code}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {movement.from_warehouse_code || "-"}
                        </p>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {movement.to_location_code ? (
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          {movement.to_location_code}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {movement.to_warehouse_code || "-"}
                        </p>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {movement.created_by_email || "System"}
                  </td>

                  <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(movement.created_at)}
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