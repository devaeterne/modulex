"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";

type OperationType = "stock_in" | "stock_out" | "transfer" | "reserve" | "release";
type ProductOption = { id: string; sku: string; name: string; barcode: string | null };
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

type PendingIdempotency = { signature: string; key: string };

const operationOptions: { value: OperationType; label: string; description: string }[] = [
  { value: "stock_in", label: "Stock In", description: "Add quantity to a selected shelf location." },
  { value: "stock_out", label: "Stock Out", description: "Remove available quantity from a selected shelf location." },
  { value: "transfer", label: "Transfer", description: "Move quantity from one shelf location to another." },
  { value: "reserve", label: "Reserve Stock", description: "Reserve available quantity for an operation or order." },
  { value: "release", label: "Release Reservation", description: "Release previously reserved quantity." },
];

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const formatNumber = (value: number | string | null | undefined) =>
  numberFormatter.format(Number(value ?? 0));

export default function StockOperationForm() {
  const [operationType, setOperationType] = useState<OperationType>("stock_in");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [productStockLocations, setProductStockLocations] = useState<ProductStockLocation[]>([]);
  const [productId, setProductId] = useState("");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [referenceNo, setReferenceNo] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingProductLocations, setIsLoadingProductLocations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const idempotencyRef = useRef<PendingIdempotency | null>(null);

  const selectedOperation = useMemo(
    () => operationOptions.find((item) => item.value === operationType),
    [operationType],
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId],
  );
  const showSourceLocation = ["stock_out", "transfer", "reserve", "release"].includes(operationType);
  const showTargetLocation = operationType === "stock_in" || operationType === "transfer";

  const filteredSourceLocations = useMemo(() => {
    if (operationType === "release") {
      return productStockLocations.filter((item) => Number(item.reserved_quantity) > 0);
    }
    if (["stock_out", "transfer", "reserve"].includes(operationType)) {
      return productStockLocations.filter((item) => Number(item.available_quantity) > 0);
    }
    return [];
  }, [operationType, productStockLocations]);

  const sourceStockLocation = useMemo(
    () => filteredSourceLocations.find((item) => item.location_id === sourceLocationId),
    [filteredSourceLocations, sourceLocationId],
  );
  const targetLocation = useMemo(
    () => locations.find((item) => item.location_id === targetLocationId),
    [locations, targetLocationId],
  );

  function getIdempotencyKey(rpcName: string, payload: Record<string, unknown>) {
    const signature = JSON.stringify([rpcName, payload]);
    if (!idempotencyRef.current || idempotencyRef.current.signature !== signature) {
      idempotencyRef.current = { signature, key: crypto.randomUUID() };
    }
    return idempotencyRef.current.key;
  }

  const loadProductStockLocations = useCallback(
    async (currentProductId: string) => {
      if (!currentProductId) {
        setProductStockLocations([]);
        setSourceLocationId("");
        return;
      }

      const product = products.find((item) => item.id === currentProductId);
      if (!product) return;

      setIsLoadingProductLocations(true);
      const { data, error } = await supabase.rpc("search_stock", {
        p_query: product.sku,
        p_limit: 100,
      });

      if (error) {
        console.error("Failed to load stock operation locations", error);
        setErrorMessage("Product stock locations could not be loaded. Try selecting the product again.");
        setProductStockLocations([]);
        setSourceLocationId("");
        setIsLoadingProductLocations(false);
        return;
      }

      setProductStockLocations(
        ((data as ProductStockLocation[]) ?? []).filter(
          (item) => item.product_id === currentProductId && Number(item.quantity) > 0,
        ),
      );
      setIsLoadingProductLocations(false);
    },
    [products],
  );

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
      setErrorMessage(null);

      const [productsResult, locationsResult] = await Promise.all([
        supabase
          .from("products")
          .select("id, sku, name, barcode")
          .eq("status", "active")
          .order("sku", { ascending: true }),
        supabase
          .from("v_location_stock_summary")
          .select(
            "location_id, warehouse_id, warehouse_code, location_code, location_name, zone_code, qr_code",
          )
          .eq("is_active", true)
          .order("warehouse_code", { ascending: true })
          .order("location_code", { ascending: true }),
      ]);

      const loadError = productsResult.error ?? locationsResult.error;
      if (loadError) {
        console.error("Failed to load stock operation options", loadError);
        setErrorMessage("Stock operation options could not be loaded. Refresh the page to try again.");
        setIsLoadingOptions(false);
        return;
      }

      setProducts((productsResult.data as ProductOption[]) ?? []);
      setLocations((locationsResult.data as LocationOption[]) ?? []);
      setIsLoadingOptions(false);
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    void loadProductStockLocations(productId);
  }, [productId, loadProductStockLocations]);

  useEffect(() => {
    if (
      sourceLocationId &&
      !filteredSourceLocations.some((item) => item.location_id === sourceLocationId)
    ) {
      setSourceLocationId("");
    }
  }, [filteredSourceLocations, sourceLocationId]);

  function resetMessages() {
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function changeOperation(next: OperationType) {
    setOperationType(next);
    setSourceLocationId("");
    setTargetLocationId("");
    resetMessages();
  }

  function changeProduct(next: string) {
    setProductId(next);
    setSourceLocationId("");
    setTargetLocationId("");
    resetMessages();
  }

  function sourcePlaceholder() {
    if (!productId) return "Select product first";
    if (isLoadingProductLocations) return "Loading product locations...";
    if (filteredSourceLocations.length === 0) {
      return operationType === "release"
        ? "No reserved stock found for this product"
        : "No available stock location found for this product";
    }
    return "Select source location";
  }

  function validate() {
    if (!productId) return "Product is required.";

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      return "Quantity must be greater than zero.";
    }

    if (operationType === "stock_in") {
      return targetLocationId ? null : "Target location is required.";
    }
    if (!sourceLocationId) return "Source location is required.";
    if (!sourceStockLocation) return "Selected source location is not valid for this operation.";

    if (operationType === "transfer") {
      if (!targetLocationId) return "Target location is required.";
      if (sourceLocationId === targetLocationId) {
        return "Source and target locations cannot be the same.";
      }
    }

    if (
      ["stock_out", "transfer", "reserve"].includes(operationType) &&
      Number(sourceStockLocation.available_quantity) < numericQuantity
    ) {
      return `Insufficient available stock. Available: ${formatNumber(sourceStockLocation.available_quantity)}`;
    }

    if (
      operationType === "release" &&
      Number(sourceStockLocation.reserved_quantity) < numericQuantity
    ) {
      return `Release quantity cannot be greater than reserved quantity. Reserved: ${formatNumber(sourceStockLocation.reserved_quantity)}`;
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

    let result: { data: unknown; error: { message: string } | null } | undefined;

    if (operationType === "stock_in" && targetLocation) {
      const rpcName = "stock_in_idempotent";
      const payload = {
        p_product_id: productId,
        p_warehouse_id: targetLocation.warehouse_id,
        p_location_id: targetLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: reason.trim() || "Stock in from admin panel",
        p_notes: notes.trim() || null,
      };
      result = await supabase.rpc(rpcName, {
        ...payload,
        p_idempotency_key: getIdempotencyKey(rpcName, payload),
      });
    } else if (operationType === "transfer" && sourceStockLocation && targetLocation) {
      const rpcName = "stock_transfer_idempotent";
      const payload = {
        p_product_id: productId,
        p_from_warehouse_id: sourceStockLocation.warehouse_id,
        p_from_location_id: sourceStockLocation.location_id,
        p_to_warehouse_id: targetLocation.warehouse_id,
        p_to_location_id: targetLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: reason.trim() || "Transfer from admin panel",
        p_notes: notes.trim() || null,
      };
      result = await supabase.rpc(rpcName, {
        ...payload,
        p_idempotency_key: getIdempotencyKey(rpcName, payload),
      });
    } else if (sourceStockLocation) {
      const rpcName =
        operationType === "stock_out"
          ? "stock_out_idempotent"
          : operationType === "reserve"
            ? "reserve_stock_idempotent"
            : "release_stock_idempotent";
      const fallbackReason =
        operationType === "stock_out"
          ? "Stock out from admin panel"
          : operationType === "reserve"
            ? "Reservation from admin panel"
            : "Reservation release from admin panel";
      const payload = {
        p_product_id: productId,
        p_warehouse_id: sourceStockLocation.warehouse_id,
        p_location_id: sourceStockLocation.location_id,
        p_quantity: numericQuantity,
        p_reference_no: referenceNo.trim() || null,
        p_reason: reason.trim() || fallbackReason,
        p_notes: notes.trim() || null,
      };
      result = await supabase.rpc(rpcName, {
        ...payload,
        p_idempotency_key: getIdempotencyKey(rpcName, payload),
      });
    }

    if (!result) {
      setErrorMessage("Operation could not be prepared.");
      setIsSubmitting(false);
      return;
    }

    if (result.error) {
      console.error("Stock operation failed", result.error);
      setErrorMessage("The stock operation could not be completed. Review the values and try again.");
      setIsSubmitting(false);
      return;
    }

    idempotencyRef.current = null;
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
        aria-label="Run Stock Operation"
        aria-busy={isSubmitting || isLoadingOptions}
        className="xl:col-span-8"
      >
        <ComponentCard
          title="Run Stock Operation"
          desc="Add, remove, transfer, reserve, or release stock using protected, retry-safe inventory operations."
        >
          {errorMessage ? (
            <div role="alert">
              <Alert variant="error" title="Stock operation unavailable" message={errorMessage} />
            </div>
          ) : null}

          {successMessage ? (
            <div role="status" aria-live="polite">
              <Alert variant="success" title="Operation completed" message={successMessage} />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="stock-operation-type">Operation Type</Label>
              <Select
                id="stock-operation-type"
                value={operationType}
                onChange={(value) => changeOperation(value as OperationType)}
                options={operationOptions.map((operation) => ({
                  value: operation.value,
                  label: operation.label,
                }))}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {selectedOperation?.description}
              </p>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="stock-operation-product">
                Product <span aria-hidden="true" className="text-error-500">*</span>
              </Label>
              <Select
                id="stock-operation-product"
                value={productId}
                onChange={changeProduct}
                disabled={isLoadingOptions}
                required
                allowEmpty
                placeholder="Select product"
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.sku} - ${product.name}`,
                }))}
              />
            </div>

            {showSourceLocation ? (
              <div className={operationType === "transfer" ? "" : "md:col-span-2"}>
                <Label htmlFor="stock-operation-source">
                  Source Location <span aria-hidden="true" className="text-error-500">*</span>
                </Label>
                <Select
                  id="stock-operation-source"
                  value={sourceLocationId}
                  onChange={setSourceLocationId}
                  disabled={
                    isLoadingOptions ||
                    isLoadingProductLocations ||
                    !productId ||
                    filteredSourceLocations.length === 0
                  }
                  required
                  allowEmpty
                  placeholder={sourcePlaceholder()}
                  options={filteredSourceLocations.map((location) => ({
                    value: location.location_id,
                    label: `${location.warehouse_code} / ${location.location_code} - ${location.location_name} | On Hand: ${formatNumber(location.quantity)} | Available: ${formatNumber(location.available_quantity)} | Reserved: ${formatNumber(location.reserved_quantity)}`,
                  }))}
                />
              </div>
            ) : null}

            {showTargetLocation ? (
              <div className={operationType === "transfer" ? "" : "md:col-span-2"}>
                <Label htmlFor="stock-operation-target">
                  Target Location <span aria-hidden="true" className="text-error-500">*</span>
                </Label>
                <Select
                  id="stock-operation-target"
                  value={targetLocationId}
                  onChange={setTargetLocationId}
                  disabled={isLoadingOptions}
                  required
                  allowEmpty
                  placeholder="Select target location"
                  options={locations.map((location) => ({
                    value: location.location_id,
                    label: `${location.warehouse_code} / ${location.location_code} - ${location.location_name}`,
                  }))}
                />
              </div>
            ) : null}

            <div>
              <Label htmlFor="stock-operation-quantity">
                Quantity <span aria-hidden="true" className="text-error-500">*</span>
              </Label>
              <Input
                id="stock-operation-quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </div>

            <div>
              <Label htmlFor="stock-operation-reference">Reference No</Label>
              <Input
                id="stock-operation-reference"
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                type="text"
                placeholder="OP-0001"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="stock-operation-reason">Reason</Label>
              <Input
                id="stock-operation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                type="text"
                placeholder="Optional operation reason"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="stock-operation-notes">Notes</Label>
              <TextArea
                id="stock-operation-notes"
                value={notes}
                onChange={setNotes}
                rows={4}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || isLoadingOptions}>
              {isSubmitting ? "Processing..." : "Run Operation"}
            </Button>
          </div>
        </ComponentCard>
      </form>

      <aside aria-label="Stock operation guide" className="xl:col-span-4">
        <ComponentCard
          title="Operation Guide"
          desc="Choose the operation type and fill the required fields."
        >
          {selectedProduct ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
              <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Selected Product</p>
              <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">
                {selectedProduct.sku} - {selectedProduct.name}
              </p>
              {showSourceLocation ? (
                <p className="mt-2 text-xs text-brand-600 dark:text-brand-400">
                  Available source locations: {filteredSourceLocations.length}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-4">
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
        </ComponentCard>
      </aside>
    </div>
  );
}
