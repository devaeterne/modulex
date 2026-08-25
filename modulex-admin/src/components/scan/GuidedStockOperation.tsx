"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type OperationType =
  | "stock_in"
  | "stock_out"
  | "transfer"
  | "reserve"
  | "release";

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
};

type LocationOption = {
  location_id: string;
  warehouse_id: string;
  warehouse_code: string;
  location_code: string;
  location_name: string;
  zone_code: string | null;
  qr_code: string | null;
};

type ProductStockLocation = {
  inventory_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_id: string;
  location_code: string;
  location_name: string;
  qr_code: string | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  stock_status: string;
};

type GuidedStockOperationProps = {
  scannedValue?: string;
  scanNonce?: number;
};

const operationOptions: {
  value: OperationType;
  label: string;
  description: string;
}[] = [
    {
      value: "stock_in",
      label: "Stock In",
      description: "Scan/select a product, then scan/select any target shelf.",
    },
    {
      value: "stock_out",
      label: "Stock Out",
      description: "Scan/select a product, then scan/select a shelf where it exists.",
    },
    {
      value: "transfer",
      label: "Transfer",
      description: "Scan/select product, source shelf, and target shelf.",
    },
    {
      value: "reserve",
      label: "Reserve Stock",
      description: "Reserve available stock from a selected source shelf.",
    },
    {
      value: "release",
      label: "Release Reservation",
      description: "Release reserved stock from a selected source shelf.",
    },
  ];

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function isLocationScan(value: string) {
  const normalized = value.trim().toUpperCase();

  return (
    normalized.startsWith("LOC|") ||
    normalized.startsWith("LOC-") ||
    normalized.includes(" / ") ||
    /^[A-Z]+-\d{2}-\d{2}$/.test(normalized) ||
    /^RET-\d{2}-\d{2}$/.test(normalized)
  );
}

function extractLocationCode(value: string) {
  const trimmed = value.trim();

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((item) => item.trim());
    if (parts.length >= 4) return parts[3];
  }

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map((item) => item.trim());
    return parts[parts.length - 1];
  }

  if (trimmed.startsWith("LOC-")) {
    return trimmed.replace(/^LOC-[^-]+-/, "");
  }

  return trimmed;
}

export default function GuidedStockOperation({
  scannedValue,
  scanNonce,
}: GuidedStockOperationProps) {
  const [operationType, setOperationType] =
    useState<OperationType>("transfer");

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [productStockLocations, setProductStockLocations] = useState<
    ProductStockLocation[]
  >([]);

  const [productId, setProductId] = useState("");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");

  const [quantity, setQuantity] = useState("1");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingProductLocations, setIsLoadingProductLocations] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId]
  );

  const selectedOperation = useMemo(
    () => operationOptions.find((item) => item.value === operationType),
    [operationType]
  );

  const needsSource =
    operationType === "stock_out" ||
    operationType === "transfer" ||
    operationType === "reserve" ||
    operationType === "release";

  const needsTarget =
    operationType === "stock_in" || operationType === "transfer";

  const filteredSourceLocations = useMemo(() => {
    if (operationType === "release") {
      return productStockLocations.filter(
        (item) => Number(item.reserved_quantity) > 0
      );
    }

    if (
      operationType === "stock_out" ||
      operationType === "transfer" ||
      operationType === "reserve"
    ) {
      return productStockLocations.filter(
        (item) => Number(item.available_quantity) > 0
      );
    }

    return [];
  }, [operationType, productStockLocations]);

  const sourceLocation = useMemo(
    () =>
      filteredSourceLocations.find(
        (item) => item.location_id === sourceLocationId
      ),
    [filteredSourceLocations, sourceLocationId]
  );

  const targetLocation = useMemo(
    () => locations.find((item) => item.location_id === targetLocationId),
    [locations, targetLocationId]
  );

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
      setErrorMessage(null);

      const [
        { data: productsData, error: productsError },
        { data: locationsData, error: locationsError },
      ] = await Promise.all([
        supabase
          .from("products")
          .select("id, sku, name, barcode")
          .eq("status", "active")
          .order("sku", { ascending: true }),
        supabase
          .from("v_location_stock_summary")
          .select(
            "location_id, warehouse_id, warehouse_code, location_code, location_name, zone_code, qr_code"
          )
          .eq("is_active", true)
          .order("warehouse_code", { ascending: true })
          .order("location_code", { ascending: true }),
      ]);

      if (productsError) {
        setErrorMessage(productsError.message);
        setIsLoadingOptions(false);
        return;
      }

      if (locationsError) {
        setErrorMessage(locationsError.message);
        setIsLoadingOptions(false);
        return;
      }

      setProducts((productsData as ProductOption[]) ?? []);
      setLocations((locationsData as LocationOption[]) ?? []);
      setIsLoadingOptions(false);
    }

    loadOptions();
  }, []);

  useEffect(() => {
    async function loadProductLocations() {
      if (!productId) {
        setProductStockLocations([]);
        setSourceLocationId("");
        return;
      }

      const product = products.find((item) => item.id === productId);
      if (!product) return;

      setIsLoadingProductLocations(true);

      const { data, error } = await supabase.rpc("search_stock", {
        p_query: product.sku,
        p_limit: 100,
      });

      if (error) {
        setErrorMessage(error.message);
        setProductStockLocations([]);
        setSourceLocationId("");
        setIsLoadingProductLocations(false);
        return;
      }

      const rows = ((data as ProductStockLocation[]) ?? []).filter(
        (item) => item.product_id === productId && Number(item.quantity) > 0
      );

      setProductStockLocations(rows);

      if (
        sourceLocationId &&
        !rows.some((item) => item.location_id === sourceLocationId)
      ) {
        setSourceLocationId("");
      }

      setIsLoadingProductLocations(false);
    }

    loadProductLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, products]);

  useEffect(() => {
    if (!scannedValue || !scanNonce) return;
    applyScannedValue(scannedValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanNonce]);

  function resetMessages() {
    setInfoMessage(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function resetOperation() {
    setProductId("");
    setSourceLocationId("");
    setTargetLocationId("");
    setQuantity("1");
    setReferenceNo("");
    setNotes("");
    resetMessages();
  }

  function findProductFromValue(value: string) {
    const normalized = value.trim().toLowerCase();

    return products.find(
      (product) =>
        product.sku.toLowerCase() === normalized ||
        product.barcode?.toLowerCase() === normalized
    );
  }

  function findLocationFromValue(value: string) {
    const raw = value.trim();
    const code = extractLocationCode(raw).toLowerCase();

    return locations.find((location) => {
      const label = `${location.warehouse_code} / ${location.location_code}`;

      return (
        location.qr_code?.toLowerCase() === raw.toLowerCase() ||
        location.location_code.toLowerCase() === code ||
        label.toLowerCase() === raw.toLowerCase()
      );
    });
  }

  function selectScannedLocation(location: LocationOption) {
    if (operationType === "stock_in") {
      setTargetLocationId(location.location_id);
      setInfoMessage(
        `Target shelf selected: ${location.warehouse_code} / ${location.location_code}`
      );
      return;
    }

    if (!productId) {
      setErrorMessage("Scan or select product before selecting source shelf.");
      return;
    }

    if (operationType === "transfer") {
      if (!sourceLocationId) {
        const validSource = filteredSourceLocations.find(
          (item) => item.location_id === location.location_id
        );

        if (!validSource) {
          setErrorMessage(
            "This shelf is not valid as source for the selected product."
          );
          return;
        }

        setSourceLocationId(location.location_id);
        setInfoMessage(
          `Source shelf selected: ${location.warehouse_code} / ${location.location_code}`
        );
        return;
      }

      setTargetLocationId(location.location_id);
      setInfoMessage(
        `Target shelf selected: ${location.warehouse_code} / ${location.location_code}`
      );
      return;
    }

    const validSource = filteredSourceLocations.find(
      (item) => item.location_id === location.location_id
    );

    if (!validSource) {
      setErrorMessage(
        "This shelf is not valid for the selected product and workflow."
      );
      return;
    }

    setSourceLocationId(location.location_id);
    setInfoMessage(
      `Source shelf selected: ${location.warehouse_code} / ${location.location_code}`
    );
  }

  function applyScannedValue(value: string) {
    const raw = value.trim();

    if (!raw) return;

    resetMessages();

    if (isLocationScan(raw)) {
      const location = findLocationFromValue(raw);

      if (!location) {
        setErrorMessage("No shelf found for scanned value.");
        return;
      }

      selectScannedLocation(location);
      return;
    }

    const product = findProductFromValue(raw);

    if (!product) {
      setErrorMessage("No product found for scanned SKU or barcode.");
      return;
    }

    setProductId(product.id);
    setSourceLocationId("");
    setTargetLocationId("");
    setInfoMessage(`Product selected: ${product.sku} - ${product.name}`);
  }

  function validate() {
    if (!productId) return "Product is required.";

    const numericQuantity = Number(quantity);

    if (Number.isNaN(numericQuantity) || numericQuantity <= 0) {
      return "Quantity must be greater than zero.";
    }

    if (needsSource && !sourceLocationId) {
      return "Source shelf is required.";
    }

    if (needsTarget && !targetLocationId) {
      return "Target shelf is required.";
    }

    if (operationType === "transfer" && sourceLocationId === targetLocationId) {
      return "Source and target shelf cannot be the same.";
    }

    if (
      sourceLocation &&
      (operationType === "stock_out" ||
        operationType === "transfer" ||
        operationType === "reserve") &&
      Number(sourceLocation.available_quantity) < numericQuantity
    ) {
      return `Insufficient available stock. Available: ${formatNumber(
        sourceLocation.available_quantity
      )}`;
    }

    if (
      sourceLocation &&
      operationType === "release" &&
      Number(sourceLocation.reserved_quantity) < numericQuantity
    ) {
      return `Reserved quantity is not enough. Reserved: ${formatNumber(
        sourceLocation.reserved_quantity
      )}`;
    }

    return null;
  }

  function getConfirmationMessage() {
    const productLabel = selectedProduct
      ? `${selectedProduct.sku} - ${selectedProduct.name}`
      : "selected product";

    const sourceLabel = sourceLocation
      ? `${sourceLocation.warehouse_code} / ${sourceLocation.location_code}`
      : "";

    const targetLabel = targetLocation
      ? `${targetLocation.warehouse_code} / ${targetLocation.location_code}`
      : "";

    if (operationType === "stock_in") {
      return `Add ${quantity} unit(s) of ${productLabel} to ${targetLabel}?`;
    }

    if (operationType === "stock_out") {
      return `Remove ${quantity} unit(s) of ${productLabel} from ${sourceLabel}?`;
    }

    if (operationType === "transfer") {
      return `Transfer ${quantity} unit(s) of ${productLabel} from ${sourceLabel} to ${targetLabel}?`;
    }

    if (operationType === "reserve") {
      return `Reserve ${quantity} unit(s) of ${productLabel} from ${sourceLabel}?`;
    }

    return `Release ${quantity} reserved unit(s) of ${productLabel} from ${sourceLabel}?`;
  }

  async function runOperation() {
    resetMessages();

    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const confirmed = window.confirm(getConfirmationMessage());
    if (!confirmed) return;

    const numericQuantity = Number(quantity);

    setIsSubmitting(true);

    let result:
      | {
        data: unknown;
        error: {
          message: string;
        } | null;
      }
      | undefined;

    if (operationType === "stock_in" && targetLocation) {
      result = await supabase.rpc("stock_in", {
        p_product_id: productId,
        p_warehouse_id: targetLocation.warehouse_id,
        p_location_id: targetLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: "Guided stock in",
        p_notes: notes.trim() || null,
      });
    }

    if (
      (operationType === "stock_out" ||
        operationType === "reserve" ||
        operationType === "release") &&
      sourceLocation
    ) {
      const rpcName =
        operationType === "stock_out"
          ? "stock_out"
          : operationType === "reserve"
            ? "reserve_stock"
            : "release_stock";

      result = await supabase.rpc(rpcName, {
        p_product_id: productId,
        p_warehouse_id: sourceLocation.warehouse_id,
        p_location_id: sourceLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: `Guided ${operationType}`,
        p_notes: notes.trim() || null,
      });
    }

    if (operationType === "transfer" && sourceLocation && targetLocation) {
      result = await supabase.rpc("stock_transfer", {
        p_product_id: productId,
        p_from_warehouse_id: sourceLocation.warehouse_id,
        p_from_location_id: sourceLocation.location_id,
        p_to_warehouse_id: targetLocation.warehouse_id,
        p_to_location_id: targetLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: "Guided transfer",
        p_notes: notes.trim() || null,
      });
    }

    if (!result) {
      setErrorMessage("Operation could not be prepared.");
      setIsSubmitting(false);
      return;
    }

    if (result.error) {
      setErrorMessage(result.error.message);
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Operation completed successfully.");
    setQuantity("1");
    setReferenceNo("");
    setNotes("");

    if (productId) {
      const product = products.find((item) => item.id === productId);

      if (product) {
        const { data } = await supabase.rpc("search_stock", {
          p_query: product.sku,
          p_limit: 100,
        });

        const rows = ((data as ProductStockLocation[]) ?? []).filter(
          (item) => item.product_id === productId && Number(item.quantity) > 0
        );

        setProductStockLocations(rows);
      }
    }

    setIsSubmitting(false);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Guided Stock Workflow
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Scan or select product and shelves before confirming a stock action.
        </p>
      </div>

      <div className="space-y-5 p-5">
        {errorMessage && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {successMessage}
          </div>
        )}

        {infoMessage && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400">
            {infoMessage}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Workflow
          </label>
          <select
            value={operationType}
            onChange={(event) => {
              setOperationType(event.target.value as OperationType);
              resetOperation();
            }}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            {operationOptions.map((operation) => (
              <option key={operation.value} value={operation.value}>
                {operation.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {selectedOperation?.description}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Product
          </label>
          <select
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setSourceLocationId("");
              setTargetLocationId("");
              resetMessages();
            }}
            disabled={isLoadingOptions}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">Scan or select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} - {product.name}
              </option>
            ))}
          </select>
        </div>

        {needsSource && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Source Shelf
            </label>
            <select
              value={sourceLocationId}
              onChange={(event) => {
                setSourceLocationId(event.target.value);
                resetMessages();
              }}
              disabled={!productId || isLoadingProductLocations}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">
                {!productId
                  ? "Select product first"
                  : "Scan or select source shelf"}
              </option>
              {filteredSourceLocations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.warehouse_code} / {location.location_code} | Avail:{" "}
                  {formatNumber(location.available_quantity)} | Reserved:{" "}
                  {formatNumber(location.reserved_quantity)}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsTarget && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Target Shelf
            </label>
            <select
              value={targetLocationId}
              onChange={(event) => {
                setTargetLocationId(event.target.value);
                resetMessages();
              }}
              disabled={isLoadingOptions}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">Scan or select target shelf</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.warehouse_code} / {location.location_code} -{" "}
                  {location.location_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Quantity
            </label>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Reference No
            </label>
            <input
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              type="text"
              placeholder="SCAN-OP-0001"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={runOperation}
            disabled={isSubmitting}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Processing..." : "Confirm Operation"}
          </button>

          <button
            type="button"
            onClick={resetOperation}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}