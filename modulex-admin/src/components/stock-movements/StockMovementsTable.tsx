"use client";

import React, { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
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

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light";

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatNumber = (value: number | string | null | undefined) =>
  numberFormatter.format(Number(value ?? 0));
const formatDate = (value: string) => dateFormatter.format(new Date(value));

function movementTypeColor(type: MovementType): BadgeColor {
  switch (type) {
    case "in":
      return "success";
    case "out":
    case "damage":
      return "error";
    case "transfer":
      return "primary";
    case "adjustment":
      return "warning";
    case "reservation":
    case "release":
      return "info";
    default:
      return "light";
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

  const loadMovements = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("v_inventory_movement_history")
      .select(
        "movement_id, reference_no, sku, product_name, barcode, movement_type, quantity, from_warehouse_code, from_location_code, to_warehouse_code, to_location_code, reason, notes, created_by_email, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Failed to load stock movements", error);
      setErrorMessage("Stock movements could not be loaded. Try again.");
      setMovements([]);
    } else {
      setMovements((data as StockMovement[]) ?? []);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  return (
    <ComponentCard
      title="Movement History"
      desc="Track stock entries, exits, transfers, reservations, and adjustments."
    >
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={() => void loadMovements()}
        >
          <span className="sr-only">Refresh stock movement history</span>
          <span aria-hidden="true">{isLoading ? "Refreshing…" : "Refresh"}</span>
        </Button>
      </div>

      {errorMessage ? (
        <div role="alert" className="space-y-3">
          <Alert variant="error" title="Movement history unavailable" message={errorMessage} />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadMovements()}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <div aria-busy={isLoading}>
        <TableViewport>
          <Table variant="admin" className="w-full min-w-[1120px]">
            <caption className="sr-only">Most recent stock movements</caption>
            <TableHeader variant="admin">
              <TableRow>
                {["Reference", "Product", "Type", "Quantity", "From", "To", "User", "Date"].map(
                  (label) => (
                    <TableCell
                      key={label}
                      isHeader
                      variant="admin"
                      className={label === "Quantity" ? "text-right" : "text-left"}
                    >
                      {label}
                    </TableCell>
                  ),
                )}
              </TableRow>
            </TableHeader>

            <TableBody variant="admin">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} variant="admin" className="py-8 text-center">
                    <span role="status">Loading stock movements...</span>
                  </TableCell>
                </TableRow>
              ) : movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} variant="admin" className="py-8 text-center">
                    No stock movements found.
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((movement) => (
                  <TableRow key={movement.movement_id}>
                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">
                        {movement.reference_no || "-"}
                      </p>
                      {movement.reason ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{movement.reason}</p>
                      ) : null}
                    </TableCell>

                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">{movement.sku}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{movement.product_name}</p>
                      {movement.barcode ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Barcode: {movement.barcode}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell variant="admin">
                      <Badge color={movementTypeColor(movement.movement_type)} size="sm">
                        {formatMovementType(movement.movement_type)}
                      </Badge>
                    </TableCell>

                    <TableCell
                      variant="admin"
                      className="text-right font-medium text-gray-800 dark:text-white/90"
                    >
                      {formatNumber(movement.quantity)}
                    </TableCell>

                    <TableCell variant="admin">
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
                    </TableCell>

                    <TableCell variant="admin">
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
                    </TableCell>

                    <TableCell variant="admin">{movement.created_by_email || "System"}</TableCell>
                    <TableCell variant="admin">{formatDate(movement.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableViewport>
      </div>
    </ComponentCard>
  );
}
