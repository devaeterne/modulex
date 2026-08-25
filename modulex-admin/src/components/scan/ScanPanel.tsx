"use client";

import React, { useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase/client";
import CameraScanner from "@/components/scan/CameraScanner";
import GuidedStockOperation from "@/components/scan/GuidedStockOperation";

import {
  parseScanValue,
  type ParsedScanValue,
  type ScanEntityType,
} from "@/lib/scan/parseScanValue";

type ScanMode =
  | "auto"
  | "warehouse"
  | "zone"
  | "location"
  | "product";

type Relation<T> =
  | T
  | T[]
  | null;

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

type WarehouseResult = {
  warehouse_id: string;
  code: string;
  name: string;

  description: string | null;

  warehouse_type: string;

  address: string | null;
  city: string | null;
  country: string | null;

  qr_code: string | null;
  qr_payload: string | null;

  is_active: boolean;

  zone_count: number;
  location_count: number;

  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
};

type ZoneResult = {
  zone_id: string;

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
  product_positions: number;

  total_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
};

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

  qr_code: string | null;
  qr_payload: string | null;

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

  qr_code: string | null;

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

  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;

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

  description: string | null;

  warehouse_type: string;

  address: string | null;
  city: string | null;
  country: string | null;

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

  warehouses: Relation<WarehouseRelation>;
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

  warehouses: Relation<WarehouseRelation>;
  zones: Relation<ZoneRelation>;
};

type StockSummaryRow = {
  location_id?: string | null;

  product_count?: number | null;

  total_quantity?: number | null;
  total_reserved_quantity?: number | null;
  total_available_quantity?: number | null;
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
  return Number(value ?? 0).toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  );
}

function formatLocationType(
  value: string
) {
  return String(value)
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
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

function formatStatus(
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

function statusClass(
  isActive: boolean
) {
  return isActive
    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
    : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function aggregateStock(
  rows:
    | StockSummaryRow[]
    | null
    | undefined
) {
  return (rows ?? []).reduce(
    (summary, row) => {
      summary.totalQuantity +=
        Number(
          row.total_quantity ??
          0
        );

      summary.totalReserved +=
        Number(
          row.total_reserved_quantity ??
          0
        );

      summary.totalAvailable +=
        Number(
          row.total_available_quantity ??
          0
        );

      summary.productPositions +=
        Number(
          row.product_count ??
          0
        );

      return summary;
    },
    {
      totalQuantity: 0,
      totalReserved: 0,
      totalAvailable: 0,
      productPositions: 0,
    }
  );
}

export default function ScanPanel() {
  const [
    scanMode,
    setScanMode,
  ] =
    useState<ScanMode>("auto");

  const [
    scanValue,
    setScanValue,
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
    warehouseResult,
    setWarehouseResult,
  ] =
    useState<WarehouseResult | null>(
      null
    );

  const [
    zoneResult,
    setZoneResult,
  ] =
    useState<ZoneResult | null>(
      null
    );

  const [
    locationResult,
    setLocationResult,
  ] =
    useState<LocationResult | null>(
      null
    );

  const [
    productResult,
    setProductResult,
  ] =
    useState<ProductResult | null>(
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
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null
    );

  function resetResults() {
    setWarehouseResult(null);
    setZoneResult(null);
    setLocationResult(null);
    setProductResult(null);

    setLocationInventory([]);
    setProductStock([]);

    setErrorMessage(null);
  }

  function pushWorkflowScan(
    value: string
  ) {
    setWorkflowScan({
      value,
      nonce: Date.now(),
    });
  }

  async function findWarehouseIdByCode(
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
        code.trim()
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
      0
    ) {
      return {
        id: null,
        error: null,
      };
    }

    if (
      (data ?? []).length >
      1
    ) {
      return {
        id: null,
        error:
          "Multiple warehouses matched this code.",
      };
    }

    return {
      id: data![0].id,
      error: null,
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
        zoneCode.trim()
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
      0
    ) {
      return {
        id: null,
        error: null,
      };
    }

    if (
      (data ?? []).length >
      1
    ) {
      return {
        id: null,
        error:
          "Multiple zones matched this warehouse and zone code.",
      };
    }

    return {
      id: data![0].id,
      error: null,
    };
  }

  async function loadWarehouseResult(
    row: WarehouseRow
  ) {
    const [
      zoneCountResult,
      locationCountResult,
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
      zoneCountResult.error
    ) {
      return {
        result: null,
        error:
          zoneCountResult.error
            .message,
      };
    }

    if (
      locationCountResult.error
    ) {
      return {
        result: null,
        error:
          locationCountResult
            .error.message,
      };
    }

    if (stockResult.error) {
      return {
        result: null,
        error:
          stockResult.error
            .message,
      };
    }

    const stock =
      aggregateStock(
        stockResult.data
      );

    const result: WarehouseResult =
    {
      warehouse_id:
        row.id,

      code: row.code,
      name: row.name,

      description:
        row.description,

      warehouse_type:
        row.warehouse_type,

      address:
        row.address,

      city: row.city,
      country:
        row.country,

      qr_code:
        row.qr_code,

      qr_payload:
        row.qr_payload,

      is_active:
        row.is_active,

      zone_count:
        zoneCountResult.count ??
        0,

      location_count:
        locationCountResult.count ??
        0,

      total_quantity:
        stock.totalQuantity,

      total_reserved_quantity:
        stock.totalReserved,

      total_available_quantity:
        stock.totalAvailable,
    };

    return {
      result,
      error: null,
    };
  }

  async function findWarehouse(
    rawValue: string,
    parsed: ParsedScanValue
  ) {
    let warehouse:
      | WarehouseRow
      | null = null;

    const warehouseCode =
      parsed.type ===
        "warehouse"
        ? parsed.warehouseCode
        : undefined;

    if (warehouseCode) {
      const {
        data,
        error,
      } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          description,
          warehouse_type,
          address,
          city,
          country,
          qr_code,
          qr_payload,
          is_active
        `)
        .ilike(
          "code",
          warehouseCode
        )
        .limit(2);

      if (error) {
        return {
          warehouse: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length ===
        1
      ) {
        warehouse =
          data![0] as WarehouseRow;
      }
    }

    if (!warehouse) {
      const {
        data,
        error,
      } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          description,
          warehouse_type,
          address,
          city,
          country,
          qr_code,
          qr_payload,
          is_active
        `)
        .eq(
          "qr_payload",
          rawValue
        )
        .limit(2);

      if (error) {
        return {
          warehouse: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length ===
        1
      ) {
        warehouse =
          data![0] as WarehouseRow;
      }
    }

    if (!warehouse) {
      const {
        data,
        error,
      } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          description,
          warehouse_type,
          address,
          city,
          country,
          qr_code,
          qr_payload,
          is_active
        `)
        .eq(
          "qr_code",
          rawValue
        )
        .limit(2);

      if (error) {
        return {
          warehouse: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length ===
        1
      ) {
        warehouse =
          data![0] as WarehouseRow;
      }
    }

    if (!warehouse) {
      const {
        data,
        error,
      } = await supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          description,
          warehouse_type,
          address,
          city,
          country,
          qr_code,
          qr_payload,
          is_active
        `)
        .ilike(
          "code",
          rawValue
        )
        .limit(2);

      if (error) {
        return {
          warehouse: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length >
        1
      ) {
        return {
          warehouse: null,
          error:
            "Multiple warehouses matched this scan value.",
        };
      }

      warehouse =
        (data?.[0] as
          | WarehouseRow
          | undefined) ??
        null;
    }

    if (!warehouse) {
      return {
        warehouse: null,
        error: null,
      };
    }

    const {
      result,
      error,
    } =
      await loadWarehouseResult(
        warehouse
      );

    return {
      warehouse: result,
      error,
    };
  }

  async function loadZoneResult(
    row: ZoneRow
  ) {
    const warehouse =
      getSingleRelation(
        row.warehouses
      );

    if (!warehouse) {
      return {
        result: null,
        error:
          "Warehouse information for this zone could not be resolved.",
      };
    }

    const {
      data: stockData,
      error: stockError,
    } = await supabase
      .from(
        "v_location_stock_summary"
      )
      .select(
        "location_id, product_count, total_quantity, total_reserved_quantity, total_available_quantity"
      )
      .eq(
        "zone_id",
        row.id
      );

    if (stockError) {
      return {
        result: null,
        error:
          stockError.message,
      };
    }

    const stock =
      aggregateStock(
        stockData
      );

    const result: ZoneResult =
    {
      zone_id:
        row.id,

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
        (stockData ?? [])
          .length,

      product_positions:
        stock.productPositions,

      total_quantity:
        stock.totalQuantity,

      total_reserved_quantity:
        stock.totalReserved,

      total_available_quantity:
        stock.totalAvailable,
    };

    return {
      result,
      error: null,
    };
  }

  async function findZone(
    rawValue: string,
    parsed: ParsedScanValue
  ) {
    let zone:
      | ZoneRow
      | null = null;

    /*
     * First priority:
     * exact scanner payload.
     */
    const {
      data:
      payloadData,
      error:
      payloadError,
    } = await supabase
      .from("zones")
      .select(`
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
      `)
      .eq(
        "qr_payload",
        rawValue
      )
      .limit(2);

    if (payloadError) {
      return {
        zone: null,
        error:
          payloadError.message,
      };
    }

    if (
      (payloadData ?? [])
        .length === 1
    ) {
      zone =
        payloadData![0] as unknown as ZoneRow;
    }

    /*
     * Second priority:
     * exact human-readable QR code.
     */
    if (!zone) {
      const {
        data,
        error,
      } = await supabase
        .from("zones")
        .select(`
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
        `)
        .eq(
          "qr_code",
          rawValue
        )
        .limit(2);

      if (error) {
        return {
          zone: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length ===
        1
      ) {
        zone =
          data![0] as unknown as ZoneRow;
      }
    }

    /*
     * Canonical hierarchy fallback:
     *
     * ZONE|MAIN|B
     */
    if (
      !zone &&
      parsed.type ===
      "zone" &&
      parsed.warehouseCode &&
      parsed.zoneCode
    ) {
      const {
        id: warehouseId,
        error:
        warehouseError,
      } =
        await findWarehouseIdByCode(
          parsed.warehouseCode
        );

      if (warehouseError) {
        return {
          zone: null,
          error:
            warehouseError,
        };
      }

      if (warehouseId) {
        const {
          data,
          error,
        } = await supabase
          .from("zones")
          .select(`
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
          `)
          .eq(
            "warehouse_id",
            warehouseId
          )
          .ilike(
            "code",
            parsed.zoneCode
          )
          .limit(2);

        if (error) {
          return {
            zone: null,
            error:
              error.message,
          };
        }

        if (
          (data ?? []).length ===
          1
        ) {
          zone =
            data![0] as unknown as ZoneRow;
        }
      }
    }

    /*
     * Manual Zone mode:
     *
     * user can enter only "B".
     *
     * This is allowed only when that
     * zone code is globally unique.
     */
    if (!zone) {
      const {
        data,
        error,
      } = await supabase
        .from("zones")
        .select(`
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
        `)
        .ilike(
          "code",
          rawValue
        )
        .limit(3);

      if (error) {
        return {
          zone: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length >
        1
      ) {
        return {
          zone: null,
          error:
            "This zone code exists in more than one warehouse. Scan the zone QR code instead.",
        };
      }

      zone =
        (data?.[0] as unknown as
          | ZoneRow
          | undefined) ??
        null;
    }

    if (!zone) {
      return {
        zone: null,
        error: null,
      };
    }

    const {
      result,
      error,
    } =
      await loadZoneResult(
        zone
      );

    return {
      zone: result,
      error,
    };
  }

  function mapLocationRow(
    row: LocationRow
  ): LocationResult {
    const warehouse =
      getSingleRelation(
        row.warehouses
      );

    const zone =
      getSingleRelation(
        row.zones
      );

    return {
      location_id:
        row.id,

      warehouse_id:
        row.warehouse_id,

      warehouse_code:
        warehouse?.code ??
        "-",

      warehouse_name:
        warehouse?.name ??
        "-",

      zone_id:
        row.zone_id,

      zone_code:
        zone?.code ??
        null,

      zone_name:
        zone?.name ??
        null,

      location_code:
        row.code,

      location_name:
        row.name,

      location_type:
        row.location_type,

      qr_code:
        row.qr_code,

      qr_payload:
        row.qr_payload,

      is_active:
        row.is_active,
    };
  }

  async function findLocation(
    rawValue: string,
    parsed: ParsedScanValue
  ) {
    const baseSelect = `
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

    /*
     * First priority:
     * canonical QR payload.
     */
    const {
      data:
      payloadData,
      error:
      payloadError,
    } = await supabase
      .from("locations")
      .select(baseSelect)
      .eq(
        "qr_payload",
        rawValue
      )
      .limit(2);

    if (payloadError) {
      return {
        location: null,
        error:
          payloadError.message,
      };
    }

    if (
      (payloadData ?? [])
        .length === 1
    ) {
      return {
        location:
          mapLocationRow(
            payloadData![0] as unknown as LocationRow
          ),
        error: null,
      };
    }

    /*
     * Second priority:
     * human-readable QR code.
     */
    const {
      data:
      qrCodeData,
      error:
      qrCodeError,
    } = await supabase
      .from("locations")
      .select(baseSelect)
      .eq(
        "qr_code",
        rawValue
      )
      .limit(2);

    if (qrCodeError) {
      return {
        location: null,
        error:
          qrCodeError.message,
      };
    }

    if (
      (qrCodeData ?? [])
        .length === 1
    ) {
      return {
        location:
          mapLocationRow(
            qrCodeData![0] as unknown as LocationRow
          ),
        error: null,
      };
    }

    /*
     * Canonical hierarchy:
     *
     * LOC|MAIN|B|B-01-01
     */
    if (
      parsed.type ===
      "location" &&
      parsed.warehouseCode &&
      parsed.zoneCode &&
      parsed.locationCode
    ) {
      const {
        id: warehouseId,
        error:
        warehouseError,
      } =
        await findWarehouseIdByCode(
          parsed.warehouseCode
        );

      if (warehouseError) {
        return {
          location: null,
          error:
            warehouseError,
        };
      }

      if (!warehouseId) {
        return {
          location: null,
          error: null,
        };
      }

      const {
        id: zoneId,
        error: zoneError,
      } =
        await findZoneId(
          warehouseId,
          parsed.zoneCode
        );

      if (zoneError) {
        return {
          location: null,
          error:
            zoneError,
        };
      }

      if (!zoneId) {
        return {
          location: null,
          error: null,
        };
      }

      const {
        data,
        error,
      } = await supabase
        .from("locations")
        .select(baseSelect)
        .eq(
          "warehouse_id",
          warehouseId
        )
        .eq(
          "zone_id",
          zoneId
        )
        .ilike(
          "code",
          parsed.locationCode
        )
        .limit(2);

      if (error) {
        return {
          location: null,
          error:
            error.message,
        };
      }

      if (
        (data ?? []).length ===
        1
      ) {
        return {
          location:
            mapLocationRow(
              data![0] as unknown as LocationRow
            ),
          error: null,
        };
      }
    }

    /*
     * Legacy/manual path:
     *
     * MAIN / B-01-01
     */
    if (
      parsed.type ===
      "location" &&
      parsed.warehouseCode &&
      !parsed.zoneCode &&
      parsed.locationCode
    ) {
      const {
        id: warehouseId,
        error:
        warehouseError,
      } =
        await findWarehouseIdByCode(
          parsed.warehouseCode
        );

      if (warehouseError) {
        return {
          location: null,
          error:
            warehouseError,
        };
      }

      if (warehouseId) {
        const {
          data,
          error,
        } = await supabase
          .from("locations")
          .select(baseSelect)
          .eq(
            "warehouse_id",
            warehouseId
          )
          .ilike(
            "code",
            parsed.locationCode
          )
          .limit(3);

        if (error) {
          return {
            location: null,
            error:
              error.message,
          };
        }

        if (
          (data ?? []).length >
          1
        ) {
          return {
            location: null,
            error:
              "Multiple locations matched this code inside the warehouse. Scan the full location QR payload.",
          };
        }

        if (
          (data ?? []).length ===
          1
        ) {
          return {
            location:
              mapLocationRow(
                data![0] as unknown as LocationRow
              ),
            error: null,
          };
        }
      }
    }

    /*
     * Plain location code fallback.
     *
     * B-01-01
     *
     * Never silently choose the first
     * row if multiple locations exist.
     */
    const possibleCode =
      parsed.type ===
        "location" &&
        parsed.locationCode
        ? parsed.locationCode
        : rawValue;

    const {
      data:
      codeData,
      error:
      codeError,
    } = await supabase
      .from("locations")
      .select(baseSelect)
      .ilike(
        "code",
        possibleCode
      )
      .limit(3);

    if (codeError) {
      return {
        location: null,
        error:
          codeError.message,
      };
    }

    if (
      (codeData ?? [])
        .length > 1
    ) {
      return {
        location: null,
        error:
          "This location code exists more than once. Scan the full location QR code so the warehouse and zone can be identified.",
      };
    }

    if (
      (codeData ?? [])
        .length === 1
    ) {
      return {
        location:
          mapLocationRow(
            codeData![0] as unknown as LocationRow
          ),
        error: null,
      };
    }

    return {
      location: null,
      error: null,
    };
  }

  async function loadLocationInventory(
    location: LocationResult
  ) {
    const lookupValue =
      location.qr_code ||
      location.qr_payload ||
      location.location_code;

    const {
      data,
      error,
    } = await supabase.rpc(
      "get_location_inventory_by_qr",
      {
        p_qr_code:
          lookupValue,
      }
    );

    if (error) {
      return {
        rows: [],
        error:
          error.message,
      };
    }

    return {
      rows:
        (data as LocationInventoryRow[]) ??
        [],
      error: null,
    };
  }

  async function findProduct(
    value: string
  ) {
    const {
      data,
      error,
    } = await supabase.rpc(
      "find_product_by_sku_or_barcode",
      {
        p_query: value,
      }
    );

    if (error) {
      return {
        product: null,
        error:
          error.message,
      };
    }

    const product =
      (data?.[0] as
        | ProductResult
        | undefined) ??
      null;

    return {
      product,
      error: null,
    };
  }

  async function loadProductStock(
    product: ProductResult
  ) {
    const {
      data,
      error,
    } = await supabase.rpc(
      "search_stock",
      {
        p_query:
          product.sku,
        p_limit: 100,
      }
    );

    if (error) {
      return {
        rows: [],
        error:
          error.message,
      };
    }

    const rows = (
      (data as ProductStockRow[]) ??
      []
    ).filter(
      (row) =>
        row.product_id ===
        product.product_id
    );

    return {
      rows,
      error: null,
    };
  }

  async function processScanValue(
    rawValue: string
  ) {
    const value =
      rawValue.trim();

    resetResults();

    if (!value) {
      setErrorMessage(
        "Scan value is required."
      );

      return;
    }

    const parsed =
      parseScanValue(value);

    let entityType: ScanEntityType;

    if (
      scanMode === "auto"
    ) {
      entityType =
        parsed.type;
    } else {
      entityType =
        scanMode;
    }

    if (
      entityType ===
      "unknown"
    ) {
      setErrorMessage(
        "This QR value is not a valid Modulex warehouse, zone, location, SKU, or barcode."
      );

      return;
    }

    setIsLoading(true);

    try {
      /*
       * ---------------------------------------
       * WAREHOUSE
       * ---------------------------------------
       */
      if (
        entityType ===
        "warehouse"
      ) {
        const {
          warehouse,
          error,
        } =
          await findWarehouse(
            value,
            parsed
          );

        if (error) {
          setErrorMessage(
            error
          );
          return;
        }

        if (!warehouse) {
          setErrorMessage(
            "No warehouse found for this QR or warehouse code."
          );
          return;
        }

        setWarehouseResult(
          warehouse
        );

        return;
      }

      /*
       * ---------------------------------------
       * ZONE
       * ---------------------------------------
       */
      if (
        entityType === "zone"
      ) {
        const {
          zone,
          error,
        } =
          await findZone(
            value,
            parsed
          );

        if (error) {
          setErrorMessage(
            error
          );
          return;
        }

        if (!zone) {
          setErrorMessage(
            "No zone found for this QR or zone code."
          );
          return;
        }

        setZoneResult(zone);

        return;
      }

      /*
       * ---------------------------------------
       * LOCATION
       * ---------------------------------------
       */
      if (
        entityType ===
        "location"
      ) {
        const {
          location,
          error,
        } =
          await findLocation(
            value,
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
            "No location found for this QR or location code."
          );
          return;
        }

        setLocationResult(
          location
        );

        const {
          rows,
          error:
          inventoryError,
        } =
          await loadLocationInventory(
            location
          );

        if (
          inventoryError
        ) {
          setErrorMessage(
            inventoryError
          );
          return;
        }

        setLocationInventory(
          rows
        );

        /*
         * Only product/location scans
         * are sent to Guided Stock
         * Operation.
         *
         * Warehouse and Zone QR scans
         * are informational.
         */
        pushWorkflowScan(
          location.qr_payload ||
          location.qr_code ||
          value
        );

        return;
      }

      /*
       * ---------------------------------------
       * PRODUCT
       * ---------------------------------------
       */
      if (
        entityType ===
        "product"
      ) {
        const productQuery =
          scanMode ===
            "product"
            ? value
            : parsed.productQuery ||
            value;

        const {
          product,
          error,
        } =
          await findProduct(
            productQuery
          );

        if (error) {
          setErrorMessage(
            error
          );
          return;
        }

        if (!product) {
          setErrorMessage(
            "No product found for this SKU or barcode."
          );
          return;
        }

        setProductResult(
          product
        );

        const {
          rows,
          error:
          stockError,
        } =
          await loadProductStock(
            product
          );

        if (stockError) {
          setErrorMessage(
            stockError
          );
          return;
        }

        setProductStock(rows);

        pushWorkflowScan(
          productQuery
        );

        return;
      }

      setErrorMessage(
        "Scan type could not be detected."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleScan(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    await processScanValue(
      scanValue
    );
  }

  async function handleCameraScan(
    decodedText: string
  ) {
    setScanValue(
      decodedText
    );

    await processScanValue(
      decodedText
    );
  }

  const hasResult =
    warehouseResult ||
    zoneResult ||
    locationResult ||
    productResult;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* LEFT */}
      <div className="space-y-6 xl:col-span-5">
        <CameraScanner
          onScanSuccess={
            handleCameraScan
          }
        />

        {/* MANUAL SCAN */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Manual Scan Input
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Paste or enter a
              Warehouse, Zone,
              Location QR payload,
              product SKU, or
              barcode.
            </p>
          </div>

          <form
            onSubmit={handleScan}
            className="space-y-5 p-5"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Scan Mode
              </label>

              <select
                value={scanMode}
                onChange={(
                  event
                ) => {
                  setScanMode(
                    event.target
                      .value as ScanMode
                  );

                  resetResults();
                }}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="auto">
                  Auto Detect
                </option>

                <option value="warehouse">
                  Warehouse
                </option>

                <option value="zone">
                  Zone
                </option>

                <option value="location">
                  Location
                </option>

                <option value="product">
                  Product SKU /
                  Barcode
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Scan Value
              </label>

              <textarea
                value={scanValue}
                onChange={(
                  event
                ) =>
                  setScanValue(
                    event.target
                      .value
                  )
                }
                rows={4}
                placeholder="Example: WH|MAIN, ZONE|MAIN|B, LOC|MAIN|B|B-01-01, SKU-0001"
                className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 font-mono text-sm text-gray-800 placeholder:font-sans placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isLoading
              }
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading
                ? "Scanning..."
                : "Run Scan"}
            </button>

            {/* TEST VALUES */}
            <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Scan examples
              </p>

              <div className="mt-3 space-y-3 text-xs text-gray-500 dark:text-gray-400">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Warehouse
                  </span>

                  <p className="mt-0.5 font-mono">
                    WH|MAIN
                  </p>
                </div>

                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Zone
                  </span>

                  <p className="mt-0.5 font-mono">
                    ZONE|MAIN|B
                  </p>
                </div>

                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Location
                  </span>

                  <p className="mt-0.5 font-mono">
                    LOC|MAIN|B|B-01-01
                  </p>
                </div>

                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Product
                  </span>

                  <p className="mt-0.5">
                    SKU or barcode
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* RIGHT */}
      <div className="space-y-6 xl:col-span-7">
        <GuidedStockOperation
          scannedValue={
            workflowScan.value
          }
          scanNonce={
            workflowScan.nonce
          }
        />

        {/* WAREHOUSE RESULT */}
        {warehouseResult && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Warehouse Found
                  </h3>

                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                      warehouseResult.is_active
                    )}`}
                  >
                    {warehouseResult.is_active
                      ? "Active"
                      : "Inactive"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Warehouse QR
                  successfully
                  identified.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/zones?warehouse=${warehouseResult.warehouse_id}`}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  View Zones
                </Link>

                <Link
                  href={`/locations?warehouse=${warehouseResult.warehouse_id}`}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600"
                >
                  View Locations
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Warehouse
                </p>

                <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
                  {
                    warehouseResult.code
                  }{" "}
                  —{" "}
                  {
                    warehouseResult.name
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Type
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {formatWarehouseType(
                    warehouseResult.warehouse_type
                  )}
                </p>
              </div>

              {warehouseResult.description && (
                <div className="md:col-span-2">
                  <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                    Description
                  </p>

                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    {
                      warehouseResult.description
                    }
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Location
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {[
                    warehouseResult.address,
                    warehouseResult.city,
                    warehouseResult.country,
                  ]
                    .filter(Boolean)
                    .join(", ") ||
                    "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  QR Identity
                </p>

                <p className="mt-1 break-all font-mono text-xs font-semibold text-gray-800 dark:text-white/90">
                  {warehouseResult.qr_code ||
                    "-"}
                </p>

                <p className="mt-1 break-all font-mono text-[11px] text-gray-500 dark:text-gray-400">
                  {warehouseResult.qr_payload ||
                    "-"}
                </p>
              </div>
            </div>

            {/* WAREHOUSE SUMMARY */}
            <div className="grid grid-cols-2 gap-px border-t border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800 md:grid-cols-5">
              {[
                {
                  label: "Zones",
                  value:
                    warehouseResult.zone_count,
                },
                {
                  label:
                    "Locations",
                  value:
                    warehouseResult.location_count,
                },
                {
                  label:
                    "Total Stock",
                  value:
                    warehouseResult.total_quantity,
                },
                {
                  label:
                    "Available",
                  value:
                    warehouseResult.total_available_quantity,
                },
                {
                  label:
                    "Reserved",
                  value:
                    warehouseResult.total_reserved_quantity,
                },
              ].map(
                (item) => (
                  <div
                    key={
                      item.label
                    }
                    className="bg-white p-4 dark:bg-gray-900"
                  >
                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
          </div>
        )}

        {/* ZONE RESULT */}
        {zoneResult && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Zone Found
                  </h3>

                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                      zoneResult.is_active
                    )}`}
                  >
                    {zoneResult.is_active
                      ? "Active"
                      : "Inactive"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Warehouse zone
                  successfully
                  identified.
                </p>
              </div>

              <Link
                href={`/locations?zone=${zoneResult.zone_id}`}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600"
              >
                View Locations
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Warehouse
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {
                    zoneResult.warehouse_code
                  }{" "}
                  —{" "}
                  {
                    zoneResult.warehouse_name
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Zone
                </p>

                <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
                  {
                    zoneResult.code
                  }{" "}
                  —{" "}
                  {
                    zoneResult.name
                  }
                </p>
              </div>

              {zoneResult.description && (
                <div className="md:col-span-2">
                  <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                    Description
                  </p>

                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    {
                      zoneResult.description
                    }
                  </p>
                </div>
              )}

              <div className="md:col-span-2 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  QR Code
                </p>

                <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                  {zoneResult.qr_code ||
                    "-"}
                </p>

                <p className="mt-4 text-xs uppercase text-gray-500 dark:text-gray-400">
                  QR Payload
                </p>

                <p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                  {zoneResult.qr_payload ||
                    "-"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800 md:grid-cols-5">
              {[
                {
                  label:
                    "Locations",
                  value:
                    zoneResult.location_count,
                },
                {
                  label:
                    "Product Positions",
                  value:
                    zoneResult.product_positions,
                },
                {
                  label:
                    "Total Stock",
                  value:
                    zoneResult.total_quantity,
                },
                {
                  label:
                    "Available",
                  value:
                    zoneResult.total_available_quantity,
                },
                {
                  label:
                    "Reserved",
                  value:
                    zoneResult.total_reserved_quantity,
                },
              ].map(
                (item) => (
                  <div
                    key={
                      item.label
                    }
                    className="bg-white p-4 dark:bg-gray-900"
                  >
                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
          </div>
        )}

        {/* LOCATION RESULT */}
        {locationResult && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Shelf Location
                    Found
                  </h3>

                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                      locationResult.is_active
                    )}`}
                  >
                    {locationResult.is_active
                      ? "Active"
                      : "Inactive"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Location details
                  and current stock
                  content.
                </p>
              </div>

              <Link
                href={`/locations/${locationResult.location_id}/edit`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Edit Location
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Warehouse
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {
                    locationResult.warehouse_code
                  }{" "}
                  —{" "}
                  {
                    locationResult.warehouse_name
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Zone
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {locationResult.zone_code ||
                    "-"}

                  {locationResult.zone_name
                    ? ` — ${locationResult.zone_name}`
                    : ""}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Location
                </p>

                <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
                  {
                    locationResult.location_code
                  }{" "}
                  —{" "}
                  {
                    locationResult.location_name
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Type
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {formatLocationType(
                    locationResult.location_type
                  )}
                </p>
              </div>

              <div className="md:col-span-2 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  QR Code
                </p>

                <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                  {locationResult.qr_code ||
                    "-"}
                </p>

                <p className="mt-4 text-xs uppercase text-gray-500 dark:text-gray-400">
                  QR Payload
                </p>

                <p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                  {locationResult.qr_payload ||
                    "-"}
                </p>
              </div>
            </div>

            {/* LOCATION INVENTORY */}
            <div className="border-t border-gray-200 p-5 dark:border-gray-800">
              <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                Current Shelf
                Inventory
              </h4>

              {locationInventory.length ===
                0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This shelf is
                  currently empty.
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

                            <td className="py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                              {formatNumber(
                                item.quantity
                              )}
                            </td>

                            <td className="py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                              {formatNumber(
                                item.reserved_quantity
                              )}
                            </td>

                            <td className="py-3 text-right text-sm font-medium text-gray-800 dark:text-white/90">
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
            </div>
          </div>
        )}

        {/* PRODUCT RESULT */}
        {productResult && (
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  Product Found
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Product details and
                  current stock
                  positions.
                </p>
              </div>

              <Link
                href={`/products/${productResult.product_id}/edit`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Edit Product
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  SKU
                </p>

                <p className="mt-1 font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                  {
                    productResult.sku
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Barcode
                </p>

                <p className="mt-1 font-mono text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.barcode ||
                    "-"}
                </p>
              </div>

              <div className="md:col-span-2">
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Product
                </p>

                <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
                  {
                    productResult.product_name
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Brand
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.brand ||
                    "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Category
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {productResult.category ||
                    "-"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Unit
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {
                    productResult.unit
                  }
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Status
                </p>

                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {formatStatus(
                    productResult.product_status
                  )}
                </p>
              </div>
            </div>

            {/* PRODUCT STOCK */}
            <div className="border-t border-gray-200 p-5 dark:border-gray-800">
              <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                Stock by Location
              </h4>

              {productStock.length ===
                0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This product
                  currently has no
                  stock positions.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead>
                      <tr>
                        <th className="py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Location
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
                      {productStock.map(
                        (
                          stock,
                          index
                        ) => (
                          <tr
                            key={`${stock.inventory_id}-${stock.location_id}-${index}`}
                          >
                            <td className="py-3 pr-4">
                              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
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

                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {
                                  stock.location_name
                                }
                              </p>
                            </td>

                            <td className="py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                              {formatNumber(
                                stock.quantity
                              )}
                            </td>

                            <td className="py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                              {formatNumber(
                                stock.reserved_quantity
                              )}
                            </td>

                            <td className="py-3 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                              {formatNumber(
                                stock.available_quantity
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EMPTY RESULT */}
        {!hasResult &&
          !errorMessage &&
          !isLoading && (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mx-auto max-w-md">
                <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Ready to Scan
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Scan a warehouse,
                  zone, shelf location,
                  product SKU, or
                  barcode to view its
                  details.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2 text-left text-xs">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      Warehouse
                    </p>

                    <p className="mt-1 font-mono text-gray-500">
                      WH|MAIN
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      Zone
                    </p>

                    <p className="mt-1 font-mono text-gray-500">
                      ZONE|MAIN|B
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      Location
                    </p>

                    <p className="mt-1 font-mono text-gray-500">
                      LOC|...
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      Product
                    </p>

                    <p className="mt-1 text-gray-500">
                      SKU / Barcode
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}