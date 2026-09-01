"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableViewport } from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type PricingModel = "price_group" | "countertop_material_band" | "none" | string;

type SemanticsRow = {
  id: string;
  order_id: string;
  line_no: number;
  sku_snapshot: string;
  product_name_snapshot: string;
  product_type_name_snapshot: string | null;
  uom_name_snapshot: string | null;
  pricing_model_snapshot: PricingModel | null;
  order_number?: string;
};

type OrderPricingSemanticsPanelProps = {
  orderId?: string;
  customerId?: string;
  limit?: number;
};

function pricingLabel(model: PricingModel | null | undefined) {
  if (model === "price_group") return "Price Group";
  if (model === "countertop_material_band") return "Countertop Material Band";
  if (model === "none") return "No Commercial Pricing";
  return "Unavailable";
}

function pricingColor(model: PricingModel | null | undefined): "success" | "warning" | "light" {
  if (model === "price_group") return "success";
  if (model === "countertop_material_band") return "warning";
  return "light";
}

export default function OrderPricingSemanticsPanel({ orderId, customerId, limit = 40 }: OrderPricingSemanticsPanelProps) {
  const [rows, setRows] = useState<SemanticsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        let orderIds: string[] = [];
        const orderNumbers = new Map<string, string>();

        if (orderId) {
          orderIds = [orderId];
        } else if (customerId) {
          const { data: orderData, error: orderError } = await supabase
            .from("customer_orders")
            .select("id, order_number")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(20);

          if (orderError) throw orderError;
          for (const order of orderData ?? []) {
            orderIds.push(String(order.id));
            orderNumbers.set(String(order.id), String(order.order_number));
          }
        }

        if (orderIds.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        const { data, error } = await supabase
          .from("customer_order_items")
          .select("id, order_id, line_no, sku_snapshot, product_name_snapshot, product_type_name_snapshot, uom_name_snapshot, pricing_model_snapshot")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw error;
        if (cancelled) return;

        setRows((data ?? []).map((row) => ({
          ...row,
          order_number: orderNumbers.get(String(row.order_id)),
        })) as SemanticsRow[]);
      } catch (error) {
        if (!cancelled) {
          setRows([]);
          setErrorMessage(error instanceof Error ? error.message : "Unable to load order pricing semantics.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [orderId, customerId, limit]);

  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Product Type & Pricing Semantics</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Historical Product Type, UOM and pricing route snapshots. UOM is measurement semantics only.
        </p>
      </div>

      {isLoading ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading pricing semantics...</p> : null}
      {errorMessage ? <p className="text-sm text-error-600 dark:text-error-400">{errorMessage}</p> : null}

      {!isLoading && !errorMessage ? (
        <TableViewport>
          <Table variant="admin">
            <TableHeader variant="admin">
              <TableRow>
                {[...(customerId ? ["Order"] : []), "Line", "SKU", "Product", "Product Type", "UOM", "Pricing Route"].map((label) => (
                  <TableCell key={label} isHeader variant="admin" className="whitespace-nowrap text-left">{label}</TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={customerId ? 7 : 6} variant="admin" className="py-8 text-center">No order-line semantics found.</TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id}>
                  {customerId ? <TableCell variant="admin" className="whitespace-nowrap font-medium">{row.order_number ?? row.order_id}</TableCell> : null}
                  <TableCell variant="admin">{row.line_no}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap font-semibold">{row.sku_snapshot}</TableCell>
                  <TableCell variant="admin" className="min-w-[220px]">{row.product_name_snapshot}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap">{row.product_type_name_snapshot ?? "—"}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap">{row.uom_name_snapshot ?? "—"}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap">
                    <Badge size="sm" color={pricingColor(row.pricing_model_snapshot)}>{pricingLabel(row.pricing_model_snapshot)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      ) : null}
    </section>
  );
}
