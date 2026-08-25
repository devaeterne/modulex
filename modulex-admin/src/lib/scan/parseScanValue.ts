export type ScanEntityType =
  | "warehouse"
  | "zone"
  | "location"
  | "product"
  | "unknown";

export type ParsedScanValue = {
  type: ScanEntityType;

  raw: string;
  normalized: string;

  warehouseCode?: string;
  zoneCode?: string;
  locationCode?: string;

  productQuery?: string;

  format:
    | "warehouse_payload"
    | "warehouse_code"
    | "zone_payload"
    | "zone_code"
    | "location_payload"
    | "location_code"
    | "location_path"
    | "product"
    | "unknown";
};

function normalizePart(
  value: string
) {
  return value
    .trim()
    .toUpperCase();
}

function cleanRawValue(
  value: string
) {
  return value.trim();
}

/**
 * Canonical Modulex QR formats
 *
 * Warehouse:
 *   WH|MAIN
 *   WH-MAIN
 *
 * Zone:
 *   ZONE|MAIN|B
 *   ZONE-MAIN-B
 *
 * Location:
 *   LOC|MAIN|B|B-01-01
 *   LOC-MAIN-B-B-01-01
 *
 * Product:
 *   SKU
 *   Barcode
 *   Existing product QR value
 *
 * Pipe-based payloads are authoritative because
 * hierarchy segments can be parsed without ambiguity.
 */
export function parseScanValue(
  input: string
): ParsedScanValue {
  const raw = cleanRawValue(input);

  if (!raw) {
    return {
      type: "unknown",
      raw: "",
      normalized: "",
      format: "unknown",
    };
  }

  const normalized =
    raw.toUpperCase();

  /**
   * --------------------------------------------------
   * WAREHOUSE PAYLOAD
   * WH|MAIN
   * --------------------------------------------------
   */
  if (
    normalized.startsWith("WH|")
  ) {
    const parts = raw
      .split("|")
      .map(normalizePart)
      .filter(Boolean);

    if (
      parts.length === 2 &&
      parts[0] === "WH" &&
      parts[1]
    ) {
      return {
        type: "warehouse",

        raw,
        normalized,

        warehouseCode:
          parts[1],

        format:
          "warehouse_payload",
      };
    }

    return {
      type: "unknown",
      raw,
      normalized,
      format: "unknown",
    };
  }

  /**
   * --------------------------------------------------
   * ZONE PAYLOAD
   * ZONE|MAIN|B
   * --------------------------------------------------
   */
  if (
    normalized.startsWith(
      "ZONE|"
    )
  ) {
    const parts = raw
      .split("|")
      .map(normalizePart)
      .filter(Boolean);

    if (
      parts.length === 3 &&
      parts[0] === "ZONE" &&
      parts[1] &&
      parts[2]
    ) {
      return {
        type: "zone",

        raw,
        normalized,

        warehouseCode:
          parts[1],

        zoneCode:
          parts[2],

        format:
          "zone_payload",
      };
    }

    return {
      type: "unknown",
      raw,
      normalized,
      format: "unknown",
    };
  }

  /**
   * --------------------------------------------------
   * LOCATION PAYLOAD
   * LOC|MAIN|B|B-01-01
   * --------------------------------------------------
   */
  if (
    normalized.startsWith(
      "LOC|"
    )
  ) {
    const parts = raw
      .split("|")
      .map(normalizePart);

    if (
      parts.length === 4 &&
      parts[0] === "LOC" &&
      parts[1] &&
      parts[2] &&
      parts[3]
    ) {
      return {
        type: "location",

        raw,
        normalized,

        warehouseCode:
          parts[1],

        zoneCode:
          parts[2],

        locationCode:
          parts[3],

        format:
          "location_payload",
      };
    }

    return {
      type: "unknown",
      raw,
      normalized,
      format: "unknown",
    };
  }

  /**
   * --------------------------------------------------
   * HUMAN-READABLE WAREHOUSE QR CODE
   * WH-MAIN
   *
   * We can safely remove only the WH- prefix.
   * --------------------------------------------------
   */
  if (
    normalized.startsWith("WH-")
  ) {
    const warehouseCode =
      normalizePart(
        raw.substring(3)
      );

    if (warehouseCode) {
      return {
        type: "warehouse",

        raw,
        normalized,

        warehouseCode,

        format:
          "warehouse_code",
      };
    }
  }

  /**
   * --------------------------------------------------
   * HUMAN-READABLE ZONE QR CODE
   * ZONE-MAIN-B
   *
   * Do not aggressively split the remaining string.
   * Warehouse codes may later contain hyphens.
   *
   * The resolver can first perform an exact qr_code
   * database lookup.
   * --------------------------------------------------
   */
  if (
    normalized.startsWith(
      "ZONE-"
    )
  ) {
    return {
      type: "zone",

      raw,
      normalized,

      format: "zone_code",
    };
  }

  /**
   * --------------------------------------------------
   * HUMAN-READABLE LOCATION QR CODE
   * LOC-MAIN-B-B-01-01
   *
   * Same rule as zone codes:
   * use exact qr_code lookup instead of trying to
   * reconstruct hierarchy from hyphen positions.
   * --------------------------------------------------
   */
  if (
    normalized.startsWith(
      "LOC-"
    )
  ) {
    return {
      type: "location",

      raw,
      normalized,

      format:
        "location_code",
    };
  }

  /**
   * --------------------------------------------------
   * MANUAL HIERARCHY PATH
   *
   * MAIN / B / B-01-01
   * --------------------------------------------------
   */
  if (raw.includes("/")) {
    const parts = raw
      .split("/")
      .map(normalizePart)
      .filter(Boolean);

    if (parts.length === 3) {
      return {
        type: "location",

        raw,
        normalized,

        warehouseCode:
          parts[0],

        zoneCode:
          parts[1],

        locationCode:
          parts[2],

        format:
          "location_path",
      };
    }

    /**
     * Legacy display format:
     *
     * MAIN / B-01-01
     *
     * We know warehouse and location,
     * but not the zone.
     */
    if (parts.length === 2) {
      return {
        type: "location",

        raw,
        normalized,

        warehouseCode:
          parts[0],

        locationCode:
          parts[1],

        format:
          "location_path",
      };
    }
  }

  /**
   * --------------------------------------------------
   * PLAIN LOCATION CODE
   *
   * Examples:
   * B-01-01
   * A-02-04
   * RET-01-01
   *
   * Plain codes are supported for manual testing,
   * but hierarchy-aware payloads are preferred.
   * --------------------------------------------------
   */
  if (
    /^[A-Z0-9]+-\d{2}-\d{2}$/i.test(
      raw
    )
  ) {
    return {
      type: "location",

      raw,
      normalized,

      locationCode:
        normalizePart(raw),

      format:
        "location_code",
    };
  }

  /**
   * --------------------------------------------------
   * MALFORMED STRUCTURAL QR
   *
   * If a value clearly claims to be a Modulex
   * structural QR but does not match its expected
   * structure, do not accidentally treat it as
   * a product barcode/SKU.
   * --------------------------------------------------
   */
  if (
    normalized === "WH" ||
    normalized === "ZONE" ||
    normalized === "LOC" ||
    normalized.startsWith(
      "WH|"
    ) ||
    normalized.startsWith(
      "ZONE|"
    ) ||
    normalized.startsWith(
      "LOC|"
    )
  ) {
    return {
      type: "unknown",

      raw,
      normalized,

      format: "unknown",
    };
  }

  /**
   * --------------------------------------------------
   * PRODUCT
   *
   * Any remaining scanner input is treated as a
   * product lookup query.
   *
   * This preserves compatibility with:
   * - SKU
   * - barcode
   * - existing product QR values
   * --------------------------------------------------
   */
  return {
    type: "product",

    raw,
    normalized,

    productQuery: raw,

    format: "product",
  };
}

export function isWarehouseScan(
  value: string
) {
  return (
    parseScanValue(value).type ===
    "warehouse"
  );
}

export function isZoneScan(
  value: string
) {
  return (
    parseScanValue(value).type ===
    "zone"
  );
}

export function isLocationScan(
  value: string
) {
  return (
    parseScanValue(value).type ===
    "location"
  );
}

export function isProductScan(
  value: string
) {
  return (
    parseScanValue(value).type ===
    "product"
  );
}

export function getScanTypeLabel(
  type: ScanEntityType
) {
  switch (type) {
    case "warehouse":
      return "Warehouse";

    case "zone":
      return "Zone";

    case "location":
      return "Location";

    case "product":
      return "Product";

    default:
      return "Unknown";
  }
}