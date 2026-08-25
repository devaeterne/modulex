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
  stock_status: string;
};

const operationOptions: {
  value: OperationType;
  label: string;
  description: string;
}[] = [
    {
      value: "stock_in",
      label: "Stock In",
      description: "Add quantity to a selected shelf location.",
    },
    {
      value: "stock_out",
      label: "Stock Out",
      description: "Remove available quantity from a selected shelf location.",
    },
    {
      value: "transfer",
      label: "Transfer",
      description: "Move quantity from one shelf location to another.",
    },
    {
      value: "reserve",
      label: "Reserve Stock",
      description: "Reserve available quantity for an operation or order.",
    },
    {
      value: "release",
      label: "Release Reservation",
      description: "Release previously reserved quantity.",
    },
  ];

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

export default function StockOperationForm() {
  const [operationType, setOperationType] =
    useState<OperationType>("stock_in");

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
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingProductLocations, setIsLoadingProductLocations] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedOperation = useMemo(
    () => operationOptions.find((item) => item.value === operationType),
    [operationType]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId]
  );

  const showSourceLocation =
    operationType === "stock_out" ||
    operationType === "transfer" ||
    operationType === "reserve" ||
    operationType === "release";

  const showTargetLocation =
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

  const sourceStockLocation = useMemo(
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

  async function loadProductStockLocations(currentProductId = productId) {
    if (!currentProductId) {
      setProductStockLocations([]);
      setSourceLocationId("");
      return;
    }

    const product = products.find((item) => item.id === currentProductId);

    if (!product) {
      setProductStockLocations([]);
      setSourceLocationId("");
      return;
    }

    setIsLoadingProductLocations(true);
    setErrorMessage(null);

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

    const productLocations = ((data as ProductStockLocation[]) ?? []).filter(
      (item) => item.product_id === currentProductId && Number(item.quantity) > 0
    );

    setProductStockLocations(productLocations);

    setIsLoadingProductLocations(false);
  }

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
    loadProductStockLocations(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, products]);

  useEffect(() => {
    if (!sourceLocationId) return;

    const sourceStillValid = filteredSourceLocations.some(
      (item) => item.location_id === sourceLocationId
    );

    if (!sourceStillValid) {
      setSourceLocationId("");
    }
  }, [filteredSourceLocations, sourceLocationId]);

  function resetMessages() {
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleOperationChange(nextOperationType: OperationType) {
    setOperationType(nextOperationType);
    setSourceLocationId("");
    setTargetLocationId("");
    resetMessages();
  }

  function handleProductChange(nextProductId: string) {
    setProductId(nextProductId);
    setSourceLocationId("");
    setTargetLocationId("");
    resetMessages();
  }

  function getSourcePlaceholder() {
    if (!productId) return "Select product first";

    if (isLoadingProductLocations) return "Loading product locations...";

    if (filteredSourceLocations.length === 0) {
      if (operationType === "release") {
        return "No reserved stock found for this product";
      }

      return "No available stock location found for this product";
    }

    return "Select source location";
  }

  function validate() {
    if (!productId) return "Product is required.";

    const numericQuantity = Number(quantity);

    if (Number.isNaN(numericQuantity) || numericQuantity <= 0) {
      return "Quantity must be greater than zero.";
    }

    if (operationType === "transfer") {
      if (!sourceLocationId) return "Source location is required.";
      if (!targetLocationId) return "Target location is required.";

      if (sourceLocationId === targetLocationId) {
        return "Source and target locations cannot be the same.";
      }

      if (!sourceStockLocation) {
        return "Selected source location is not valid for this product.";
      }

      if (Number(sourceStockLocation.available_quantity) < numericQuantity) {
        return `Insufficient available stock. Available: ${formatNumber(
          sourceStockLocation.available_quantity
        )}`;
      }

      return null;
    }

    if (operationType === "stock_in") {
      if (!targetLocationId) return "Target location is required.";
      return null;
    }

    if (!sourceLocationId) return "Source location is required.";

    if (!sourceStockLocation) {
      return "Selected source location is not valid for this operation.";
    }

    if (
      (operationType === "stock_out" || operationType === "reserve") &&
      Number(sourceStockLocation.available_quantity) < numericQuantity
    ) {
      return `Insufficient available stock. Available: ${formatNumber(
        sourceStockLocation.available_quantity
      )}`;
    }

    if (
      operationType === "release" &&
      Number(sourceStockLocation.reserved_quantity) < numericQuantity
    ) {
      return `Release quantity cannot be greater than reserved quantity. Reserved: ${formatNumber(
        sourceStockLocation.reserved_quantity
      )}`;
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    resetMessages();

    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

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
        p_reason: reason.trim() || "Stock in from admin panel",
        p_notes: notes.trim() || null,
      });
    }

    if (
      (operationType === "stock_out" ||
        operationType === "reserve" ||
        operationType === "release") &&
      sourceStockLocation
    ) {
      const rpcName =
        operationType === "stock_out"
          ? "stock_out"
          : operationType === "reserve"
            ? "reserve_stock"
            : "release_stock";

      result = await supabase.rpc(rpcName, {
        p_product_id: productId,
        p_warehouse_id: sourceStockLocation.warehouse_id,
        p_location_id: sourceStockLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason:
          reason.trim() ||
          (operationType === "stock_out"
            ? "Stock out from admin panel"
            : operationType === "reserve"
              ? "Reservation from admin panel"
              : "Reservation release from admin panel"),
        p_notes: notes.trim() || null,
      });
    }

    if (operationType === "transfer" && sourceStockLocation && targetLocation) {
      result = await supabase.rpc("stock_transfer", {
        p_product_id: productId,
        p_from_warehouse_id: sourceStockLocation.warehouse_id,
        p_from_location_id: sourceStockLocation.location_id,
        p_to_warehouse_id: targetLocation.warehouse_id,
        p_to_location_id: targetLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: reason.trim() || "Transfer from admin panel",
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

    setSuccessMessage("Stock operation completed successfully.");
    setReferenceNo("");
    setReason("");
    setNotes("");
    setQuantity("1");

    await loadProductStockLocations(productId);

    setIsSubmitting(false);
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <form
        onSubmit={handleSubmit}
        className="xl:col-span-8 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Run Stock Operation
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add, remove, transfer, reserve, or release stock using Supabase RPC
            operations.
          </p>
        </div>

        {errorMessage && (
          <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="m-5 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {successMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Operation Type
            </label>
            <select
              value={operationType}
              onChange={(event) =>
                handleOperationChange(event.target.value as OperationType)
              }
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

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Product <span className="text-error-500">*</span>
            </label>
            <select
              value={productId}
              onChange={(event) => handleProductChange(event.target.value)}
              disabled={isLoadingOptions}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </div>

          {showSourceLocation && (
            <div
              className={operationType === "transfer" ? "" : "md:col-span-2"}
            >
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Source Location <span className="text-error-500">*</span>
              </label>
              <select
                value={sourceLocationId}
                onChange={(event) => setSourceLocationId(event.target.value)}
                disabled={
                  isLoadingOptions ||
                  isLoadingProductLocations ||
                  !productId ||
                  filteredSourceLocations.length === 0
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">{getSourcePlaceholder()}</option>

                {filteredSourceLocations.map((location) => (
                  <option
                    key={location.location_id}
                    value={location.location_id}
                  >
                    {location.warehouse_code} / {location.location_code} -{" "}
                    {location.location_name} | Qty:{" "}
                    {formatNumber(location.quantity)} | Available:{" "}
                    {formatNumber(location.available_quantity)} | Reserved:{" "}
                    {formatNumber(location.reserved_quantity)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showTargetLocation && (
            <div
              className={operationType === "transfer" ? "" : "md:col-span-2"}
            >
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Target Location <span className="text-error-500">*</span>
              </label>
              <select
                value={targetLocationId}
                onChange={(event) => setTargetLocationId(event.target.value)}
                disabled={isLoadingOptions}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Select target location</option>
                {locations.map((location) => (
                  <option
                    key={location.location_id}
                    value={location.location_id}
                  >
                    {location.warehouse_code} / {location.location_code} -{" "}
                    {location.location_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Quantity <span className="text-error-500">*</span>
            </label>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
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
              placeholder="OP-0001"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Reason
            </label>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              type="text"
              placeholder="Optional operation reason"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Optional notes"
              className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <button
            type="submit"
            disabled={isSubmitting || isLoadingOptions}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Processing..." : "Run Operation"}
          </button>
        </div>
      </form>

      <div className="xl:col-span-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Operation Guide
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose the operation type and fill the required fields.
        </p>

        {selectedProduct && (
          <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
            <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
              Selected Product
            </p>
            <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">
              {selectedProduct.sku} - {selectedProduct.name}
            </p>
            {showSourceLocation && (
              <p className="mt-2 text-xs text-brand-600 dark:text-brand-400">
                Available source locations: {filteredSourceLocations.length}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 space-y-4">
          {operationOptions.map((operation) => (
            <div
              key={operation.value}
              className="rounded-xl border border-gray-100 p-4 dark:border-gray-800"
            >
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {operation.label}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {operation.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}