"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase/client";

import {
  parseScanValue,
  type ParsedScanValue,
} from "@/lib/scan/parseScanValue";

export type StockOperationType =
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
  qr_value: string | null;
};

type WarehouseRelation = {
  id: string;
  code: string;
  name: string;
  warehouse_type: string;
};

type ZoneRelation = {
  id: string;
  code: string;
  name: string;
};

type Relation<T> =
  | T
  | T[]
  | null;

type LocationRow = {
  id: string;

  warehouse_id: string;
  zone_id: string | null;

  code: string;
  name: string;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;

  warehouses: Relation<WarehouseRelation>;
  zones: Relation<ZoneRelation>;
};

type LocationOption = {
  location_id: string;

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_type: string;

  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;

  location_code: string;
  location_name: string;

  qr_code: string | null;
  qr_payload: string | null;
};

type ProductStockLocation = {
  inventory_id: string;

  product_id: string;

  sku: string;
  product_name: string;

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;

  zone_id?: string | null;
  zone_code?: string | null;
  zone_name?: string | null;

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
  operationType: StockOperationType;

  scannedValue?: string;
  scanNonce?: number;

  onWorkflowReadyChange?: (
    isReady: boolean
  ) => void;
};

const operationMeta: Record<
  StockOperationType,
  {
    title: string;
    description: string;
    buttonLabel: string;
  }
> = {
  stock_in: {
    title: "Stock In",
    description:
      "Scan the product and the target shelf.",
    buttonLabel:
      "Confirm Stock In",
  },

  stock_out: {
    title: "Stock Out",
    description:
      "Scan the product, then choose or scan the source shelf.",
    buttonLabel:
      "Confirm Stock Out",
  },

  transfer: {
    title: "Transfer Stock",
    description:
      "Scan the product, choose the source shelf, then scan the target shelf.",
    buttonLabel:
      "Confirm Transfer",
  },

  reserve: {
    title: "Reserve Stock",
    description:
      "Scan the product and choose the shelf with available stock.",
    buttonLabel:
      "Confirm Reservation",
  },

  release: {
    title: "Release Reservation",
    description:
      "Scan the product and choose the shelf containing reserved stock.",
    buttonLabel:
      "Confirm Release",
  },
};

function getSingleRelation<T>(
  value: Relation<T>
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function formatNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  return Number(
    value ?? 0
  ).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatWarehouseType(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function mapLocationRow(
  row: LocationRow
): LocationOption | null {
  const warehouse =
    getSingleRelation(
      row.warehouses
    );

  const zone =
    getSingleRelation(
      row.zones
    );

  if (!warehouse) {
    return null;
  }

  return {
    location_id: row.id,

    warehouse_id:
      row.warehouse_id,

    warehouse_code:
      warehouse.code,

    warehouse_name:
      warehouse.name,

    warehouse_type:
      warehouse.warehouse_type,

    zone_id: row.zone_id,

    zone_code:
      zone?.code ?? null,

    zone_name:
      zone?.name ?? null,

    location_code:
      row.code,

    location_name:
      row.name,

    qr_code:
      row.qr_code,

    qr_payload:
      row.qr_payload,
  };
}

export default function GuidedStockOperation({
  operationType,

  scannedValue,
  scanNonce,

  onWorkflowReadyChange,
}: GuidedStockOperationProps) {
  const [
    products,
    setProducts,
  ] = useState<
    ProductOption[]
  >([]);

  const [
    locations,
    setLocations,
  ] = useState<
    LocationOption[]
  >([]);

  const [
    productStockLocations,
    setProductStockLocations,
  ] = useState<
    ProductStockLocation[]
  >([]);

  const [
    productId,
    setProductId,
  ] = useState("");

  const [
    sourceLocationId,
    setSourceLocationId,
  ] = useState("");

  const [
    targetLocationId,
    setTargetLocationId,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState("1");

  const [
    referenceNo,
    setReferenceNo,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    isLoadingOptions,
    setIsLoadingOptions,
  ] = useState(true);

  const [
    isLoadingProductLocations,
    setIsLoadingProductLocations,
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    infoMessage,
    setInfoMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null
    );

  const meta =
    operationMeta[
    operationType
    ];

  const selectedProduct =
    useMemo(
      () =>
        products.find(
          (product) =>
            product.id ===
            productId
        ),
      [
        products,
        productId,
      ]
    );

  const needsSource =
    operationType ===
    "stock_out" ||
    operationType ===
    "transfer" ||
    operationType ===
    "reserve" ||
    operationType ===
    "release";

  const needsTarget =
    operationType ===
    "stock_in" ||
    operationType ===
    "transfer";

  /*
   * Stock positions eligible
   * as source for current operation.
   */
  const filteredSourceLocations =
    useMemo(() => {
      if (
        operationType ===
        "release"
      ) {
        return productStockLocations.filter(
          (item) =>
            Number(
              item.reserved_quantity
            ) > 0
        );
      }

      return productStockLocations.filter(
        (item) =>
          Number(
            item.available_quantity
          ) > 0
      );
    }, [
      operationType,
      productStockLocations,
    ]);

  const sourceLocation =
    useMemo(
      () =>
        filteredSourceLocations.find(
          (item) =>
            item.location_id ===
            sourceLocationId
        ),
      [
        filteredSourceLocations,
        sourceLocationId,
      ]
    );

  const targetLocation =
    useMemo(
      () =>
        locations.find(
          (item) =>
            item.location_id ===
            targetLocationId
        ),
      [
        locations,
        targetLocationId,
      ]
    );

  const sourceLocationMeta =
    useMemo(
      () =>
        locations.find(
          (item) =>
            item.location_id ===
            sourceLocationId
        ),
      [
        locations,
        sourceLocationId,
      ]
    );

  const productReady =
    Boolean(productId);

  const sourceReady =
    !needsSource ||
    Boolean(
      sourceLocationId
    );

  const targetReady =
    !needsTarget ||
    Boolean(
      targetLocationId
    );

  const workflowReady =
    productReady &&
    sourceReady &&
    targetReady;

  /*
   * Parent uses this to decide
   * when camera can disappear.
   */
  useEffect(() => {
    onWorkflowReadyChange?.(
      workflowReady
    );
  }, [
    workflowReady,
    onWorkflowReadyChange,
  ]);

  /*
   * Reset workflow when operation
   * changes from parent.
   */
  useEffect(() => {
    setProductId("");

    setSourceLocationId(
      ""
    );

    setTargetLocationId(
      ""
    );

    setProductStockLocations(
      []
    );

    setQuantity("1");
    setReferenceNo("");
    setNotes("");

    setInfoMessage(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  }, [operationType]);

  /*
   * Load products and all active
   * shelf locations.
   */
  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(
        true
      );

      setErrorMessage(null);

      const [
        {
          data: productsData,
          error: productsError,
        },

        {
          data: locationsData,
          error: locationsError,
        },
      ] =
        await Promise.all([
          supabase
            .from("products")
            .select(
              "id, sku, name, barcode, qr_value"
            )
            .eq(
              "status",
              "active"
            )
            .order("sku", {
              ascending: true,
            }),

          supabase
            .from("locations")
            .select(`
              id,
              warehouse_id,
              zone_id,
              code,
              name,
              qr_code,
              qr_payload,
              is_active,
              warehouses (
                id,
                code,
                name,
                warehouse_type
              ),
              zones (
                id,
                code,
                name
              )
            `)
            .eq(
              "is_active",
              true
            )
            .order("code", {
              ascending: true,
            }),
        ]);

      if (productsError) {
        setErrorMessage(
          productsError.message
        );

        setIsLoadingOptions(
          false
        );

        return;
      }

      if (locationsError) {
        setErrorMessage(
          locationsError.message
        );

        setIsLoadingOptions(
          false
        );

        return;
      }

      setProducts(
        (productsData as ProductOption[]) ??
        []
      );

      const mappedLocations =
        (
          (locationsData ??
            []) as unknown as LocationRow[]
        )
          .map(
            mapLocationRow
          )
          .filter(
            (
              location
            ): location is LocationOption =>
              Boolean(
                location
              )
          )
          .sort(
            (a, b) => {
              const warehouseCompare =
                a.warehouse_code.localeCompare(
                  b.warehouse_code
                );

              if (
                warehouseCompare !==
                0
              ) {
                return warehouseCompare;
              }

              const zoneCompare =
                (
                  a.zone_code ??
                  ""
                ).localeCompare(
                  b.zone_code ??
                  ""
                );

              if (
                zoneCompare !==
                0
              ) {
                return zoneCompare;
              }

              return a.location_code.localeCompare(
                b.location_code
              );
            }
          );

      setLocations(
        mappedLocations
      );

      setIsLoadingOptions(
        false
      );
    }

    loadOptions();
  }, []);

  /*
   * Load every shelf where the
   * selected product currently exists.
   */
  useEffect(() => {
    async function loadProductLocations() {
      if (!productId) {
        setProductStockLocations(
          []
        );

        setSourceLocationId(
          ""
        );

        return;
      }

      const product =
        products.find(
          (item) =>
            item.id ===
            productId
        );

      if (!product) {
        return;
      }

      setIsLoadingProductLocations(
        true
      );

      setSourceLocationId(
        ""
      );

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "search_stock",
          {
            p_query:
              product.sku,

            p_limit: 100,
          }
        );

      if (error) {
        setErrorMessage(
          error.message
        );

        setProductStockLocations(
          []
        );

        setIsLoadingProductLocations(
          false
        );

        return;
      }

      const rows = (
        (data as ProductStockLocation[]) ??
        []
      ).filter(
        (item) =>
          item.product_id ===
          productId &&
          Number(
            item.quantity
          ) > 0
      );

      setProductStockLocations(
        rows
      );

      setIsLoadingProductLocations(
        false
      );
    }

    loadProductLocations();
  }, [
    productId,
    products,
  ]);

  /*
   * AUTO SOURCE SELECTION
   *
   * 0 sources:
   * show warning.
   *
   * 1 source:
   * select automatically.
   *
   * >1 sources:
   * user chooses.
   */
  useEffect(() => {
    if (
      !productId ||
      !needsSource ||
      isLoadingProductLocations
    ) {
      return;
    }

    if (
      filteredSourceLocations.length ===
      0
    ) {
      setSourceLocationId(
        ""
      );

      if (
        operationType ===
        "release"
      ) {
        setInfoMessage(
          "No shelf with reserved stock was found for this product."
        );
      } else {
        setInfoMessage(
          "No shelf with available stock was found for this product."
        );
      }

      return;
    }

    if (
      filteredSourceLocations.length ===
      1
    ) {
      const onlySource =
        filteredSourceLocations[0];

      setSourceLocationId(
        onlySource.location_id
      );

      setInfoMessage(
        `Source shelf automatically selected: ${onlySource.warehouse_code} / ${onlySource.location_code}`
      );

      return;
    }

    if (
      !sourceLocationId
    ) {
      setInfoMessage(
        `This product exists in ${filteredSourceLocations.length} eligible shelf locations. Select or scan the source shelf.`
      );
    }
  }, [
    productId,
    needsSource,
    operationType,
    filteredSourceLocations,
    isLoadingProductLocations,
    sourceLocationId,
  ]);

  /*
   * External scanner input.
   */
  useEffect(() => {
    if (
      !scannedValue ||
      !scanNonce
    ) {
      return;
    }

    applyScannedValue(
      scannedValue
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanNonce]);

  function resetMessages() {
    setInfoMessage(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function resetOperation() {
    setProductId("");

    setSourceLocationId(
      ""
    );

    setTargetLocationId(
      ""
    );

    setProductStockLocations(
      []
    );

    setQuantity("1");
    setReferenceNo("");
    setNotes("");

    resetMessages();
  }

  function findProductFromValue(
    value: string
  ) {
    const normalized =
      value
        .trim()
        .toLowerCase();

    return products.find(
      (product) =>
        product.sku.toLowerCase() ===
        normalized ||
        product.barcode
          ?.toLowerCase() ===
        normalized ||
        product.qr_value
          ?.toLowerCase() ===
        normalized
    );
  }

  function findLocationFromValue(
    value: string,
    parsed: ParsedScanValue
  ): {
    location:
    | LocationOption
    | null;

    error: string | null;
  } {
    const raw =
      value
        .trim()
        .toLowerCase();

    /*
     * Exact qr_payload.
     */
    const byPayload =
      locations.find(
        (location) =>
          location.qr_payload
            ?.toLowerCase() ===
          raw
      );

    if (byPayload) {
      return {
        location:
          byPayload,
        error: null,
      };
    }

    /*
     * Exact qr_code.
     */
    const byQrCode =
      locations.find(
        (location) =>
          location.qr_code
            ?.toLowerCase() ===
          raw
      );

    if (byQrCode) {
      return {
        location:
          byQrCode,
        error: null,
      };
    }

    /*
     * Full canonical hierarchy.
     */
    if (
      parsed.type ===
      "location" &&
      parsed.warehouseCode &&
      parsed.zoneCode &&
      parsed.locationCode
    ) {
      const matches =
        locations.filter(
          (location) =>
            location.warehouse_code.toLowerCase() ===
            parsed.warehouseCode!.toLowerCase() &&
            location.zone_code?.toLowerCase() ===
            parsed.zoneCode!.toLowerCase() &&
            location.location_code.toLowerCase() ===
            parsed.locationCode!.toLowerCase()
        );

      if (
        matches.length ===
        1
      ) {
        return {
          location:
            matches[0],
          error: null,
        };
      }

      if (
        matches.length >
        1
      ) {
        return {
          location: null,

          error:
            "Multiple shelf locations matched this QR hierarchy.",
        };
      }
    }

    /*
     * Warehouse + location
     * legacy support.
     */
    if (
      parsed.type ===
      "location" &&
      parsed.warehouseCode &&
      !parsed.zoneCode &&
      parsed.locationCode
    ) {
      const matches =
        locations.filter(
          (location) =>
            location.warehouse_code.toLowerCase() ===
            parsed.warehouseCode!.toLowerCase() &&
            location.location_code.toLowerCase() ===
            parsed.locationCode!.toLowerCase()
        );

      if (
        matches.length ===
        1
      ) {
        return {
          location:
            matches[0],
          error: null,
        };
      }

      if (
        matches.length >
        1
      ) {
        return {
          location: null,

          error:
            "This location code exists more than once inside the warehouse. Scan the full shelf QR.",
        };
      }
    }

    /*
     * Plain location code.
     */
    if (
      parsed.type ===
      "location" &&
      parsed.locationCode
    ) {
      const matches =
        locations.filter(
          (location) =>
            location.location_code.toLowerCase() ===
            parsed.locationCode!.toLowerCase()
        );

      if (
        matches.length ===
        1
      ) {
        return {
          location:
            matches[0],
          error: null,
        };
      }

      if (
        matches.length >
        1
      ) {
        return {
          location: null,

          error:
            "This shelf code exists in more than one location. Scan the full shelf QR.",
        };
      }
    }

    return {
      location: null,
      error: null,
    };
  }

  function selectScannedLocation(
    location: LocationOption
  ) {
    resetMessages();

    /*
     * STOCK IN:
     * scanned shelf = target.
     */
    if (
      operationType ===
      "stock_in"
    ) {
      if (!productId) {
        setErrorMessage(
          "Scan or select the product first."
        );

        return;
      }

      setTargetLocationId(
        location.location_id
      );

      setInfoMessage(
        `Target shelf selected: ${location.warehouse_code} / ${location.zone_code
          ? `${location.zone_code} / `
          : ""
        }${location.location_code}`
      );

      return;
    }

    /*
     * Other operations require
     * a selected product.
     */
    if (!productId) {
      setErrorMessage(
        "Scan or select the product before selecting a source shelf."
      );

      return;
    }

    /*
     * TRANSFER:
     *
     * If source is not selected,
     * scanned location tries to
     * become source.
     *
     * If source already exists,
     * scanned location becomes target.
     */
    if (
      operationType ===
      "transfer"
    ) {
      if (
        !sourceLocationId
      ) {
        if (
          isLoadingProductLocations
        ) {
          setErrorMessage(
            "Product stock locations are still loading."
          );

          return;
        }

        const validSource =
          filteredSourceLocations.find(
            (item) =>
              item.location_id ===
              location.location_id
          );

        if (!validSource) {
          setErrorMessage(
            "The scanned shelf does not contain available stock for this product."
          );

          return;
        }

        setSourceLocationId(
          location.location_id
        );

        setInfoMessage(
          `Source shelf selected: ${location.warehouse_code} / ${location.location_code}. Scan the target shelf next.`
        );

        return;
      }

      if (
        sourceLocationId ===
        location.location_id
      ) {
        setErrorMessage(
          "Source and target shelf cannot be the same."
        );

        return;
      }

      setTargetLocationId(
        location.location_id
      );

      setInfoMessage(
        `Target shelf selected: ${location.warehouse_code} / ${location.location_code}`
      );

      return;
    }

    /*
     * STOCK OUT / RESERVE /
     * RELEASE:
     * scanned location = source.
     */
    if (
      isLoadingProductLocations
    ) {
      setErrorMessage(
        "Product stock locations are still loading."
      );

      return;
    }

    const validSource =
      filteredSourceLocations.find(
        (item) =>
          item.location_id ===
          location.location_id
      );

    if (!validSource) {
      if (
        operationType ===
        "release"
      ) {
        setErrorMessage(
          "This shelf does not contain reserved stock for the selected product."
        );
      } else {
        setErrorMessage(
          "This shelf does not contain available stock for the selected product."
        );
      }

      return;
    }

    setSourceLocationId(
      location.location_id
    );

    setInfoMessage(
      `Source shelf selected: ${location.warehouse_code} / ${location.location_code}`
    );
  }

  function applyScannedValue(
    value: string
  ) {
    const raw =
      value.trim();

    if (!raw) {
      return;
    }

    resetMessages();

    const parsed =
      parseScanValue(raw);

    if (
      parsed.type ===
      "warehouse" ||
      parsed.type === "zone"
    ) {
      setErrorMessage(
        "Scan a product or shelf location for this stock operation."
      );

      return;
    }

    /*
     * LOCATION
     */
    if (
      parsed.type ===
      "location"
    ) {
      const {
        location,
        error,
      } =
        findLocationFromValue(
          raw,
          parsed
        );

      if (error) {
        setErrorMessage(
          error
        );

        return;
      }

      if (!location) {
        setErrorMessage(
          "No active shelf location found for this QR."
        );

        return;
      }

      selectScannedLocation(
        location
      );

      return;
    }

    /*
     * PRODUCT
     */
    if (
      parsed.type ===
      "product"
    ) {
      const product =
        findProductFromValue(
          parsed.productQuery ||
          raw
        );

      if (!product) {
        setErrorMessage(
          "No active product found for this SKU, barcode, or product QR."
        );

        return;
      }

      setProductId(
        product.id
      );

      setSourceLocationId(
        ""
      );

      setTargetLocationId(
        ""
      );

      setInfoMessage(
        `Product selected: ${product.sku} — ${product.name}`
      );

      return;
    }

    setErrorMessage(
      "Unsupported scan value."
    );
  }

  function validate() {
    if (!productId) {
      return "Product is required.";
    }

    const numericQuantity =
      Number(quantity);

    if (
      Number.isNaN(
        numericQuantity
      ) ||
      numericQuantity <= 0
    ) {
      return "Quantity must be greater than zero.";
    }

    if (
      needsSource &&
      !sourceLocationId
    ) {
      return "Source shelf is required.";
    }

    if (
      needsTarget &&
      !targetLocationId
    ) {
      return "Target shelf is required.";
    }

    if (
      operationType ===
      "transfer" &&
      sourceLocationId ===
      targetLocationId
    ) {
      return "Source and target shelf cannot be the same.";
    }

    if (
      sourceLocation &&
      (
        operationType ===
        "stock_out" ||
        operationType ===
        "transfer" ||
        operationType ===
        "reserve"
      ) &&
      Number(
        sourceLocation.available_quantity
      ) < numericQuantity
    ) {
      return `Insufficient available stock. Available: ${formatNumber(
        sourceLocation.available_quantity
      )}`;
    }

    if (
      sourceLocation &&
      operationType ===
      "release" &&
      Number(
        sourceLocation.reserved_quantity
      ) < numericQuantity
    ) {
      return `Reserved quantity is not enough. Reserved: ${formatNumber(
        sourceLocation.reserved_quantity
      )}`;
    }

    return null;
  }

  function getConfirmationMessage() {
    const productLabel =
      selectedProduct
        ? `${selectedProduct.sku} — ${selectedProduct.name}`
        : "selected product";

    const sourceLabel =
      sourceLocation
        ? `${sourceLocation.warehouse_code} / ${sourceLocation.location_code}`
        : "";

    const targetLabel =
      targetLocation
        ? `${targetLocation.warehouse_code} / ${targetLocation.location_code}`
        : "";

    if (
      operationType ===
      "stock_in"
    ) {
      return `Add ${quantity} unit(s) of ${productLabel} to ${targetLabel}?`;
    }

    if (
      operationType ===
      "stock_out"
    ) {
      return `Remove ${quantity} unit(s) of ${productLabel} from ${sourceLabel}?`;
    }

    if (
      operationType ===
      "transfer"
    ) {
      return `Transfer ${quantity} unit(s) of ${productLabel} from ${sourceLabel} to ${targetLabel}?`;
    }

    if (
      operationType ===
      "reserve"
    ) {
      return `Reserve ${quantity} unit(s) of ${productLabel} from ${sourceLabel}?`;
    }

    return `Release ${quantity} reserved unit(s) of ${productLabel} from ${sourceLabel}?`;
  }

  async function refreshProductStock() {
    if (!productId) {
      return;
    }

    const product =
      products.find(
        (item) =>
          item.id ===
          productId
      );

    if (!product) {
      return;
    }

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "search_stock",
        {
          p_query:
            product.sku,

          p_limit: 100,
        }
      );

    if (error) {
      setErrorMessage(
        error.message
      );

      return;
    }

    const rows = (
      (data as ProductStockLocation[]) ??
      []
    ).filter(
      (item) =>
        item.product_id ===
        productId &&
        Number(
          item.quantity
        ) > 0
    );

    setProductStockLocations(
      rows
    );
  }

  async function runOperation() {
    resetMessages();

    const validationError =
      validate();

    if (validationError) {
      setErrorMessage(
        validationError
      );

      return;
    }

    const confirmed =
      window.confirm(
        getConfirmationMessage()
      );

    if (!confirmed) {
      return;
    }

    const numericQuantity =
      Number(quantity);

    setIsSubmitting(true);

    try {
      let result:
        | {
          data: unknown;

          error: {
            message: string;
          } | null;
        }
        | undefined;

      if (
        operationType ===
        "stock_in" &&
        targetLocation
      ) {
        result =
          await supabase.rpc(
            "stock_in",
            {
              p_product_id:
                productId,

              p_warehouse_id:
                targetLocation.warehouse_id,

              p_location_id:
                targetLocation.location_id,

              p_quantity:
                numericQuantity,

              p_reference_no:
                referenceNo.trim() ||
                null,

              p_reason:
                "Guided stock in",

              p_notes:
                notes.trim() ||
                null,
            }
          );
      }

      if (
        (
          operationType ===
          "stock_out" ||
          operationType ===
          "reserve" ||
          operationType ===
          "release"
        ) &&
        sourceLocation
      ) {
        const rpcName =
          operationType ===
            "stock_out"
            ? "stock_out"
            : operationType ===
              "reserve"
              ? "reserve_stock"
              : "release_stock";

        result =
          await supabase.rpc(
            rpcName,
            {
              p_product_id:
                productId,

              p_warehouse_id:
                sourceLocation.warehouse_id,

              p_location_id:
                sourceLocation.location_id,

              p_quantity:
                numericQuantity,

              p_reference_no:
                referenceNo.trim() ||
                null,

              p_reason:
                `Guided ${operationType}`,

              p_notes:
                notes.trim() ||
                null,
            }
          );
      }

      if (
        operationType ===
        "transfer" &&
        sourceLocation &&
        targetLocation
      ) {
        result =
          await supabase.rpc(
            "stock_transfer",
            {
              p_product_id:
                productId,

              p_from_warehouse_id:
                sourceLocation.warehouse_id,

              p_from_location_id:
                sourceLocation.location_id,

              p_to_warehouse_id:
                targetLocation.warehouse_id,

              p_to_location_id:
                targetLocation.location_id,

              p_quantity:
                numericQuantity,

              p_reference_no:
                referenceNo.trim() ||
                null,

              p_reason:
                "Guided transfer",

              p_notes:
                notes.trim() ||
                null,
            }
          );
      }

      if (!result) {
        setErrorMessage(
          "Operation could not be prepared."
        );

        return;
      }

      if (result.error) {
        setErrorMessage(
          result.error.message
        );

        return;
      }

      setSuccessMessage(
        `${meta.title} completed successfully.`
      );

      setQuantity("1");

      setReferenceNo("");

      setNotes("");

      await refreshProductStock();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* HEADER */}
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {meta.title}
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {meta.description}
        </p>
      </div>

      <div className="space-y-5 p-5">
        {/* PROGRESS */}
        <div className="grid grid-cols-3 gap-2">
          <div
            className={`rounded-xl border p-3 ${productReady
              ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
              : "border-gray-200 dark:border-gray-800"
              }`}
          >
            <p className="text-[10px] font-medium uppercase text-gray-500">
              Product
            </p>

            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {productReady
                ? "Ready ✓"
                : "Waiting"}
            </p>
          </div>

          <div
            className={`rounded-xl border p-3 ${sourceReady
              ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
              : "border-gray-200 dark:border-gray-800"
              }`}
          >
            <p className="text-[10px] font-medium uppercase text-gray-500">
              Source
            </p>

            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {!needsSource
                ? "—"
                : sourceReady
                  ? "Ready ✓"
                  : "Waiting"}
            </p>
          </div>

          <div
            className={`rounded-xl border p-3 ${targetReady
              ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
              : "border-gray-200 dark:border-gray-800"
              }`}
          >
            <p className="text-[10px] font-medium uppercase text-gray-500">
              Target
            </p>

            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {!needsTarget
                ? "—"
                : targetReady
                  ? "Ready ✓"
                  : "Waiting"}
            </p>
          </div>
        </div>

        {/* MESSAGES */}
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

        {/* PRODUCT */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Product
          </label>

          <select
            value={productId}
            disabled={
              isLoadingOptions
            }
            onChange={(
              event
            ) => {
              setProductId(
                event.target.value
              );

              setSourceLocationId(
                ""
              );

              setTargetLocationId(
                ""
              );

              resetMessages();
            }}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">
              Scan or select product
            </option>

            {products.map(
              (product) => (
                <option
                  key={
                    product.id
                  }
                  value={
                    product.id
                  }
                >
                  {
                    product.sku
                  }{" "}
                  —{" "}
                  {
                    product.name
                  }
                </option>
              )
            )}
          </select>
        </div>

        {/* SOURCE */}
        {needsSource &&
          productId && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                  Source Shelf
                </label>

                {filteredSourceLocations.length >
                  1 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {
                        filteredSourceLocations.length
                      }{" "}
                      locations found
                    </span>
                  )}
              </div>

              {isLoadingProductLocations ? (
                <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  Loading product
                  locations...
                </div>
              ) : filteredSourceLocations.length ===
                0 ? (
                <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
                  No eligible source
                  shelf found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSourceLocations.map(
                    (
                      stock
                    ) => {
                      const location =
                        locations.find(
                          (
                            item
                          ) =>
                            item.location_id ===
                            stock.location_id
                        );

                      const isSelected =
                        sourceLocationId ===
                        stock.location_id;

                      return (
                        <button
                          key={
                            stock.inventory_id
                          }
                          type="button"
                          onClick={() => {
                            setSourceLocationId(
                              stock.location_id
                            );

                            resetMessages();
                          }}
                          className={`w-full rounded-xl border p-4 text-left transition ${isSelected
                            ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                            : "border-gray-200 hover:border-brand-300 dark:border-gray-800"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                                {
                                  stock.warehouse_code
                                }{" "}
                                /{" "}
                                {location?.zone_code
                                  ? `${location.zone_code} / `
                                  : ""}
                                {
                                  stock.location_code
                                }
                              </p>

                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {location
                                  ? `${location.warehouse_name} · ${formatWarehouseType(
                                    location.warehouse_type
                                  )}`
                                  : stock.warehouse_name}
                              </p>

                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {
                                  stock.location_name
                                }
                              </p>
                            </div>

                            <div className="text-right">
                              {isSelected && (
                                <p className="mb-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                                  Selected ✓
                                </p>
                              )}

                              <p className="text-xs text-gray-500">
                                Available
                              </p>

                              <p className="text-base font-semibold text-gray-800 dark:text-white">
                                {formatNumber(
                                  stock.available_quantity
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                            <span>
                              On Hand:{" "}
                              {formatNumber(
                                stock.quantity
                              )}
                            </span>

                            <span>
                              Reserved:{" "}
                              {formatNumber(
                                stock.reserved_quantity
                              )}
                            </span>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}

        {/* TARGET */}
        {needsTarget && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Target Shelf
            </label>

            <select
              value={
                targetLocationId
              }
              disabled={
                isLoadingOptions ||
                !productId
              }
              onChange={(
                event
              ) => {
                setTargetLocationId(
                  event.target.value
                );

                resetMessages();
              }}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">
                Scan or select target
                shelf
              </option>

              {locations.map(
                (
                  location
                ) => (
                  <option
                    key={
                      location.location_id
                    }
                    value={
                      location.location_id
                    }
                  >
                    {
                      location.warehouse_code
                    }{" "}
                    /{" "}
                    {location.zone_code
                      ? `${location.zone_code} / `
                      : ""}
                    {
                      location.location_code
                    }{" "}
                    —{" "}
                    {
                      location.location_name
                    }
                  </option>
                )
              )}
            </select>
          </div>
        )}

        {/* SUMMARY */}
        {selectedProduct && (
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
            <p className="text-xs font-medium uppercase text-gray-500">
              Operation Summary
            </p>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">
                  Product
                </span>

                <span className="text-right font-medium text-gray-800 dark:text-white/90">
                  {
                    selectedProduct.sku
                  }{" "}
                  —{" "}
                  {
                    selectedProduct.name
                  }
                </span>
              </div>

              {needsSource && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">
                    From
                  </span>

                  <span className="text-right font-medium text-gray-800 dark:text-white/90">
                    {sourceLocation
                      ? `${sourceLocation.warehouse_code} / ${sourceLocationMeta?.zone_code
                        ? `${sourceLocationMeta.zone_code} / `
                        : ""
                      }${sourceLocation.location_code}`
                      : "Waiting"}
                  </span>
                </div>
              )}

              {needsTarget && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">
                    To
                  </span>

                  <span className="text-right font-medium text-gray-800 dark:text-white/90">
                    {targetLocation
                      ? `${targetLocation.warehouse_code} / ${targetLocation.zone_code
                        ? `${targetLocation.zone_code} / `
                        : ""
                      }${targetLocation.location_code}`
                      : "Waiting"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* QUANTITY */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Quantity
            </label>

            <input
              value={quantity}
              onChange={(
                event
              ) =>
                setQuantity(
                  event.target.value
                )
              }
              type="number"
              min="0.01"
              step="0.01"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Reference No
            </label>

            <input
              value={
                referenceNo
              }
              onChange={(
                event
              ) =>
                setReferenceNo(
                  event.target.value
                )
              }
              type="text"
              placeholder="Optional"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>

        {/* NOTES */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Notes
          </label>

          <textarea
            value={notes}
            onChange={(
              event
            ) =>
              setNotes(
                event.target.value
              )
            }
            rows={2}
            placeholder="Optional"
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={
              runOperation
            }
            disabled={
              isSubmitting ||
              !workflowReady
            }
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? "Processing..."
              : meta.buttonLabel}
          </button>

          <button
            type="button"
            onClick={
              resetOperation
            }
            disabled={
              isSubmitting
            }
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}