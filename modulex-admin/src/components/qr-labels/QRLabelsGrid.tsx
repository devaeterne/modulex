"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase/client";

type LabelType = "all" | "zone" | "location";

type BulkPrinterMode =
  | "a4"
  | "label";

type LabelSizeKey =
  | "50x30"
  | "60x40"
  | "70x50";

type A4LabelSizeKey =
  | "small"
  | "medium"
  | "large";

type PrintJob =
  | {
    kind: "bulk";
  }
  | {
    kind: "single-label";
    label: QRLabel;
  }
  | {
    kind: "single-a4";
    label: QRLabel;
  }
  | null;

type QRLabel = {
  id: string;

  type: "zone" | "location";

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;

  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;

  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
  location_type: string | null;

  qr_code: string;
  qr_payload: string;

  title: string;
  subtitle: string;
};

const LABEL_SIZES = {
  "50x30": {
    width: 50,
    height: 30,
    qr: 20,
    label: "50 × 30 mm",
  },

  "60x40": {
    width: 60,
    height: 40,
    qr: 27,
    label: "60 × 40 mm",
  },

  "70x50": {
    width: 70,
    height: 50,
    qr: 32,
    label: "70 × 50 mm",
  },
} satisfies Record<
  LabelSizeKey,
  {
    width: number;
    height: number;
    qr: number;
    label: string;
  }
>;

const A4_LABEL_SIZES = {
  small: {
    label: "Small",
    width: 60,
    minHeight: 42,
    columns: 3,
    qr: 27,
  },

  medium: {
    label: "Medium",
    width: 90,
    minHeight: 62,
    columns: 2,
    qr: 38,
  },

  large: {
    label: "Large",
    width: 185,
    minHeight: 95,
    columns: 1,
    qr: 55,
  },
} satisfies Record<
  A4LabelSizeKey,
  {
    label: string;
    width: number;
    minHeight: number;
    columns: number;
    qr: number;
  }
>;

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

function buildZoneQrCode(
  warehouseCode: string,
  zoneCode: string
) {
  return `ZONE-${normalizeCode(
    warehouseCode
  )}-${normalizeCode(zoneCode)}`;
}

function buildZoneQrPayload(
  warehouseCode: string,
  zoneCode: string
) {
  return `ZONE|${normalizeCode(
    warehouseCode
  )}|${normalizeCode(zoneCode)}`;
}

function buildLocationQrCode(
  warehouseCode: string,
  zoneCode: string,
  locationCode: string
) {
  return `LOC-${normalizeCode(
    warehouseCode
  )}-${normalizeCode(
    zoneCode
  )}-${normalizeCode(locationCode)}`;
}

function buildLocationQrPayload(
  warehouseCode: string,
  zoneCode: string,
  locationCode: string
) {
  return `LOC|${normalizeCode(
    warehouseCode
  )}|${normalizeCode(
    zoneCode
  )}|${normalizeCode(locationCode)}`;
}

function formatLocationType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function getPrimaryCode(label: QRLabel) {
  if (
    label.type === "location" &&
    label.location_code
  ) {
    return label.location_code;
  }

  return label.zone_code ?? "";
}

export default function QRLabelsGrid() {
  const [labels, setLabels] = useState<
    QRLabel[]
  >([]);

  const [query, setQuery] = useState("");

  const [labelType, setLabelType] =
    useState<LabelType>("all");

  const [warehouseId, setWarehouseId] =
    useState("");

  const [
    bulkPrinterMode,
    setBulkPrinterMode,
  ] =
    useState<BulkPrinterMode>("a4");

  const [labelSize, setLabelSize] =
    useState<LabelSizeKey>("60x40");

  const [
    a4LabelSize,
    setA4LabelSize,
  ] =
    useState<A4LabelSizeKey>("medium");

  const [
    selectedLabel,
    setSelectedLabel,
  ] =
    useState<QRLabel | null>(null);

  const [
    singleLabelSize,
    setSingleLabelSize,
  ] =
    useState<LabelSizeKey>("60x40");

  const [printJob, setPrintJob] =
    useState<PrintJob>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(null);

  async function loadLabels() {
    setIsLoading(true);
    setErrorMessage(null);

    const [
      {
        data: zoneData,
        error: zoneError,
      },
      {
        data: locationData,
        error: locationError,
      },
    ] = await Promise.all([
      supabase
        .from("zones")
        .select(`
          id,
          warehouse_id,
          code,
          name,
          qr_code,
          qr_payload,
          is_active,
          warehouses (
            id,
            code,
            name
          )
        `)
        .eq("is_active", true),

      supabase
        .from("locations")
        .select(`
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
        `)
        .eq("is_active", true),
    ]);

    if (zoneError) {
      setErrorMessage(zoneError.message);
      setLabels([]);
      setIsLoading(false);
      return;
    }

    if (locationError) {
      setErrorMessage(
        locationError.message
      );

      setLabels([]);
      setIsLoading(false);
      return;
    }

    const zoneLabels: QRLabel[] =
      zoneData?.flatMap((zone: any) => {
        const warehouseRaw =
          Array.isArray(zone.warehouses)
            ? zone.warehouses[0]
            : zone.warehouses;

        if (!warehouseRaw) {
          return [];
        }

        return [
          {
            id: `zone-${zone.id}`,

            type: "zone",

            warehouse_id:
              zone.warehouse_id,

            warehouse_code:
              warehouseRaw.code,

            warehouse_name:
              warehouseRaw.name,

            zone_id: zone.id,
            zone_code: zone.code,
            zone_name: zone.name,

            location_id: null,
            location_code: null,
            location_name: null,
            location_type: null,

            qr_code:
              zone.qr_code ||
              buildZoneQrCode(
                warehouseRaw.code,
                zone.code
              ),

            qr_payload:
              zone.qr_payload ||
              buildZoneQrPayload(
                warehouseRaw.code,
                zone.code
              ),

            title: `${warehouseRaw.code} / ${zone.code}`,

            subtitle: zone.name,
          },
        ];
      }) ?? [];

    const locationLabels: QRLabel[] =
      locationData?.flatMap(
        (location: any) => {
          const warehouseRaw =
            Array.isArray(
              location.warehouses
            )
              ? location.warehouses[0]
              : location.warehouses;

          const zoneRaw =
            Array.isArray(
              location.zones
            )
              ? location.zones[0]
              : location.zones;

          if (
            !warehouseRaw ||
            !zoneRaw
          ) {
            return [];
          }

          return [
            {
              id: `location-${location.id}`,

              type: "location",

              warehouse_id:
                location.warehouse_id,

              warehouse_code:
                warehouseRaw.code,

              warehouse_name:
                warehouseRaw.name,

              zone_id:
                location.zone_id,

              zone_code:
                zoneRaw.code,

              zone_name:
                zoneRaw.name,

              location_id:
                location.id,

              location_code:
                location.code,

              location_name:
                location.name,

              location_type:
                location.location_type,

              qr_code:
                location.qr_code?.startsWith(
                  "LOC-"
                )
                  ? location.qr_code
                  : buildLocationQrCode(
                    warehouseRaw.code,
                    zoneRaw.code,
                    location.code
                  ),

              qr_payload:
                location.qr_payload ||
                buildLocationQrPayload(
                  warehouseRaw.code,
                  zoneRaw.code,
                  location.code
                ),

              title: `${warehouseRaw.code} / ${zoneRaw.code} / ${location.code}`,

              subtitle:
                location.name,
            },
          ];
        }
      ) ?? [];

    const combined = [
      ...zoneLabels,
      ...locationLabels,
    ];

    combined.sort((a, b) => {
      const warehouseComparison =
        a.warehouse_code.localeCompare(
          b.warehouse_code
        );

      if (
        warehouseComparison !== 0
      ) {
        return warehouseComparison;
      }

      const zoneComparison = (
        a.zone_code ?? ""
      ).localeCompare(
        b.zone_code ?? ""
      );

      if (zoneComparison !== 0) {
        return zoneComparison;
      }

      if (a.type !== b.type) {
        return a.type === "zone"
          ? -1
          : 1;
      }

      return (
        a.location_code ?? ""
      ).localeCompare(
        b.location_code ?? ""
      );
    });

    setLabels(combined);
    setIsLoading(false);
  }

  useEffect(() => {
    loadLabels();
  }, []);

  useEffect(() => {
    function handleAfterPrint() {
      setPrintJob(null);
    }

    window.addEventListener(
      "afterprint",
      handleAfterPrint
    );

    return () => {
      window.removeEventListener(
        "afterprint",
        handleAfterPrint
      );
    };
  }, []);

  const warehouses = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
      }
    >();

    for (const label of labels) {
      if (
        !map.has(label.warehouse_id)
      ) {
        map.set(label.warehouse_id, {
          id: label.warehouse_id,
          code: label.warehouse_code,
          name: label.warehouse_name,
        });
      }
    }

    return Array.from(
      map.values()
    ).sort((a, b) =>
      a.code.localeCompare(b.code)
    );
  }, [labels]);

  const filteredLabels = useMemo(() => {
    const search =
      query.trim().toLowerCase();

    return labels.filter((label) => {
      if (
        labelType !== "all" &&
        label.type !== labelType
      ) {
        return false;
      }

      if (
        warehouseId &&
        label.warehouse_id !==
        warehouseId
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        label.type,
        label.warehouse_code,
        label.warehouse_name,
        label.zone_code,
        label.zone_name,
        label.location_code,
        label.location_name,
        label.location_type,
        label.qr_code,
        label.qr_payload,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(search)
        );
    });
  }, [
    labels,
    query,
    labelType,
    warehouseId,
  ]);

  function runPrint(job: PrintJob) {
    if (!job) {
      return;
    }

    setPrintJob(job);
    setErrorMessage(null);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  function handleBulkPrint() {
    if (
      filteredLabels.length === 0
    ) {
      setErrorMessage(
        "There are no labels to print."
      );

      return;
    }

    runPrint({
      kind: "bulk",
    });
  }

  function openPrintOptions(
    label: QRLabel
  ) {
    setSelectedLabel(label);
  }

  const selectedBulkLabelSize =
    LABEL_SIZES[labelSize];

  const selectedSingleLabelSize =
    LABEL_SIZES[singleLabelSize];

  const selectedA4Size =
    A4_LABEL_SIZES[a4LabelSize];

  const printStyles = useMemo(() => {
    let pageRule =
      "@page { size: A4 portrait; margin: 10mm; }";

    if (
      printJob?.kind ===
      "single-a4"
    ) {
      pageRule =
        "@page { size: A4 portrait; margin: 0; }";
    }

    if (
      printJob?.kind ===
      "single-label" ||
      (printJob?.kind === "bulk" &&
        bulkPrinterMode ===
        "label")
    ) {
      const size =
        printJob?.kind ===
          "single-label"
          ? selectedSingleLabelSize
          : selectedBulkLabelSize;

      pageRule = `
        @page {
          size: ${size.width}mm ${size.height}mm;
          margin: 0;
        }
      `;
    }

    return `
      ${pageRule}

      .modulex-print-root {
        display: none;
      }

      @media print {
        html,
        body {
          background: #ffffff !important;
        }

        body * {
          visibility: hidden !important;
        }

        .modulex-print-root,
        .modulex-print-root * {
          visibility: visible !important;
        }

        .modulex-print-root {
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          background: #ffffff !important;
          color: #000000 !important;
        }

        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
  }, [
    printJob,
    bulkPrinterMode,
    selectedBulkLabelSize,
    selectedSingleLabelSize,
  ]);

  function renderCompactLabel(
    label: QRLabel,
    qrSize = 128
  ) {
    return (
      <div className="flex h-full items-center gap-4">
        <div className="shrink-0 bg-white p-1">
          <QRCodeSVG
            value={label.qr_payload}
            size={qrSize}
            level="M"
            includeMargin={false}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 print:text-black">
            {label.type === "zone"
              ? "Zone"
              : "Location"}
          </p>

          <h4 className="mt-1 text-lg font-bold text-gray-900 print:text-black">
            {label.title}
          </h4>

          <p className="mt-1 text-sm font-medium text-gray-600 print:text-black">
            {label.subtitle}
          </p>

          <p className="mt-3 break-all font-mono text-xs font-bold text-gray-800 print:text-black">
            {label.qr_code}
          </p>
        </div>
      </div>
    );
  }

  function renderSingleA4(
    label: QRLabel
  ) {
    const primaryCode =
      getPrimaryCode(label);

    return (
      <div
        style={{
          width: "210mm",
          height: "297mm",
          padding: "15mm",
          boxSizing: "border-box",
        }}
        className="flex flex-col items-center justify-between bg-white text-black"
      >
        <div className="w-full text-center">
          <p className="text-lg font-bold uppercase tracking-[0.3em]">
            {label.type ===
              "location"
              ? "Shelf Location"
              : "Warehouse Zone"}
          </p>

          <p className="mt-4 text-3xl font-semibold">
            {label.warehouse_name}
          </p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <p
            className="font-black leading-none"
            style={{
              fontSize:
                primaryCode.length > 12
                  ? "52pt"
                  : "72pt",
            }}
          >
            {primaryCode}
          </p>

          <p className="mt-4 text-2xl font-bold">
            {label.subtitle}
          </p>

          <p className="mt-2 text-xl">
            {label.title}
          </p>

          <div className="mt-10 bg-white p-5">
            <QRCodeSVG
              value={label.qr_payload}
              size={430}
              level="M"
              includeMargin={false}
            />
          </div>

          <p className="mt-8 font-mono text-xl font-bold">
            {label.qr_code}
          </p>
        </div>

        <div className="w-full border-t border-black pt-5 text-center">
          <p className="text-sm">
            Scan QR code to identify this{" "}
            {label.type ===
              "location"
              ? "shelf location"
              : "warehouse zone"}
            .
          </p>

          <p className="mt-2 font-mono text-xs">
            {label.qr_payload}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{printStyles}</style>

      <div className="space-y-6 print:hidden">
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  QR Labels
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Print individual or bulk
                  QR labels for warehouse
                  zones and shelf
                  locations.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleBulkPrint
                }
                disabled={
                  filteredLabels.length ===
                  0
                }
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print All (
                {filteredLabels.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Label Type
              </label>

              <select
                value={labelType}
                onChange={(event) =>
                  setLabelType(
                    event.target
                      .value as LabelType
                  )
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="all">
                  Zones + Locations
                </option>

                <option value="zone">
                  Zone Labels
                </option>

                <option value="location">
                  Location Labels
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Warehouse
              </label>

              <select
                value={warehouseId}
                onChange={(event) =>
                  setWarehouseId(
                    event.target.value
                  )
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">
                  All Warehouses
                </option>

                {warehouses.map(
                  (warehouse) => (
                    <option
                      key={warehouse.id}
                      value={warehouse.id}
                    >
                      {warehouse.code} —{" "}
                      {warehouse.name}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Bulk Print
              </label>

              <select
                value={
                  bulkPrinterMode
                }
                onChange={(event) =>
                  setBulkPrinterMode(
                    event.target
                      .value as BulkPrinterMode
                  )
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="a4">
                  A4 Sheet
                </option>

                <option value="label">
                  Label Printer
                </option>
              </select>
            </div>

            {bulkPrinterMode ===
              "label" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Label Size
                </label>

                <select
                  value={labelSize}
                  onChange={(event) =>
                    setLabelSize(
                      event.target
                        .value as LabelSizeKey
                    )
                  }
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                >
                  {Object.entries(
                    LABEL_SIZES
                  ).map(
                    ([key, size]) => (
                      <option
                        key={key}
                        value={key}
                      >
                        {size.label}
                      </option>
                    )
                  )}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  A4 Label Size
                </label>

                <select
                  value={a4LabelSize}
                  onChange={(event) =>
                    setA4LabelSize(
                      event.target
                        .value as A4LabelSizeKey
                    )
                  }
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                >
                  {Object.entries(
                    A4_LABEL_SIZES
                  ).map(
                    ([key, size]) => (
                      <option
                        key={key}
                        value={key}
                      >
                        {size.label}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            <div className="md:col-span-2 xl:col-span-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Search
              </label>

              <div className="flex gap-3">
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value
                    )
                  }
                  placeholder="Search warehouse, zone, shelf or QR..."
                  className="h-11 flex-1 rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                />

                <button
                  type="button"
                  onClick={loadLabels}
                  className="rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            Loading QR labels...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredLabels.map(
              (label) => (
                <div
                  key={label.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                >
                  {renderCompactLabel(
                    label
                  )}

                  <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {label.type ===
                        "zone"
                        ? "Zone label"
                        : "Shelf label"}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        openPrintOptions(
                          label
                        )
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-50 px-4 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
                    >
                      Print
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {selectedLabel && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Print Label
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                {selectedLabel.title}
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <h4 className="font-semibold text-gray-800 dark:text-white">
                  Standard Label
                </h4>

                <p className="mt-1 text-xs text-gray-500">
                  For label printers or
                  adhesive shelf labels.
                </p>

                <select
                  value={
                    singleLabelSize
                  }
                  onChange={(event) =>
                    setSingleLabelSize(
                      event.target
                        .value as LabelSizeKey
                    )
                  }
                  className="mt-4 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                >
                  {Object.entries(
                    LABEL_SIZES
                  ).map(
                    ([key, size]) => (
                      <option
                        key={key}
                        value={key}
                      >
                        {size.label}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    runPrint({
                      kind: "single-label",
                      label:
                        selectedLabel,
                    })
                  }
                  className="mt-3 h-10 w-full rounded-lg bg-brand-500 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Print Standard Label
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <h4 className="font-semibold text-gray-800 dark:text-white">
                  A4 Full Page / Shelf
                  Sign
                </h4>

                <p className="mt-1 text-xs text-gray-500">
                  Large QR and large
                  shelf/zone code for
                  attaching directly to
                  warehouse racks.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    runPrint({
                      kind: "single-a4",
                      label:
                        selectedLabel,
                    })
                  }
                  className="mt-4 h-10 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                >
                  Print A4 Shelf Sign
                </button>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() =>
                  setSelectedLabel(null)
                }
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="modulex-print-root">
        {printJob?.kind ===
          "single-a4" &&
          renderSingleA4(
            printJob.label
          )}

        {printJob?.kind ===
          "single-label" && (
            <div
              style={{
                width: `${selectedSingleLabelSize.width}mm`,
                height: `${selectedSingleLabelSize.height}mm`,
                boxSizing: "border-box",
                padding: "3mm",
              }}
            >
              {renderCompactLabel(
                printJob.label,
                110
              )}
            </div>
          )}

        {printJob?.kind ===
          "bulk" &&
          bulkPrinterMode ===
          "label" && (
            <div>
              {filteredLabels.map(
                (label) => (
                  <div
                    key={label.id}
                    style={{
                      width: `${selectedBulkLabelSize.width}mm`,
                      height: `${selectedBulkLabelSize.height}mm`,
                      boxSizing:
                        "border-box",
                      padding: "3mm",
                      pageBreakAfter:
                        "always",
                      breakAfter: "page",
                    }}
                  >
                    {renderCompactLabel(
                      label,
                      110
                    )}
                  </div>
                )
              )}
            </div>
          )}

        {printJob?.kind ===
          "bulk" &&
          bulkPrinterMode ===
          "a4" && (
            <div
              style={{
                width: "190mm",
                display: "grid",
                gridTemplateColumns: `repeat(${selectedA4Size.columns}, 1fr)`,
                gap: "4mm",
              }}
            >
              {filteredLabels.map(
                (label) => (
                  <div
                    key={label.id}
                    style={{
                      minHeight: `${selectedA4Size.minHeight}mm`,
                      padding: "4mm",
                      border:
                        "1px solid black",
                      boxSizing:
                        "border-box",
                      breakInside:
                        "avoid",
                    }}
                  >
                    {renderCompactLabel(
                      label,
                      selectedA4Size.qr *
                      3.78
                    )}
                  </div>
                )
              )}
            </div>
          )}
      </div>
    </>
  );
}