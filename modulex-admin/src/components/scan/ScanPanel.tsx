"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import CameraScanner from "@/components/scan/CameraScanner";
import GuidedStockOperation from "@/components/scan/GuidedStockOperation";

type ScanMode = "auto" | "location" | "product";

type LocationResult = {
  location_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;
  location_code: string;
  location_name: string;
  location_type: string;
  qr_code: string;
  is_active: boolean;
};

type ProductResult = {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  unit: string;
  min_stock_level: number;
  product_status: string;
};

type LocationInventoryRow = {
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
  qr_code: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  stock_status: string;
};

type LocationFallbackRow = {
  id: string;
  warehouse_id: string;
  zone_id: string | null;
  code: string;
  name: string;
  location_type: string;
  qr_code: string;
  is_active: boolean;
  warehouses:
  | {
    id: string;
    code: string;
    name: string;
  }
  | {
    id: string;
    code: string;
    name: string;
  }[]
  | null;
  zones:
  | {
    id: string;
    code: string;
    name: string;
  }
  | {
    id: string;
    code: string;
    name: string;
  }[]
  | null;
};

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatLocationType(value: string) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isLikelyLocationValue(value: string) {
  const normalized = value.trim().toUpperCase();

  return (
    normalized.startsWith("LOC|") ||
    normalized.startsWith("LOC-") ||
    normalized.includes(" / ") ||
    /^[A-Z]+-\d{2}-\d{2}$/.test(normalized) ||
    /^RET-\d{2}-\d{2}$/.test(normalized)
  );
}

function extractPossibleLocationCode(value: string) {
  const trimmed = value.trim();

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((part) => part.trim());

    if (parts.length >= 4) {
      return parts[3];
    }
  }

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map((part) => part.trim());
    return parts[parts.length - 1];
  }

  if (trimmed.startsWith("LOC-")) {
    return trimmed.replace(/^LOC-[^-]+-/, "");
  }

  return trimmed;
}

function getSingleRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default function ScanPanel() {
  const [scanMode, setScanMode] = useState<ScanMode>("auto");
  const [scanValue, setScanValue] = useState("");

  const [workflowScan, setWorkflowScan] = useState<{
    value: string;
    nonce: number;
  }>({
    value: "",
    nonce: 0,
  });

  const [locationResult, setLocationResult] = useState<LocationResult | null>(
    null
  );
  const [productResult, setProductResult] = useState<ProductResult | null>(null);
  const [locationInventory, setLocationInventory] = useState<
    LocationInventoryRow[]
  >([]);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resetResults() {
    setLocationResult(null);
    setProductResult(null);
    setLocationInventory([]);
    setErrorMessage(null);
  }

  async function findLocation(value: string) {
    const { data: locationData, error: locationError } = await supabase.rpc(
      "find_location_by_qr",
      {
        p_qr_code: value,
      }
    );

    if (locationError) {
      return {
        location: null,
        error: locationError.message,
      };
    }

    let location =
      (locationData?.[0] as LocationResult | undefined) ?? null;

    if (location) {
      return {
        location,
        error: null,
      };
    }

    const possibleLocationCode = extractPossibleLocationCode(value);

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("locations")
      .select(
        `
        id,
        warehouse_id,
        zone_id,
        code,
        name,
        location_type,
        qr_code,
        is_active,
        warehouses (
          id,
          code,
          name
        ),
        zones (
          id,
          code,
          name
        )
      `
      )
      .or(`code.eq.${possibleLocationCode},qr_code.eq.${value}`)
      .limit(1);

    if (fallbackError) {
      return {
        location: null,
        error: fallbackError.message,
      };
    }

    const fallbackLocation =
      (fallbackData?.[0] as LocationFallbackRow | undefined) ?? null;

    if (!fallbackLocation) {
      return {
        location: null,
        error: null,
      };
    }

    const warehouse = getSingleRelation(fallbackLocation.warehouses);
    const zone = getSingleRelation(fallbackLocation.zones);

    location = {
      location_id: fallbackLocation.id,
      warehouse_id: fallbackLocation.warehouse_id,
      warehouse_code: warehouse?.code ?? "-",
      warehouse_name: warehouse?.name ?? "-",
      zone_id: fallbackLocation.zone_id,
      zone_code: zone?.code ?? null,
      zone_name: zone?.name ?? null,
      location_code: fallbackLocation.code,
      location_name: fallbackLocation.name,
      location_type: fallbackLocation.location_type,
      qr_code: fallbackLocation.qr_code,
      is_active: fallbackLocation.is_active,
    };

    return {
      location,
      error: null,
    };
  }

  async function processScanValue(rawValue: string) {
    const value = rawValue.trim();

    resetResults();

    if (!value) {
      setErrorMessage("Scan value is required.");
      return;
    }

    setIsLoading(true);

    const shouldTryLocation =
      scanMode === "location" ||
      (scanMode === "auto" && isLikelyLocationValue(value));

    const shouldTryProduct =
      scanMode === "product" ||
      (scanMode === "auto" && !isLikelyLocationValue(value));

    if (shouldTryLocation) {
      const { location, error } = await findLocation(value);

      if (error) {
        setErrorMessage(error);
        setIsLoading(false);
        return;
      }

      if (!location) {
        setErrorMessage("No location found for this QR or location code.");
        setIsLoading(false);
        return;
      }

      setLocationResult(location);

      const { data: inventoryData, error: inventoryError } = await supabase.rpc(
        "get_location_inventory_by_qr",
        {
          p_qr_code: location.qr_code,
        }
      );

      if (inventoryError) {
        setErrorMessage(inventoryError.message);
        setIsLoading(false);
        return;
      }

      setLocationInventory((inventoryData as LocationInventoryRow[]) ?? []);
      setIsLoading(false);
      return;
    }

    if (shouldTryProduct) {
      const { data: productData, error: productError } = await supabase.rpc(
        "find_product_by_sku_or_barcode",
        {
          p_query: value,
        }
      );

      if (productError) {
        setErrorMessage(productError.message);
        setIsLoading(false);
        return;
      }

      const product = (productData?.[0] as ProductResult | undefined) ?? null;

      if (!product) {
        setErrorMessage("No product found for this SKU or barcode.");
        setIsLoading(false);
        return;
      }

      setProductResult(product);
      setIsLoading(false);
      return;
    }

    setErrorMessage("Scan type could not be detected.");
    setIsLoading(false);
  }

  async function handleScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setWorkflowScan({
      value: scanValue,
      nonce: Date.now(),
    });

    await processScanValue(scanValue);
  }

  async function handleCameraScan(decodedText: string) {
    setScanValue(decodedText);

    setWorkflowScan({
      value: decodedText,
      nonce: Date.now(),
    });

    await processScanValue(decodedText);
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-5 space-y-6">
        <CameraScanner onScanSuccess={handleCameraScan} />

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Manual Scan Input
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Paste a shelf QR payload, location code, SKU, or barcode to test
              the scan flow.
            </p>
          </div>

          <form onSubmit={handleScan} className="space-y-5 p-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Scan Mode
              </label>
              <select
                value={scanMode}
                onChange={(event) => {
                  setScanMode(event.target.value as ScanMode);
                  resetResults();
                }}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="auto">Auto Detect</option>
                <option value="location">Shelf QR / Location</option>
                <option value="product">Product SKU / Barcode</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Scan Value
              </label>
              <textarea
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                rows={4}
                placeholder="Examples: LOC|MAIN|A|A-01-01|..., MAIN / A-01-01, A-01-01, SKU-0001"
                className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Scanning..." : "Run Scan"}
            </button>

            <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Manual test values
              </p>
              <div className="mt-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                <p>
                  <span className="font-medium">Product SKU:</span> SKU-0001
                </p>
                <p>
                  <span className="font-medium">Barcode:</span> 860000000001
                </p>
                <p>
                  <span className="font-medium">Location code:</span> A-01-01
                </p>
                <p>
                  <span className="font-medium">Label title:</span> MAIN /
                  A-01-01
                </p>
                <p>
                  <span className="font-medium">Shelf QR:</span> use a QR
                  payload from QR Labels page
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="xl:col-span-7 space-y-6">
        <GuidedStockOperation
          scannedValue={workflowScan.value}
          scanNonce={workflowScan.nonce}
        />

        {locationResult && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Shelf Location Found
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Location details and current stock content.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Warehouse
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {locationResult.warehouse_code} -{" "}
                  {locationResult.warehouse_name}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Zone
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {locationResult.zone_code || "-"}{" "}
                  {locationResult.zone_name
                    ? `- ${locationResult.zone_name}`
                    : ""}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Location
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {locationResult.location_code} -{" "}
                  {locationResult.location_name}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Type
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {formatLocationType(locationResult.location_type)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Status
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {locationResult.is_active ? "Active" : "Inactive"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  QR Payload
                </p>
                <p className="mt-1 break-all text-xs font-medium text-gray-800 dark:text-white/90">
                  {locationResult.qr_code}
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 p-5 dark:border-gray-800">
              <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                Current Shelf Inventory
              </h4>

              {locationInventory.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This shelf is currently empty.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead>
                      <tr>
                        <th className="py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Product
                        </th>
                        <th className="py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Qty
                        </th>
                        <th className="py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Reserved
                        </th>
                        <th className="py-2 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Available
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {locationInventory.map((item) => (
                        <tr key={item.inventory_id}>
                          <td className="py-3">
                            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {item.sku}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {item.product_name}
                            </p>
                          </td>
                          <td className="py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                            {formatNumber(item.reserved_quantity)}
                          </td>
                          <td className="py-3 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                            {formatNumber(item.available_quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {productResult && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Product Found
            </h3>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  SKU
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.sku}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Barcode
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.barcode || "-"}
                </p>
              </div>

              <div className="md:col-span-2">
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Product
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.product_name}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Brand
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.brand || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Category
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.category || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Unit
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.unit}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Status
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.product_status}
                </p>
              </div>
            </div>
          </div>
        )}

        {!locationResult && !productResult && !errorMessage && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Scan a shelf QR code, location code, product SKU, or barcode to
              see results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}