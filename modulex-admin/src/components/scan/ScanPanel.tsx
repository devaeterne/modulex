"use client";

import React, {
  useCallback,
  useState,
} from "react";

import { supabase } from "@/lib/supabase/client";

import CameraScanner from "@/components/scan/CameraScanner";

import GuidedStockOperation, {
  type StockOperationType,
} from "@/components/scan/GuidedStockOperation";

import {
  parseScanValue,
  type ParsedScanValue,
} from "@/lib/scan/parseScanValue";

type PageOperation =
  | "check"
  | StockOperationType;

type Relation<T> =
  | T
  | T[]
  | null;

type WarehouseRelation = {
  id: string;
  code: string;
  name: string;
  warehouse_type?: string;
};

type ZoneRelation = {
  id: string;
  code: string;
  name: string;
};

type WarehouseCheck = {
  id: string;
  code: string;
  name: string;

  warehouse_type: string;

  description: string | null;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;

  zone_count: number;
  location_count: number;

  total_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
};

type ZoneCheck = {
  id: string;

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;

  code: string;
  name: string;

  description: string | null;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;

  location_count: number;

  total_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
};

type LocationCheck = {
  id: string;

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;

  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;

  code: string;
  name: string;

  location_type: string;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;
};

type ProductCheck = {
  id: string;

  sku: string;
  barcode: string | null;

  name: string;

  brand: string | null;
  category: string | null;

  unit: string;

  status: string;

  qr_value: string | null;
};

type LocationInventoryRow = {
  inventory_id: string;

  product_id: string;

  sku: string;
  barcode: string | null;

  product_name: string;

  quantity: number;
  reserved_quantity: number;
  available_quantity: number;

  stock_status: string;
};

type ProductStockRow = {
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

  quantity: number;
  reserved_quantity: number;
  available_quantity: number;

  stock_status: string;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;

  warehouse_type: string;

  description: string | null;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;
};

type ZoneRow = {
  id: string;

  warehouse_id: string;

  code: string;
  name: string;

  description: string | null;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;

  warehouses:
  Relation<WarehouseRelation>;
};

type LocationRow = {
  id: string;

  warehouse_id: string;
  zone_id: string | null;

  code: string;
  name: string;

  location_type: string;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;

  warehouses:
  Relation<WarehouseRelation>;

  zones:
  Relation<ZoneRelation>;
};

type RpcProductRow = {
  product_id: string;

  sku: string;
  barcode: string | null;

  product_name: string;

  brand: string | null;
  category: string | null;

  unit: string;

  product_status: string;
};

type ProductFallbackRow = {
  id: string;

  sku: string;
  barcode: string | null;

  name: string;

  brand: string | null;
  category: string | null;

  unit: string;

  status: string;

  qr_value: string | null;
};

type CheckResult =
  | {
    type: "warehouse";
    data: WarehouseCheck;
  }
  | {
    type: "zone";
    data: ZoneCheck;
  }
  | {
    type: "location";
    data: LocationCheck;
  }
  | {
    type: "product";
    data: ProductCheck;
  };

const operationOptions: {
  value: PageOperation;
  label: string;
  description: string;
}[] = [
    {
      value: "check",
      label: "Check Stock",
      description:
        "Scan anything to view current information.",
    },
    {
      value: "stock_in",
      label: "Stock In",
      description:
        "Add product stock to a shelf.",
    },
    {
      value: "stock_out",
      label: "Stock Out",
      description:
        "Remove stock from an existing shelf.",
    },
    {
      value: "transfer",
      label: "Transfer",
      description:
        "Move stock between shelf locations.",
    },
    {
      value: "reserve",
      label: "Reserve",
      description:
        "Reserve available stock.",
    },
    {
      value: "release",
      label: "Release",
      description:
        "Release reserved stock.",
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

function formatText(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function activeBadge(
  active: boolean
) {
  return active
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
    : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function ScanPanel() {
  const [
    operation,
    setOperation,
  ] =
    useState<PageOperation>(
      "check"
    );

  const [
    showCamera,
    setShowCamera,
  ] = useState(false);

  const [
    manualValue,
    setManualValue,
  ] = useState("");

  const [
    workflowScan,
    setWorkflowScan,
  ] = useState<{
    value: string;
    nonce: number;
  }>({
    value: "",
    nonce: 0,
  });

  const [
    checkResult,
    setCheckResult,
  ] =
    useState<CheckResult | null>(
      null
    );

  const [
    locationInventory,
    setLocationInventory,
  ] = useState<
    LocationInventoryRow[]
  >([]);

  const [
    productStock,
    setProductStock,
  ] = useState<
    ProductStockRow[]
  >([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null
    );

  function resetCheckResult() {
    setCheckResult(null);

    setLocationInventory(
      []
    );

    setProductStock([]);

    setErrorMessage(null);
  }

  function handleOperationChange(
    nextOperation: PageOperation
  ) {
    setOperation(
      nextOperation
    );

    setShowCamera(false);

    setManualValue("");

    resetCheckResult();

    setWorkflowScan({
      value: "",
      nonce: 0,
    });
  }

  function sendToWorkflow(
    value: string
  ) {
    setWorkflowScan({
      value,
      nonce: Date.now(),
    });
  }

  /*
   * Guided workflow tells us
   * Product / Source / Target
   * requirements are complete.
   *
   * Camera disappears automatically.
   */
  const handleWorkflowReady =
    useCallback(
      (
        ready: boolean
      ) => {
        if (ready) {
          setShowCamera(
            false
          );
        }
      },
      []
    );

  async function findWarehouseId(
    code: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("warehouses")
      .select("id")
      .ilike(
        "code",
        code
      )
      .limit(2);

    if (error) {
      return {
        id: null,
        error:
          error.message,
      };
    }

    if (
      (data ?? []).length ===
      1
    ) {
      return {
        id: data![0].id,
        error: null,
      };
    }

    return {
      id: null,
      error:
        (data ?? [])
          .length > 1
          ? "Multiple warehouses matched this code."
          : null,
    };
  }

  async function findZoneId(
    warehouseId: string,
    zoneCode: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("zones")
      .select("id")
      .eq(
        "warehouse_id",
        warehouseId
      )
      .ilike(
        "code",
        zoneCode
      )
      .limit(2);

    if (error) {
      return {
        id: null,
        error:
          error.message,
      };
    }

    if (
      (data ?? []).length ===
      1
    ) {
      return {
        id: data![0].id,
        error: null,
      };
    }

    return {
      id: null,
      error:
        (data ?? [])
          .length > 1
          ? "Multiple zones matched this code."
          : null,
    };
  }

  /*
   * -------------------------------------------
   * CHECK WAREHOUSE
   * -------------------------------------------
   */
  async function checkWarehouse(
    value: string,
    parsed: ParsedScanValue
  ) {
    let row:
      | WarehouseRow
      | null = null;

    if (
      parsed.type ===
      "warehouse" &&
      parsed.warehouseCode
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          warehouse_type,
          description,
          qr_code,
          qr_payload,
          is_active
        `)
        .ilike(
          "code",
          parsed.warehouseCode
        )
        .limit(2);

      if (error) {
        throw new Error(
          error.message
        );
      }

      if (
        (data ?? []).length ===
        1
      ) {
        row =
          data![0] as WarehouseRow;
      }
    }

    if (!row) {
      const {
        data,
        error,
      } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          warehouse_type,
          description,
          qr_code,
          qr_payload,
          is_active
        `)
        .eq(
          "qr_code",
          value
        )
        .limit(2);

      if (error) {
        throw new Error(
          error.message
        );
      }

      row =
        (data?.[0] as
          | WarehouseRow
          | undefined) ??
        null;
    }

    if (!row) {
      return false;
    }

    const [
      zoneCount,
      locationCount,
      stockResult,
    ] =
      await Promise.all([
        supabase
          .from("zones")
          .select(
            "id",
            {
              count: "exact",
              head: true,
            }
          )
          .eq(
            "warehouse_id",
            row.id
          ),

        supabase
          .from("locations")
          .select(
            "id",
            {
              count: "exact",
              head: true,
            }
          )
          .eq(
            "warehouse_id",
            row.id
          ),

        supabase
          .from(
            "v_location_stock_summary"
          )
          .select(
            "total_quantity, total_reserved_quantity, total_available_quantity"
          )
          .eq(
            "warehouse_id",
            row.id
          ),
      ]);

    if (
      zoneCount.error
    ) {
      throw new Error(
        zoneCount.error.message
      );
    }

    if (
      locationCount.error
    ) {
      throw new Error(
        locationCount.error
          .message
      );
    }

    if (
      stockResult.error
    ) {
      throw new Error(
        stockResult.error
          .message
      );
    }

    const stock =
      (
        stockResult.data ??
        []
      ).reduce(
        (
          current,
          item
        ) => {
          current.total +=
            Number(
              item.total_quantity ??
              0
            );

          current.reserved +=
            Number(
              item.total_reserved_quantity ??
              0
            );

          current.available +=
            Number(
              item.total_available_quantity ??
              0
            );

          return current;
        },
        {
          total: 0,
          reserved: 0,
          available: 0,
        }
      );

    setCheckResult({
      type: "warehouse",

      data: {
        id: row.id,

        code: row.code,
        name: row.name,

        warehouse_type:
          row.warehouse_type,

        description:
          row.description,

        qr_code:
          row.qr_code,

        qr_payload:
          row.qr_payload,

        is_active:
          row.is_active,

        zone_count:
          zoneCount.count ??
          0,

        location_count:
          locationCount.count ??
          0,

        total_quantity:
          stock.total,

        reserved_quantity:
          stock.reserved,

        available_quantity:
          stock.available,
      },
    });

    return true;
  }

  /*
   * -------------------------------------------
   * CHECK ZONE
   * -------------------------------------------
   */
  async function checkZone(
    value: string,
    parsed: ParsedScanValue
  ) {
    const select = `
      id,
      warehouse_id,
      code,
      name,
      description,
      qr_code,
      qr_payload,
      is_active,
      warehouses (
        id,
        code,
        name
      )
    `;

    let row:
      | ZoneRow
      | null = null;

    if (
      parsed.type ===
      "zone" &&
      parsed.warehouseCode &&
      parsed.zoneCode
    ) {
      const warehouse =
        await findWarehouseId(
          parsed.warehouseCode
        );

      if (
        warehouse.error
      ) {
        throw new Error(
          warehouse.error
        );
      }

      if (warehouse.id) {
        const {
          data,
          error,
        } = await supabase
          .from("zones")
          .select(select)
          .eq(
            "warehouse_id",
            warehouse.id
          )
          .ilike(
            "code",
            parsed.zoneCode
          )
          .limit(2);

        if (error) {
          throw new Error(
            error.message
          );
        }

        row =
          (data?.[0] as unknown as
            | ZoneRow
            | undefined) ??
          null;
      }
    }

    if (!row) {
      const {
        data,
        error,
      } = await supabase
        .from("zones")
        .select(select)
        .eq(
          "qr_code",
          value
        )
        .limit(2);

      if (error) {
        throw new Error(
          error.message
        );
      }

      row =
        (data?.[0] as unknown as
          | ZoneRow
          | undefined) ??
        null;
    }

    if (!row) {
      return false;
    }

    const warehouse =
      getSingleRelation(
        row.warehouses
      );

    if (!warehouse) {
      throw new Error(
        "Warehouse information could not be resolved."
      );
    }

    const [
      locationCount,
      stockResult,
    ] =
      await Promise.all([
        supabase
          .from("locations")
          .select(
            "id",
            {
              count: "exact",
              head: true,
            }
          )
          .eq(
            "zone_id",
            row.id
          ),

        supabase
          .from(
            "v_location_stock_summary"
          )
          .select(
            "total_quantity, total_reserved_quantity, total_available_quantity"
          )
          .eq(
            "zone_id",
            row.id
          ),
      ]);

    if (
      locationCount.error
    ) {
      throw new Error(
        locationCount.error
          .message
      );
    }

    if (
      stockResult.error
    ) {
      throw new Error(
        stockResult.error
          .message
      );
    }

    const stock =
      (
        stockResult.data ??
        []
      ).reduce(
        (
          current,
          item
        ) => {
          current.total +=
            Number(
              item.total_quantity ??
              0
            );

          current.reserved +=
            Number(
              item.total_reserved_quantity ??
              0
            );

          current.available +=
            Number(
              item.total_available_quantity ??
              0
            );

          return current;
        },
        {
          total: 0,
          reserved: 0,
          available: 0,
        }
      );

    setCheckResult({
      type: "zone",

      data: {
        id: row.id,

        warehouse_id:
          row.warehouse_id,

        warehouse_code:
          warehouse.code,

        warehouse_name:
          warehouse.name,

        code: row.code,
        name: row.name,

        description:
          row.description,

        qr_code:
          row.qr_code,

        qr_payload:
          row.qr_payload,

        is_active:
          row.is_active,

        location_count:
          locationCount.count ??
          0,

        total_quantity:
          stock.total,

        reserved_quantity:
          stock.reserved,

        available_quantity:
          stock.available,
      },
    });

    return true;
  }

  /*
   * -------------------------------------------
   * CHECK LOCATION
   * -------------------------------------------
   */
  async function checkLocation(
    value: string,
    parsed: ParsedScanValue
  ) {
    const select = `
      id,
      warehouse_id,
      zone_id,
      code,
      name,
      location_type,
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
    `;

    let row:
      | LocationRow
      | null = null;

    /*
     * Canonical:
     * LOC|MAIN|B|B-01-01
     */
    if (
      parsed.type ===
      "location" &&
      parsed.warehouseCode &&
      parsed.zoneCode &&
      parsed.locationCode
    ) {
      const warehouse =
        await findWarehouseId(
          parsed.warehouseCode
        );

      if (
        warehouse.error
      ) {
        throw new Error(
          warehouse.error
        );
      }

      if (warehouse.id) {
        const zone =
          await findZoneId(
            warehouse.id,
            parsed.zoneCode
          );

        if (
          zone.error
        ) {
          throw new Error(
            zone.error
          );
        }

        if (zone.id) {
          const {
            data,
            error,
          } = await supabase
            .from(
              "locations"
            )
            .select(select)
            .eq(
              "warehouse_id",
              warehouse.id
            )
            .eq(
              "zone_id",
              zone.id
            )
            .ilike(
              "code",
              parsed.locationCode
            )
            .limit(2);

          if (error) {
            throw new Error(
              error.message
            );
          }

          row =
            (data?.[0] as unknown as
              | LocationRow
              | undefined) ??
            null;
        }
      }
    }

    /*
     * Exact human-readable QR.
     */
    if (!row) {
      const {
        data,
        error,
      } = await supabase
        .from("locations")
        .select(select)
        .eq(
          "qr_code",
          value
        )
        .limit(2);

      if (error) {
        throw new Error(
          error.message
        );
      }

      row =
        (data?.[0] as unknown as
          | LocationRow
          | undefined) ??
        null;
    }

    /*
     * Exact payload.
     */
    if (!row) {
      const {
        data,
        error,
      } = await supabase
        .from("locations")
        .select(select)
        .eq(
          "qr_payload",
          value
        )
        .limit(2);

      if (error) {
        throw new Error(
          error.message
        );
      }

      row =
        (data?.[0] as unknown as
          | LocationRow
          | undefined) ??
        null;
    }

    /*
     * Plain location code.
     * Only accept unique result.
     */
    if (
      !row &&
      parsed.type ===
      "location" &&
      parsed.locationCode
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("locations")
        .select(select)
        .ilike(
          "code",
          parsed.locationCode
        )
        .limit(3);

      if (error) {
        throw new Error(
          error.message
        );
      }

      if (
        (data ?? []).length >
        1
      ) {
        throw new Error(
          "This shelf code exists in more than one location. Scan the full location QR."
        );
      }

      row =
        (data?.[0] as unknown as
          | LocationRow
          | undefined) ??
        null;
    }

    if (!row) {
      return false;
    }

    const warehouse =
      getSingleRelation(
        row.warehouses
      );

    const zone =
      getSingleRelation(
        row.zones
      );

    if (!warehouse) {
      throw new Error(
        "Warehouse information could not be resolved."
      );
    }

    const result: LocationCheck =
    {
      id: row.id,

      warehouse_id:
        row.warehouse_id,

      warehouse_code:
        warehouse.code,

      warehouse_name:
        warehouse.name,

      zone_id:
        row.zone_id,

      zone_code:
        zone?.code ??
        null,

      zone_name:
        zone?.name ??
        null,

      code: row.code,
      name: row.name,

      location_type:
        row.location_type,

      qr_code:
        row.qr_code,

      qr_payload:
        row.qr_payload,

      is_active:
        row.is_active,
    };

    setCheckResult({
      type: "location",
      data: result,
    });

    const lookupValue =
      row.qr_code ||
      row.qr_payload ||
      row.code;

    const {
      data:
      inventoryData,
      error:
      inventoryError,
    } =
      await supabase.rpc(
        "get_location_inventory_by_qr",
        {
          p_qr_code:
            lookupValue,
        }
      );

    if (inventoryError) {
      throw new Error(
        inventoryError.message
      );
    }

    setLocationInventory(
      (inventoryData as LocationInventoryRow[]) ??
      []
    );

    return true;
  }

  /*
   * -------------------------------------------
   * CHECK PRODUCT
   * -------------------------------------------
   */
  async function checkProduct(
    value: string
  ) {
    let product:
      | ProductCheck
      | null = null;

    /*
     * SKU / Barcode.
     */
    const {
      data: rpcData,
      error: rpcError,
    } =
      await supabase.rpc(
        "find_product_by_sku_or_barcode",
        {
          p_query: value,
        }
      );

    if (rpcError) {
      throw new Error(
        rpcError.message
      );
    }

    const rpcRow =
      (rpcData?.[0] as
        | RpcProductRow
        | undefined) ??
      null;

    if (rpcRow) {
      product = {
        id:
          rpcRow.product_id,

        sku: rpcRow.sku,

        barcode:
          rpcRow.barcode,

        name:
          rpcRow.product_name,

        brand:
          rpcRow.brand,

        category:
          rpcRow.category,

        unit:
          rpcRow.unit,

        status:
          rpcRow.product_status,

        qr_value: null,
      };
    }

    /*
     * Product QR value fallback.
     */
    if (!product) {
      const {
        data,
        error,
      } = await supabase
        .from("products")
        .select(`
          id,
          sku,
          barcode,
          name,
          brand,
          category,
          unit,
          status,
          qr_value
        `)
        .eq(
          "qr_value",
          value
        )
        .limit(1);

      if (error) {
        throw new Error(
          error.message
        );
      }

      const row =
        (data?.[0] as
          | ProductFallbackRow
          | undefined) ??
        null;

      if (row) {
        product = {
          id: row.id,

          sku: row.sku,

          barcode:
            row.barcode,

          name: row.name,

          brand:
            row.brand,

          category:
            row.category,

          unit: row.unit,

          status:
            row.status,

          qr_value:
            row.qr_value,
        };
      }
    }

    if (!product) {
      return false;
    }

    setCheckResult({
      type: "product",
      data: product,
    });

    const {
      data: stockData,
      error: stockError,
    } =
      await supabase.rpc(
        "search_stock",
        {
          p_query:
            product.sku,

          p_limit: 100,
        }
      );

    if (stockError) {
      throw new Error(
        stockError.message
      );
    }

    const rows = (
      (stockData as ProductStockRow[]) ??
      []
    ).filter(
      (item) =>
        item.product_id ===
        product!.id
    );

    setProductStock(
      rows
    );

    return true;
  }

  /*
   * -------------------------------------------
   * CHECK STOCK SCAN
   * -------------------------------------------
   */
  async function processCheckScan(
    rawValue: string
  ) {
    const value =
      rawValue.trim();

    resetCheckResult();

    if (!value) {
      setErrorMessage(
        "Scan value is required."
      );

      return false;
    }

    setIsLoading(true);

    try {
      const parsed =
        parseScanValue(
          value
        );

      let found = false;

      if (
        parsed.type ===
        "warehouse"
      ) {
        found =
          await checkWarehouse(
            value,
            parsed
          );
      } else if (
        parsed.type ===
        "zone"
      ) {
        found =
          await checkZone(
            value,
            parsed
          );
      } else if (
        parsed.type ===
        "location"
      ) {
        found =
          await checkLocation(
            value,
            parsed
          );
      } else if (
        parsed.type ===
        "product"
      ) {
        found =
          await checkProduct(
            parsed.productQuery ||
            value
          );
      }

      if (!found) {
        setErrorMessage(
          "No matching warehouse, zone, location, product, SKU, or barcode was found."
        );

        return false;
      }

      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Scan could not be processed."
      );

      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function processInput(
    rawValue: string
  ) {
    const value =
      rawValue.trim();

    if (!value) {
      setErrorMessage(
        "Scan value is required."
      );

      return;
    }

    if (
      operation === "check"
    ) {
      const success =
        await processCheckScan(
          value
        );

      if (success) {
        setShowCamera(
          false
        );
      }

      return;
    }

    /*
     * Stock operations are handled
     * by GuidedStockOperation.
     */
    setErrorMessage(null);

    sendToWorkflow(
      value
    );
  }

  async function handleCameraScan(
    decodedText: string
  ) {
    setManualValue(
      decodedText
    );

    await processInput(
      decodedText
    );
  }

  async function handleManualSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    await processInput(
      manualValue
    );
  }

  const selectedOperation =
    operationOptions.find(
      (item) =>
        item.value ===
        operation
    );

  return (
    <div className="space-y-6">
      {/* OPERATION SELECTOR */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            What do you want
            to do?
          </h3>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Select an action,
            then scan the
            required product or
            shelf QR.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {operationOptions.map(
            (item) => {
              const selected =
                operation ===
                item.value;

              return (
                <button
                  key={
                    item.value
                  }
                  type="button"
                  onClick={() =>
                    handleOperationChange(
                      item.value
                    )
                  }
                  className={`rounded-xl border px-3 py-4 text-left transition ${selected
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                    : "border-gray-200 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"
                    }`}
                >
                  <p
                    className={`text-sm font-semibold ${selected
                      ? "text-brand-700 dark:text-brand-400"
                      : "text-gray-800 dark:text-white/90"
                      }`}
                  >
                    {
                      item.label
                    }
                  </p>

                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {
                      item.description
                    }
                  </p>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* CURRENT ACTION */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Current Action
          </p>

          <h3 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {
              selectedOperation?.label
            }
          </h3>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {
              selectedOperation?.description
            }
          </p>
        </div>

        {!showCamera ? (
          <button
            type="button"
            onClick={() =>
              setShowCamera(
                true
              )
            }
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
          >
            Scan with Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              setShowCamera(
                false
              )
            }
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Hide Camera
          </button>
        )}
      </div>

      {/* CAMERA — ONLY WHILE NEEDED */}
      {showCamera && (
        <CameraScanner
          onScanSuccess={
            handleCameraScan
          }
        />
      )}

      {/* MANUAL / HARDWARE INPUT */}
      <details className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">
          Manual Input /
          Hardware Scanner
        </summary>

        <form
          onSubmit={
            handleManualSubmit
          }
          className="flex flex-col gap-3 border-t border-gray-200 p-5 dark:border-gray-800 sm:flex-row"
        >
          <input
            value={manualValue}
            onChange={(
              event
            ) =>
              setManualValue(
                event.target.value
              )
            }
            autoComplete="off"
            placeholder="Scan or enter QR, SKU, or barcode..."
            className="h-11 flex-1 rounded-lg border border-gray-200 bg-transparent px-4 font-mono text-sm text-gray-800 placeholder:font-sans placeholder:text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {isLoading
              ? "Checking..."
              : "Submit"}
          </button>
        </form>
      </details>

      {/* GENERAL ERROR */}
      {errorMessage && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      {/* STOCK WORKFLOW */}
      {operation !==
        "check" && (
          <GuidedStockOperation
            key={operation}
            operationType={
              operation
            }
            scannedValue={
              workflowScan.value
            }
            scanNonce={
              workflowScan.nonce
            }
            onWorkflowReadyChange={
              handleWorkflowReady
            }
          />
        )}

      {/* CHECK STOCK EMPTY STATE */}
      {operation ===
        "check" &&
        !checkResult &&
        !errorMessage &&
        !isLoading && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Scan anything
            </h3>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-500 dark:text-gray-400">
              Scan a product to
              see where it is
              stored, or scan a
              shelf to see which
              products are
              currently there.
            </p>

            <div className="mx-auto mt-5 grid max-w-xl grid-cols-2 gap-3 text-left md:grid-cols-4">
              {[
                "Warehouse",
                "Zone",
                "Location",
                "Product",
              ].map(
                (item) => (
                  <div
                    key={item}
                    className="rounded-xl bg-gray-50 p-3 text-center text-xs font-medium text-gray-600 dark:bg-white/[0.03] dark:text-gray-400"
                  >
                    {item}
                  </div>
                )
              )}
            </div>
          </div>
        )}

      {/* LOADING */}
      {operation ===
        "check" &&
        isLoading && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Checking...
            </p>
          </div>
        )}

      {/* WAREHOUSE RESULT */}
      {checkResult?.type ===
        "warehouse" && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">
                  Warehouse
                </p>

                <h3 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {
                    checkResult
                      .data.code
                  }{" "}
                  —{" "}
                  {
                    checkResult
                      .data.name
                  }
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {formatText(
                    checkResult
                      .data
                      .warehouse_type
                  )}
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${activeBadge(
                  checkResult
                    .data
                    .is_active
                )}`}
              >
                {checkResult
                  .data
                  .is_active
                  ? "Active"
                  : "Inactive"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 md:grid-cols-5">
              {[
                {
                  label: "Zones",
                  value:
                    checkResult
                      .data
                      .zone_count,
                },
                {
                  label:
                    "Locations",
                  value:
                    checkResult
                      .data
                      .location_count,
                },
                {
                  label:
                    "On Hand",
                  value:
                    checkResult
                      .data
                      .total_quantity,
                },
                {
                  label:
                    "Reserved",
                  value:
                    checkResult
                      .data
                      .reserved_quantity,
                },
                {
                  label:
                    "Available",
                  value:
                    checkResult
                      .data
                      .available_quantity,
                },
              ].map(
                (item) => (
                  <div
                    key={
                      item.label
                    }
                    className="bg-white p-4 dark:bg-gray-900"
                  >
                    <p className="text-xs text-gray-500">
                      {
                        item.label
                      }
                    </p>

                    <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">
                      {formatNumber(
                        item.value
                      )}
                    </p>
                  </div>
                )
              )}
            </div>

            <div className="p-5">
              <button
                type="button"
                onClick={() =>
                  setShowCamera(
                    true
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

      {/* ZONE RESULT */}
      {checkResult?.type ===
        "zone" && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">
                  Zone
                </p>

                <h3 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {
                    checkResult
                      .data
                      .warehouse_code
                  }{" "}
                  /{" "}
                  {
                    checkResult
                      .data.code
                  }{" "}
                  —{" "}
                  {
                    checkResult
                      .data.name
                  }
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {
                    checkResult
                      .data
                      .warehouse_name
                  }
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${activeBadge(
                  checkResult
                    .data
                    .is_active
                )}`}
              >
                {checkResult
                  .data
                  .is_active
                  ? "Active"
                  : "Inactive"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 md:grid-cols-4">
              {[
                {
                  label:
                    "Locations",
                  value:
                    checkResult
                      .data
                      .location_count,
                },
                {
                  label:
                    "On Hand",
                  value:
                    checkResult
                      .data
                      .total_quantity,
                },
                {
                  label:
                    "Reserved",
                  value:
                    checkResult
                      .data
                      .reserved_quantity,
                },
                {
                  label:
                    "Available",
                  value:
                    checkResult
                      .data
                      .available_quantity,
                },
              ].map(
                (item) => (
                  <div
                    key={
                      item.label
                    }
                    className="bg-white p-4 dark:bg-gray-900"
                  >
                    <p className="text-xs text-gray-500">
                      {
                        item.label
                      }
                    </p>

                    <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">
                      {formatNumber(
                        item.value
                      )}
                    </p>
                  </div>
                )
              )}
            </div>

            <div className="p-5">
              <button
                type="button"
                onClick={() =>
                  setShowCamera(
                    true
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

      {/* LOCATION RESULT */}
      {checkResult?.type ===
        "location" && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">
                  Shelf Location
                </p>

                <h3 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {
                    checkResult
                      .data
                      .warehouse_code
                  }{" "}
                  /{" "}
                  {checkResult
                    .data.zone_code
                    ? `${checkResult.data.zone_code} / `
                    : ""}
                  {
                    checkResult
                      .data.code
                  }
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {
                    checkResult
                      .data.name
                  }{" "}
                  ·{" "}
                  {formatText(
                    checkResult
                      .data
                      .location_type
                  )}
                </p>
              </div>

              <span
                className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${activeBadge(
                  checkResult
                    .data
                    .is_active
                )}`}
              >
                {checkResult
                  .data
                  .is_active
                  ? "Active"
                  : "Inactive"}
              </span>
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Products on this
                    shelf
                  </h4>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {
                      locationInventory.length
                    }{" "}
                    product position
                    {locationInventory.length ===
                      1
                      ? ""
                      : "s"}
                  </p>
                </div>
              </div>

              {locationInventory.length ===
                0 ? (
                <div className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                  This shelf is
                  currently empty.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead>
                      <tr>
                        <th className="py-2 text-left text-xs font-medium uppercase text-gray-500">
                          Product
                        </th>

                        <th className="py-2 text-right text-xs font-medium uppercase text-gray-500">
                          On Hand
                        </th>

                        <th className="py-2 text-right text-xs font-medium uppercase text-gray-500">
                          Reserved
                        </th>

                        <th className="py-2 text-right text-xs font-medium uppercase text-gray-500">
                          Available
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {locationInventory.map(
                        (item) => (
                          <tr
                            key={
                              item.inventory_id
                            }
                          >
                            <td className="py-3 pr-4">
                              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                {
                                  item.sku
                                }
                              </p>

                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {
                                  item.product_name
                                }
                              </p>
                            </td>

                            <td className="py-3 text-right text-sm">
                              {formatNumber(
                                item.quantity
                              )}
                            </td>

                            <td className="py-3 text-right text-sm">
                              {formatNumber(
                                item.reserved_quantity
                              )}
                            </td>

                            <td className="py-3 text-right text-sm font-semibold text-gray-800 dark:text-white">
                              {formatNumber(
                                item.available_quantity
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setShowCamera(
                    true
                  )
                }
                className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

      {/* PRODUCT RESULT */}
      {checkResult?.type ===
        "product" && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <p className="text-xs font-medium uppercase text-gray-500">
                Product
              </p>

              <h3 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                {
                  checkResult
                    .data.sku
                }{" "}
                —{" "}
                {
                  checkResult
                    .data.name
                }
              </h3>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                {checkResult
                  .data.brand && (
                    <span>
                      {
                        checkResult
                          .data.brand
                      }
                    </span>
                  )}

                {checkResult
                  .data.category && (
                    <span>
                      {
                        checkResult
                          .data
                          .category
                      }
                    </span>
                  )}

                {checkResult
                  .data
                  .barcode && (
                    <span className="font-mono">
                      {
                        checkResult
                          .data
                          .barcode
                      }
                    </span>
                  )}
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Where is this
                  product?
                </h4>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Current stock by
                  shelf location.
                </p>
              </div>

              {productStock.length ===
                0 ? (
                <div className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                  No stock
                  locations found.
                </div>
              ) : (
                <div className="space-y-2">
                  {productStock.map(
                    (stock) => (
                      <div
                        key={`${stock.inventory_id}-${stock.location_id}`}
                        className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                              {
                                stock.warehouse_code
                              }{" "}
                              /{" "}
                              {stock.zone_code
                                ? `${stock.zone_code} / `
                                : ""}
                              {
                                stock.location_code
                              }
                            </p>

                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {
                                stock.warehouse_name
                              }{" "}
                              ·{" "}
                              {
                                stock.location_name
                              }
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs text-gray-500">
                              Available
                            </p>

                            <p className="text-lg font-semibold text-gray-800 dark:text-white">
                              {formatNumber(
                                stock.available_quantity
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800">
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
                      </div>
                    )
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setShowCamera(
                    true
                  )
                }
                className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}
    </div>
  );
}