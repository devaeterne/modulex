"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import type { CustomerShipment, CustomerShipmentItem, CustomerShipmentStatus } from "@/lib/customers/shipment-types";

type StockLocation = {
  product_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_id: string;
  location_code: string;
  location_name: string;
  available_quantity: number;
};

type ShipmentReference = {
  shipment_id: string;
  customer_name: string | null;
  order_number: string | null;
};

type DraftLine = { quantity: string; locationId: string };

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-300 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-white/[0.03]";
const secondaryButton = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusClass(status: CustomerShipmentStatus) {
  if (status === "delivered") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "cancelled") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "shipped") return "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400";
  if (["picking", "packed"].includes(status)) return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function CustomerShipmentDetailRBAC() {
  const params = useParams<{ id: string; shipmentId: string }>();
  const [shipment, setShipment] = useState<CustomerShipment | null>(null);
  const [items, setItems] = useState<CustomerShipmentItem[]>([]);
  const [reference, setReference] = useState<ShipmentReference | null>(null);
  const [stock, setStock] = useState<Record<string, StockLocation[]>>({});
  const [draft, setDraft] = useState<Record<string, DraftLine>>({});
  const [canManage, setCanManage] = useState(false);
  const [canViewOrders, setCanViewOrders] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [serviceLevel, setServiceLevel] = useState("");
  const [tracking, setTracking] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);

    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setErrorMessage(profileError?.message ?? "Active staff profile is required.");
      setIsLoading(false);
      return;
    }
    if (!hasPermission(profile.role, "shipments.view")) {
      setErrorMessage("You do not have permission to view shipments.");
      setIsLoading(false);
      return;
    }

    const manage = hasPermission(profile.role, "shipments.manage");
    setCanManage(manage);
    setCanViewOrders(hasPermission(profile.role, "orders.view"));

    const [shipmentResult, itemsResult, referenceResult] = await Promise.all([
      supabase.from("customer_shipments").select("*").eq("id", params.shipmentId).single(),
      supabase.from("customer_shipment_items").select("*").eq("shipment_id", params.shipmentId).order("line_no"),
      supabase.rpc("get_customer_shipment_references", { p_shipment_ids: [params.shipmentId] }),
    ]);

    const firstError = shipmentResult.error || itemsResult.error || referenceResult.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedShipment = shipmentResult.data as CustomerShipment;
    const loadedItems = (itemsResult.data ?? []) as CustomerShipmentItem[];
    setShipment(loadedShipment);
    setItems(loadedItems);
    setReference(((referenceResult.data ?? []) as ShipmentReference[])[0] ?? null);
    setCarrier(loadedShipment.carrier ?? "");
    setServiceLevel(loadedShipment.service_level ?? "");
    setTracking(loadedShipment.tracking_number ?? "");
    setDraft(Object.fromEntries(loadedItems.map((item) => [item.id, {
      quantity: String(Number(item.shipment_quantity)),
      locationId: item.source_location_id ?? "",
    }])));

    if (manage) {
      const uniqueProducts = [...new Set(loadedItems.map((item) => item.product_id).filter(Boolean))] as string[];
      const productRows = await Promise.all(uniqueProducts.map(async (productId) => {
        const { data: product } = await supabase.from("products").select("sku").eq("id", productId).maybeSingle();
        if (!product?.sku) return [productId, []] as const;
        const { data } = await supabase.rpc("search_stock", { p_query: product.sku, p_limit: 100 });
        const rows = ((data ?? []) as StockLocation[]).filter((row) => row.product_id === productId && Number(row.available_quantity) > 0);
        return [productId, rows] as const;
      }));
      setStock(Object.fromEntries(productRows));
    } else {
      setStock({});
    }

    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [params.shipmentId]);

  const address = useMemo(() => {
    const data = shipment?.shipping_address_snapshot as Record<string, string | null> | null;
    if (!data) return [];
    return [
      data.company_name,
      data.contact_name,
      data.address_line_1,
      data.address_line_2,
      [data.postal_code, data.city].filter(Boolean).join(" "),
      data.country_code,
      data.phone,
    ].filter((value): value is string => Boolean(value));
  }, [shipment]);

  async function saveLine(item: CustomerShipmentItem) {
    if (!canManage) return;
    const value = draft[item.id];
    const option = (stock[item.product_id ?? ""] ?? []).find((row) => row.location_id === value?.locationId);
    if (!value || !option) {
      setErrorMessage("Select a stock location for this line.");
      return;
    }
    const quantity = Number(value.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage("Shipment quantity must be greater than zero.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("configure_customer_shipment_item", {
      p_shipment_item_id: item.id,
      p_quantity: quantity,
      p_warehouse_id: option.warehouse_id,
      p_location_id: option.location_id,
    });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage(`${item.sku_snapshot} fulfillment source saved.`);
    await load();
  }

  async function setStatus(status: "picking" | "packed" | "cancelled") {
    if (!shipment || !canManage) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("set_customer_shipment_status", {
      p_shipment_id: shipment.id,
      p_status: status,
    });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage(`Shipment moved to ${titleCase(status)}.`);
    await load();
  }

  async function ship() {
    if (!shipment || !canManage || shipment.status !== "packed") return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("ship_customer_shipment", {
      p_shipment_id: shipment.id,
      p_carrier: carrier.trim() || null,
      p_service_level: serviceLevel.trim() || null,
      p_tracking_number: tracking.trim() || null,
    });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage("Shipment shipped and inventory deducted.");
    await load();
  }

  async function deliver() {
    if (!shipment || !canManage || shipment.status !== "shipped") return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("deliver_customer_shipment", { p_shipment_id: shipment.id });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSuccessMessage("Shipment marked delivered.");
    await load();
  }

  if (isLoading) return <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Loading shipment...</div>;
  if (!shipment) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700">{errorMessage || "Shipment not found."}</div>;

  const editable = canManage && ["draft", "picking"].includes(shipment.status);
  const canStartPicking = shipment.status === "draft";
  const canPack = shipment.status === "picking";
  const canShip = shipment.status === "packed";
  const canDeliver = shipment.status === "shipped";
  const canCancel = ["draft", "picking", "packed"].includes(shipment.status);
  const trackingEditable = ["draft", "picking", "packed"].includes(shipment.status);

  return (
    <div className="space-y-5">
      {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
      {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{successMessage}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{shipment.shipment_number}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(shipment.status)}`}>{titleCase(shipment.status)}</span>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{reference?.customer_name || "Customer"}{reference?.order_number ? ` • ${reference.order_number}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canViewOrders && <Link href={`/customers/${shipment.customer_id}/orders/${shipment.order_id}`} className={secondaryButton}>Source Order</Link>}
            <Link href="/customers/shipments" className={secondaryButton}>All Shipments</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Fulfillment Lines</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Source location and quantity are editable only before packing. The database validates reservation and remaining order quantity.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["SKU / Product", "Ordered", "Ship Qty", "Source Stock", ""].map((label) => <th key={label || "action"} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>)}</tr></thead>
              <tbody>
                {items.map((item) => {
                  const current = draft[item.id] ?? { quantity: String(Number(item.shipment_quantity)), locationId: item.source_location_id ?? "" };
                  const options = stock[item.product_id ?? ""] ?? [];
                  return (
                    <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-4"><p className="font-semibold text-gray-800 dark:text-white/90">{item.sku_snapshot}</p><p className="text-xs text-gray-500">{item.product_name_snapshot}</p></td>
                      <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{Number(item.ordered_quantity_snapshot)}</td>
                      <td className="px-4 py-4"><input disabled={!editable} type="number" min="0.01" step="0.01" value={current.quantity} onChange={(event) => setDraft((previous) => ({ ...previous, [item.id]: { ...current, quantity: event.target.value } }))} className={`${inputClass} w-24`} /></td>
                      <td className="px-4 py-4">
                        {editable ? (
                          <select value={current.locationId} onChange={(event) => setDraft((previous) => ({ ...previous, [item.id]: { ...current, locationId: event.target.value } }))} className={inputClass}>
                            <option value="">Select source</option>
                            {options.map((option) => <option key={option.location_id} value={option.location_id}>{option.warehouse_code} / {option.location_code} · avail {Number(option.available_quantity)}</option>)}
                          </select>
                        ) : <span className="text-sm text-gray-500">{item.source_location_id ? "Configured" : "—"}</span>}
                      </td>
                      <td className="px-4 py-4">{editable && <button disabled={isSaving} onClick={() => void saveLine(item)} className={secondaryButton}>Save</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Ship To</h2>
            <div className="mt-3">{address.length ? address.map((line, index) => <p key={`${line}-${index}`} className="text-sm text-gray-500">{line}</p>) : <p className="text-sm text-gray-500">—</p>}</div>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Timeline</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-500"><p>Picking: {dateTime(shipment.picking_started_at)}</p><p>Packed: {dateTime(shipment.packed_at)}</p><p>Shipped: {dateTime(shipment.shipped_at)}</p><p>Delivered: {dateTime(shipment.delivered_at)}</p></div>
          </section>
        </div>
      </div>

      {canManage && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Shipment Actions</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Operational sequence is Draft → Picking → Packed → Shipped → Delivered. Cancellation is available only before shipment.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input disabled={!trackingEditable} value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Carrier" className={inputClass} />
            <input disabled={!trackingEditable} value={serviceLevel} onChange={(event) => setServiceLevel(event.target.value)} placeholder="Service level" className={inputClass} />
            <input disabled={!trackingEditable} value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking number" className={inputClass} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {canStartPicking && <button disabled={isSaving} onClick={() => void setStatus("picking")} className={secondaryButton}>Start Picking</button>}
            {canPack && <button disabled={isSaving} onClick={() => void setStatus("packed")} className={secondaryButton}>Mark Packed</button>}
            {canShip && <button disabled={isSaving} onClick={() => void ship()} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-50">Ship</button>}
            {canDeliver && <button disabled={isSaving} onClick={() => void deliver()} className="inline-flex h-10 items-center rounded-lg bg-success-600 px-4 text-sm font-medium text-white disabled:opacity-50">Mark Delivered</button>}
            {canCancel && <button disabled={isSaving} onClick={() => void setStatus("cancelled")} className="inline-flex h-10 items-center rounded-lg border border-error-300 px-4 text-sm font-medium text-error-600 disabled:opacity-50">Cancel Shipment</button>}
          </div>
        </section>
      )}
    </div>
  );
}
