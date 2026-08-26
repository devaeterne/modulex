"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { Customer } from "@/lib/customers/types";
import type {
  CustomerShipment,
  CustomerShipmentItem,
  CustomerShipmentStatus,
} from "@/lib/customers/shipment-types";

type StockLocation = {
  product_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_id: string;
  location_code: string;
  location_name: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
};

type DraftLine = {
  quantity: string;
  locationId: string;
};

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: CustomerShipmentStatus) {
  if (status === "delivered") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  }

  if (status === "cancelled") {
    return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  }

  if (status === "shipped") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400";
  }

  if (status === "packed") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  }

  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 dark:disabled:bg-white/[0.03] dark:disabled:text-gray-600";

const smallInputClassName =
  "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800 dark:disabled:bg-white/[0.03] dark:disabled:text-gray-600";

const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]";

const smallSecondaryButtonClassName =
  "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]";

export default function CustomerShipmentDetail() {
  const params = useParams<{
    id: string;
    shipmentId: string;
  }>();

  const [shipment, setShipment] =
    useState<CustomerShipment | null>(null);

  const [items, setItems] =
    useState<CustomerShipmentItem[]>([]);

  const [customer, setCustomer] =
    useState<Customer | null>(null);

  const [stock, setStock] =
    useState<Record<string, StockLocation[]>>({});

  const [draft, setDraft] =
    useState<Record<string, DraftLine>>({});

  const [carrier, setCarrier] = useState("");
  const [serviceLevel, setServiceLevel] = useState("");
  const [tracking, setTracking] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);

    const {
      profile,
      error: profileError,
    } = await getCurrentProfile();

    if (
      profileError ||
      !["super_admin", "admin", "sales"].includes(
        profile?.role ?? ""
      )
    ) {
      setErrorMessage(
        profileError?.message ||
        "You do not have access to shipments."
      );

      setIsLoading(false);
      return;
    }

    const [
      shipmentResult,
      itemsResult,
      customerResult,
    ] = await Promise.all([
      supabase
        .from("customer_shipments")
        .select("*")
        .eq("id", params.shipmentId)
        .eq("customer_id", params.id)
        .single(),

      supabase
        .from("customer_shipment_items")
        .select("*")
        .eq("shipment_id", params.shipmentId)
        .order("line_no"),

      supabase
        .from("customers")
        .select("*")
        .eq("id", params.id)
        .single(),
    ]);

    const firstError =
      shipmentResult.error ||
      itemsResult.error ||
      customerResult.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedShipment =
      shipmentResult.data as CustomerShipment;

    const loadedItems =
      (itemsResult.data ?? []) as CustomerShipmentItem[];

    setShipment(loadedShipment);
    setItems(loadedItems);
    setCustomer(customerResult.data as Customer);

    setCarrier(loadedShipment.carrier || "");
    setServiceLevel(
      loadedShipment.service_level || ""
    );
    setTracking(
      loadedShipment.tracking_number || ""
    );

    setDraft(
      Object.fromEntries(
        loadedItems.map((item) => [
          item.id,
          {
            quantity: String(
              Number(item.shipment_quantity)
            ),
            locationId:
              item.source_location_id || "",
          },
        ])
      )
    );

    const uniqueProducts = [
      ...new Set(
        loadedItems
          .map((item) => item.product_id)
          .filter(Boolean)
      ),
    ] as string[];

    const productRows = await Promise.all(
      uniqueProducts.map(
        async (productId) => {
          const {
            data: product,
            error: productError,
          } = await supabase
            .from("products")
            .select("sku")
            .eq("id", productId)
            .single();

          if (
            productError ||
            !product?.sku
          ) {
            return [productId, []] as const;
          }

          const {
            data,
            error: stockError,
          } = await supabase.rpc(
            "search_stock",
            {
              p_query: product.sku,
              p_limit: 100,
            }
          );

          if (stockError) {
            return [productId, []] as const;
          }

          const rows = (
            (data ?? []) as StockLocation[]
          ).filter(
            (row) =>
              row.product_id === productId &&
              Number(
                row.available_quantity
              ) > 0
          );

          return [productId, rows] as const;
        }
      )
    );

    setStock(
      Object.fromEntries(productRows)
    );

    setIsLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.shipmentId]);

  const address = useMemo(() => {
    const data =
      shipment?.shipping_address_snapshot as
      | Record<string, string | null>
      | null;

    if (!data) {
      return [];
    }

    return [
      data.company_name,
      data.contact_name,
      data.address_line_1,
      data.address_line_2,
      [
        data.postal_code,
        data.city,
      ]
        .filter(Boolean)
        .join(" "),
      data.country_code,
      data.phone,
    ].filter(Boolean) as string[];
  }, [shipment]);

  async function saveLine(
    item: CustomerShipmentItem
  ) {
    const value = draft[item.id];

    const option = (
      stock[item.product_id || ""] ?? []
    ).find(
      (row) =>
        row.location_id ===
        value?.locationId
    );

    if (!value || !option) {
      setErrorMessage(
        "Select a stock location for this line."
      );
      return;
    }

    const numericQuantity = Number(
      value.quantity
    );

    if (
      Number.isNaN(numericQuantity) ||
      numericQuantity <= 0
    ) {
      setErrorMessage(
        "Shipment quantity must be greater than zero."
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc(
      "configure_customer_shipment_item",
      {
        p_shipment_item_id: item.id,
        p_quantity: numericQuantity,
        p_warehouse_id:
          option.warehouse_id,
        p_location_id:
          option.location_id,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage(
        `${item.sku_snapshot} fulfillment source saved.`
      );
    }

    setIsSaving(false);

    if (!error) {
      await load();
    }
  }

  async function setStatus(
    status:
      | "picking"
      | "packed"
      | "cancelled"
  ) {
    if (!shipment) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc(
      "set_customer_shipment_status",
      {
        p_shipment_id: shipment.id,
        p_status: status,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage(
        `Shipment moved to ${titleCase(
          status
        )}.`
      );
    }

    setIsSaving(false);

    if (!error) {
      await load();
    }
  }

  async function ship() {
    if (!shipment) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc(
      "ship_customer_shipment",
      {
        p_shipment_id: shipment.id,
        p_carrier:
          carrier.trim() || null,
        p_service_level:
          serviceLevel.trim() || null,
        p_tracking_number:
          tracking.trim() || null,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage(
        "Shipment shipped and inventory deducted."
      );
    }

    setIsSaving(false);

    if (!error) {
      await load();
    }
  }

  async function deliver() {
    if (!shipment) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc(
      "deliver_customer_shipment",
      {
        p_shipment_id: shipment.id,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage(
        "Shipment marked delivered."
      );
    }

    setIsSaving(false);

    if (!error) {
      await load();
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading shipment...
        </p>
      </div>
    );
  }

  if (!shipment || !customer) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        {errorMessage ||
          "Shipment not found."}
      </div>
    );
  }

  const editable = [
    "draft",
    "picking",
  ].includes(shipment.status);

  const shipmentClosed =
    shipment.status === "delivered" ||
    shipment.status === "cancelled";

  return (
    <div className="space-y-5">
      {/* Messages */}
      {errorMessage && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
          {successMessage}
        </div>
      )}

      {/* Header */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                {shipment.shipment_number}
              </h1>

              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                  shipment.status
                )}`}
              >
                {titleCase(
                  shipment.status
                )}
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {customer.name} • Order
              fulfillment
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/customers/${customer.id}/orders/${shipment.order_id}`}
              className={
                secondaryButtonClassName
              }
            >
              Source Order
            </Link>

            <Link
              href="/customers/shipments"
              className={
                secondaryButtonClassName
              }
            >
              All Shipments
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Fulfillment Lines */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">
              Fulfillment Lines
            </h2>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Choose source shelf and
              shipment quantity before
              shipping.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    SKU / Product
                  </th>

                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Ordered
                  </th>

                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Ship Qty
                  </th>

                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Source Stock
                  </th>

                  <th className="px-4 py-3" />
                </tr>
              </thead>

              <tbody>
                {items.map((item) => {
                  const options =
                    stock[
                    item.product_id ||
                    ""
                    ] ?? [];

                  const current =
                    draft[item.id] || {
                      quantity: String(
                        Number(
                          item.shipment_quantity
                        )
                      ),

                      locationId:
                        item.source_location_id ||
                        "",
                    };

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-800 dark:text-white/90">
                          {
                            item.sku_snapshot
                          }
                        </p>

                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {
                            item.product_name_snapshot
                          }
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {Number(
                          item.ordered_quantity_snapshot
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <input
                          disabled={!editable}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={
                            current.quantity
                          }
                          onChange={(
                            event
                          ) =>
                            setDraft(
                              (
                                previous
                              ) => ({
                                ...previous,

                                [item.id]:
                                {
                                  ...current,

                                  quantity:
                                    event
                                      .target
                                      .value,
                                },
                              })
                            )
                          }
                          className={`${smallInputClassName} w-24`}
                        />
                      </td>

                      <td className="px-4 py-4">
                        <select
                          disabled={!editable}
                          value={
                            current.locationId
                          }
                          onChange={(
                            event
                          ) =>
                            setDraft(
                              (
                                previous
                              ) => ({
                                ...previous,

                                [item.id]:
                                {
                                  ...current,

                                  locationId:
                                    event
                                      .target
                                      .value,
                                },
                              })
                            )
                          }
                          className={`${smallInputClassName} min-w-64`}
                        >
                          <option value="">
                            Select source
                            location
                          </option>

                          {options.map(
                            (row) => (
                              <option
                                key={
                                  row.location_id
                                }
                                value={
                                  row.location_id
                                }
                              >
                                {
                                  row.warehouse_code
                                }{" "}
                                /{" "}
                                {
                                  row.location_code
                                }{" "}
                                — available{" "}
                                {Number(
                                  row.available_quantity
                                )}
                              </option>
                            )
                          )}
                        </select>
                      </td>

                      <td className="px-4 py-4">
                        {editable && (
                          <button
                            type="button"
                            disabled={
                              isSaving
                            }
                            onClick={() =>
                              saveLine(
                                item
                              )
                            }
                            className={
                              smallSecondaryButtonClassName
                            }
                          >
                            Save
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No shipment lines
                      found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Ship To */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">
              Ship To
            </h2>

            <div className="mt-3 space-y-1">
              {address.length ? (
                address.map(
                  (line, index) => (
                    <p
                      key={`${line}-${index}`}
                      className="text-sm text-gray-500 dark:text-gray-400"
                    >
                      {line}
                    </p>
                  )
                )
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No shipping address
                  snapshot.
                </p>
              )}
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">
              Timeline
            </h2>

            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">
                  Picking
                </p>

                <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {dateTime(
                    shipment.picking_started_at
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">
                  Packed
                </p>

                <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {dateTime(
                    shipment.packed_at
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">
                  Shipped
                </p>

                <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {dateTime(
                    shipment.shipped_at
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">
                  Delivered
                </p>

                <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                  {dateTime(
                    shipment.delivered_at
                  )}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Controls */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="font-semibold text-gray-800 dark:text-white/90">
          Shipment Controls
        </h2>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure carrier and tracking
          information, then advance the
          shipment through its fulfillment
          workflow.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            disabled={shipmentClosed}
            value={carrier}
            onChange={(event) =>
              setCarrier(
                event.target.value
              )
            }
            placeholder="Carrier"
            className={inputClassName}
          />

          <input
            disabled={shipmentClosed}
            value={serviceLevel}
            onChange={(event) =>
              setServiceLevel(
                event.target.value
              )
            }
            placeholder="Service level"
            className={inputClassName}
          />

          <input
            disabled={shipmentClosed}
            value={tracking}
            onChange={(event) =>
              setTracking(
                event.target.value
              )
            }
            placeholder="Tracking number"
            className={inputClassName}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {shipment.status ===
            "draft" && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  setStatus("picking")
                }
                className={
                  secondaryButtonClassName
                }
              >
                Start Picking
              </button>
            )}

          {[
            "draft",
            "picking",
          ].includes(shipment.status) && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  setStatus("packed")
                }
                className="inline-flex h-10 items-center justify-center rounded-lg bg-warning-500 px-4 text-sm font-medium text-white transition hover:bg-warning-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark Packed
              </button>
            )}

          {[
            "draft",
            "picking",
            "packed",
          ].includes(shipment.status) && (
              <button
                type="button"
                disabled={isSaving}
                onClick={ship}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ship & Deduct Stock
              </button>
            )}

          {shipment.status ===
            "shipped" && (
              <button
                type="button"
                disabled={isSaving}
                onClick={deliver}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-success-600 px-4 text-sm font-medium text-white transition hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark Delivered
              </button>
            )}

          {[
            "draft",
            "picking",
            "packed",
          ].includes(shipment.status) && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  setStatus("cancelled")
                }
                className="inline-flex h-10 items-center justify-center rounded-lg border border-error-300 bg-white px-4 text-sm font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/40 dark:bg-transparent dark:text-error-400 dark:hover:bg-error-500/10"
              >
                Cancel Shipment
              </button>
            )}
        </div>

        {shipment.tracking_number && (
          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tracking:{" "}
              <span className="font-medium text-gray-800 dark:text-white/90">
                {
                  shipment.tracking_number
                }
              </span>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}