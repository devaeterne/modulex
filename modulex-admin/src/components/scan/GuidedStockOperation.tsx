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
  qr_value: string | null;
};

type WarehouseRelation = {
  id: string;
  code: string;
  name: string;
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
      description:
        "Scan or select a product, then scan or select the target shelf.",
    },
    {
      value: "stock_out",
      label: "Stock Out",
      description:
        "Scan or select a product, then scan a shelf where available stock exists.",
    },
    {
      value: "transfer",
      label: "Transfer",
      description:
        "Scan product, source shelf, and target shelf in sequence.",
    },
    {
      value: "reserve",
      label: "Reserve Stock",
      description:
        "Reserve available stock from the selected shelf.",
    },
    {
      value: "release",
      label: "Release Reservation",
      description:
        "Release previously reserved stock from the selected shelf.",
    },
  ];

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
  scannedValue,
  scanNonce,
}: GuidedStockOperationProps) {
  const [
    operationType,
    setOperationType,
  ] =
    useState<OperationType>(
      "transfer"
    );

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

  const selectedOperation =
    useMemo(
      () =>
        operationOptions.find(
          (item) =>
            item.value ===
            operationType
        ),
      [operationType]
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

      if (
        operationType ===
        "stock_out" ||
        operationType ===
        "transfer" ||
        operationType ===
        "reserve"
      ) {
        return productStockLocations.filter(
          (item) =>
            Number(
              item.available_quantity
            ) > 0
        );
      }

      return [];
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

  /*
   * --------------------------------------------------
   * LOAD PRODUCTS + ACTIVE LOCATIONS
   * --------------------------------------------------
   *
   * Locations are loaded directly from the locations
   * table so qr_payload is always available.
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
                name
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
   * --------------------------------------------------
   * LOAD STOCK LOCATIONS FOR SELECTED PRODUCT
   * --------------------------------------------------
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

        setSourceLocationId(
          ""
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

      if (
        sourceLocationId &&
        !rows.some(
          (item) =>
            item.location_id ===
            sourceLocationId
        )
      ) {
        setSourceLocationId(
          ""
        );
      }

      setIsLoadingProductLocations(
        false
      );
    }

    loadProductLocations();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    productId,
    products,
  ]);

  /*
   * --------------------------------------------------
   * APPLY EXTERNAL SCAN
   * --------------------------------------------------
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

    setQuantity("1");

    setReferenceNo("");

    setNotes("");

    resetMessages();
  }

  /*
   * --------------------------------------------------
   * PRODUCT RESOLVER
   * --------------------------------------------------
   */
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

  /*
   * --------------------------------------------------
   * LOCATION RESOLVER
   * --------------------------------------------------
   */
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
     * 1. Exact qr_payload
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
     * 2. Exact human-readable qr_code
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
     * 3. Full hierarchy:
     *
     * LOC|MAIN|B|B-01-01
     * MAIN / B / B-01-01
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
        matches.length === 1
      ) {
        return {
          location:
            matches[0],
          error: null,
        };
      }

      if (
        matches.length > 1
      ) {
        return {
          location: null,
          error:
            "Multiple shelf locations matched this QR hierarchy.",
        };
      }
    }

    /*
     * 4. Warehouse + Location
     *
     * Legacy:
     * MAIN / B-01-01
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
        matches.length === 1
      ) {
        return {
          location:
            matches[0],
          error: null,
        };
      }

      if (
        matches.length > 1
      ) {
        return {
          location: null,
          error:
            "This location code exists more than once inside the warehouse. Scan the full location QR code.",
        };
      }
    }

    /*
     * 5. Plain location code
     *
     * Only use when globally unique.
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
        matches.length === 1
      ) {
        return {
          location:
            matches[0],
          error: null,
        };
      }

      if (
        matches.length > 1
      ) {
        return {
          location: null,
          error:
            "This location code exists in more than one place. Scan the full location QR code.",
        };
      }
    }

    return {
      location: null,
      error: null,
    };
  }

  /*
   * --------------------------------------------------
   * SELECT LOCATION FOR WORKFLOW
   * --------------------------------------------------
   */
  function selectScannedLocation(
    location: LocationOption
  ) {
    resetMessages();

    /*
     * STOCK IN
     *
     * Any active shelf can be
     * selected as target.
     */
    if (
      operationType ===
      "stock_in"
    ) {
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
     * Other workflows need
     * the product first.
     */
    if (!productId) {
      setErrorMessage(
        "Scan or select the product before scanning the source shelf."
      );

      return;
    }

    /*
     * TRANSFER
     *
     * First location scan:
     * source.
     *
     * Second location scan:
     * target.
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
            "Product stock locations are still loading. Scan the source shelf again."
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
            "This shelf does not contain available stock for the selected product."
          );

          return;
        }

        setSourceLocationId(
          location.location_id
        );

        setInfoMessage(
          `Source shelf selected: ${location.warehouse_code} / ${location.zone_code
            ? `${location.zone_code} / `
            : ""
          }${location.location_code}. Scan the target shelf next.`
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
        `Target shelf selected: ${location.warehouse_code} / ${location.zone_code
          ? `${location.zone_code} / `
          : ""
        }${location.location_code}`
      );

      return;
    }

    /*
     * STOCK OUT / RESERVE / RELEASE
     */
    if (
      isLoadingProductLocations
    ) {
      setErrorMessage(
        "Product stock locations are still loading. Scan the shelf again."
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
          "This shelf does not contain enough available stock for this workflow."
        );
      }

      return;
    }

    setSourceLocationId(
      location.location_id
    );

    setInfoMessage(
      `Source shelf selected: ${location.warehouse_code} / ${location.zone_code
        ? `${location.zone_code} / `
        : ""
      }${location.location_code}`
    );
  }

  /*
   * --------------------------------------------------
   * APPLY SCANNED VALUE
   * --------------------------------------------------
   */
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

    /*
     * Warehouse / Zone QR codes
     * are informational and cannot
     * directly participate in a stock
     * operation.
     */
    if (
      parsed.type ===
      "warehouse"
    ) {
      setErrorMessage(
        "Warehouse QR codes cannot be used as a stock source or target. Scan a product or shelf location."
      );

      return;
    }

    if (
      parsed.type ===
      "zone"
    ) {
      setErrorMessage(
        "Zone QR codes cannot be used as a stock source or target. Scan a shelf location inside the zone."
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
          "No active shelf location found for this QR value."
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

  /*
   * --------------------------------------------------
   * VALIDATION
   * --------------------------------------------------
   */
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
        ? `${sourceLocation.warehouse_code} / ${sourceLocation.zone_code
          ? `${sourceLocation.zone_code} / `
          : ""
        }${sourceLocation.location_code}`
        : "";

    const targetLabel =
      targetLocation
        ? `${targetLocation.warehouse_code} / ${targetLocation.zone_code
          ? `${targetLocation.zone_code} / `
          : ""
        }${targetLocation.location_code}`
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

  /*
   * --------------------------------------------------
   * REFRESH PRODUCT STOCK
   * --------------------------------------------------
   */
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

  /*
   * --------------------------------------------------
   * RUN STOCK OPERATION
   * --------------------------------------------------
   */
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

      /*
       * STOCK IN
       */
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

      /*
       * STOCK OUT / RESERVE / RELEASE
       */
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

      /*
       * TRANSFER
       */
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
        "Operation completed successfully."
      );

      setQuantity("1");

      setReferenceNo("");

      setNotes("");

      await refreshProductStock();
    } finally {
      setIsSubmitting(false);
    }
  }

  const productReady =
    Boolean(
      selectedProduct
    );

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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* HEADER */}
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Guided Stock Workflow
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Scan product and shelf
          QR codes in sequence
          before confirming the
          stock operation.
        </p>
      </div>

      <div className="space-y-5 p-5">
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

        {/* WORKFLOW */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Workflow
          </label>

          <select
            value={
              operationType
            }
            onChange={(
              event
            ) => {
              setOperationType(
                event.target
                  .value as OperationType
              );

              resetOperation();
            }}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            {operationOptions.map(
              (operation) => (
                <option
                  key={
                    operation.value
                  }
                  value={
                    operation.value
                  }
                >
                  {
                    operation.label
                  }
                </option>
              )
            )}
          </select>

          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {
              selectedOperation?.description
            }
          </p>
        </div>

        {/* SCAN PROGRESS */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div
            className={`rounded-xl border p-3 ${productReady
              ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
              : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"
              }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Product
            </p>

            <p
              className={`mt-1 text-sm font-semibold ${productReady
                ? "text-success-700 dark:text-success-400"
                : "text-gray-600 dark:text-gray-400"
                }`}
            >
              {productReady
                ? "Selected ✓"
                : "Waiting"}
            </p>
          </div>

          <div
            className={`rounded-xl border p-3 ${sourceReady
              ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
              : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"
              }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Source Shelf
            </p>

            <p
              className={`mt-1 text-sm font-semibold ${sourceReady
                ? "text-success-700 dark:text-success-400"
                : "text-gray-600 dark:text-gray-400"
                }`}
            >
              {!needsSource
                ? "Not Required"
                : sourceReady
                  ? "Selected ✓"
                  : "Waiting"}
            </p>
          </div>

          <div
            className={`rounded-xl border p-3 ${targetReady
              ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
              : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"
              }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Target Shelf
            </p>

            <p
              className={`mt-1 text-sm font-semibold ${targetReady
                ? "text-success-700 dark:text-success-400"
                : "text-gray-600 dark:text-gray-400"
                }`}
            >
              {!needsTarget
                ? "Not Required"
                : targetReady
                  ? "Selected ✓"
                  : "Waiting"}
            </p>
          </div>
        </div>

        {/* PRODUCT */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Product
          </label>

          <select
            value={productId}
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
            disabled={
              isLoadingOptions
            }
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">
              Scan or select
              product
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

        {/* SELECTED PRODUCT */}
        {selectedProduct && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                Selected Product
              </p>

              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {
                  selectedProduct.sku
                }{" "}
                —{" "}
                {
                  selectedProduct.name
                }
              </p>

              {selectedProduct.barcode && (
                <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  Barcode:{" "}
                  {
                    selectedProduct.barcode
                  }
                </p>
              )}
            </div>
          </div>
        )}

        {/* SOURCE */}
        {needsSource && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Source Shelf
            </label>

            <select
              value={
                sourceLocationId
              }
              onChange={(
                event
              ) => {
                setSourceLocationId(
                  event.target
                    .value
                );

                resetMessages();
              }}
              disabled={
                !productId ||
                isLoadingProductLocations
              }
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">
                {!productId
                  ? "Select product first"
                  : isLoadingProductLocations
                    ? "Loading stock locations..."
                    : "Scan or select source shelf"}
              </option>

              {filteredSourceLocations.map(
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
                    | Available:{" "}
                    {formatNumber(
                      location.available_quantity
                    )}{" "}
                    | Reserved:{" "}
                    {formatNumber(
                      location.reserved_quantity
                    )}
                  </option>
                )
              )}
            </select>

            {productId &&
              !isLoadingProductLocations &&
              filteredSourceLocations.length ===
              0 && (
                <p className="mt-1 text-xs text-warning-600 dark:text-warning-400">
                  No valid source
                  shelf is currently
                  available for this
                  product and
                  workflow.
                </p>
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
              onChange={(
                event
              ) => {
                setTargetLocationId(
                  event.target
                    .value
                );

                resetMessages();
              }}
              disabled={
                isLoadingOptions
              }
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">
                Scan or select
                target shelf
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

        {/* QUANTITY + REFERENCE */}
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
                  event.target
                    .value
                )
              }
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
              value={
                referenceNo
              }
              onChange={(
                event
              ) =>
                setReferenceNo(
                  event.target
                    .value
                )
              }
              type="text"
              placeholder="SCAN-OP-0001"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
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
            rows={3}
            placeholder="Optional operation notes..."
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        {/* BUTTONS */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={
              runOperation
            }
            disabled={
              isSubmitting
            }
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Processing..."
              : "Confirm Operation"}
          </button>

          <button
            type="button"
            onClick={
              resetOperation
            }
            disabled={
              isSubmitting
            }
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}