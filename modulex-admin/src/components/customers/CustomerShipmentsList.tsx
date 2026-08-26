"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { CustomerShipment, CustomerShipmentStatus } from "@/lib/customers/shipment-types";

type ShipmentRow = CustomerShipment & {
  customer_name?: string | null;
  order_number?: string | null;
};

const statuses: Array<"all" | CustomerShipmentStatus> = [
  "all",
  "draft",
  "picking",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function statusClass(status: CustomerShipmentStatus) {
  if (status === "delivered") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "cancelled") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "shipped") return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  if (["picking", "packed"].includes(status)) return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function CustomerShipmentsList({ customerId }: { customerId?: string }) {
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [status, setStatus] = useState<"all" | CustomerShipmentStatus>("all");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }

      if (!["super_admin", "admin", "sales"].includes(profile?.role ?? "")) {
        setErrorMessage("You do not have access to customer shipments.");
        setIsLoading(false);
        return;
      }

      let shipmentsQuery = supabase
        .from("customer_shipments")
        .select("*")
        .order("created_at", { ascending: false });

      if (customerId) shipmentsQuery = shipmentsQuery.eq("customer_id", customerId);

      const { data: shipments, error: shipmentsError } = await shipmentsQuery;
      if (shipmentsError) {
        setErrorMessage(shipmentsError.message);
        setIsLoading(false);
        return;
      }

      const customerIds = [...new Set((shipments ?? []).map((s) => s.customer_id))];
      const orderIds = [...new Set((shipments ?? []).map((s) => s.order_id))];

      const [customersResult, ordersResult] = await Promise.all([
        customerIds.length
          ? supabase.from("customers").select("id,name").in("id", customerIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? supabase.from("customer_orders").select("id,order_number").in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (customersResult.error || ordersResult.error) {
        setErrorMessage(customersResult.error?.message || ordersResult.error?.message || "Failed to load shipment references.");
        setIsLoading(false);
        return;
      }

      const customerMap = new Map((customersResult.data ?? []).map((c) => [c.id, c.name]));
      const orderMap = new Map((ordersResult.data ?? []).map((o) => [o.id, o.order_number]));

      setRows(
        ((shipments ?? []) as CustomerShipment[]).map((shipment) => ({
          ...shipment,
          customer_name: customerMap.get(shipment.customer_id) ?? null,
          order_number: orderMap.get(shipment.order_id) ?? null,
        }))
      );
      setIsLoading(false);
    }

    load();
  }, [customerId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!normalized) return true;
      return [
        row.shipment_number,
        row.customer_name,
        row.order_number,
        row.carrier,
        row.tracking_number,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [query, rows, status]);

  if (isLoading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">Loading shipments...</div>;
  }

  return (
    <div className="space-y-4">
      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipment, customer, order, carrier or tracking"
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | CustomerShipmentStatus)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {statuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {["Shipment", "Customer", "Order", "Status", "Carrier / Tracking", "Shipped", "Delivered"].map((label) => (
                  <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-4">
                    <Link href={`/customers/${row.customer_id}/shipments/${row.id}`} className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
                      {row.shipment_number}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{row.customer_name || "—"}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{row.order_number || "—"}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{titleCase(row.status)}</span></td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                    <div>{row.carrier || "—"}</div>
                    {row.tracking_number && <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{row.tracking_number}</div>}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{date(row.shipped_at)}</td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{date(row.delivered_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No shipments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
