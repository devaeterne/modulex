"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { supabase } from "@/lib/supabase/client";

type LabelTypeFilter = "all" | "zone" | "location";
type BulkPrintMode = "a4" | "label";
type LabelSizeKey = "50x30" | "60x40" | "70x50";
type A4GridSizeKey = "small" | "medium" | "large";

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

type PrintJob =
  | { kind: "bulk" }
  | { kind: "single-label"; label: QRLabel }
  | { kind: "single-a4"; label: QRLabel }
  | null;

const LABEL_SIZES = {
  "50x30": { label: "50 × 30 mm", width: 50, height: 30, qr: 20 },
  "60x40": { label: "60 × 40 mm", width: 60, height: 40, qr: 27 },
  "70x50": { label: "70 × 50 mm", width: 70, height: 50, qr: 32 },
} satisfies Record<
  LabelSizeKey,
  { label: string; width: number; height: number; qr: number }
>;

const A4_GRID_SIZES = {
  small: { label: "Small", columns: 3, minHeight: 52, qr: 92 },
  medium: { label: "Medium", columns: 2, minHeight: 78, qr: 132 },
  large: { label: "Large", columns: 1, minHeight: 125, qr: 190 },
} satisfies Record<
  A4GridSizeKey,
  { label: string; columns: number; minHeight: number; qr: number }
>;

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

function buildZoneQrCode(warehouseCode: string, zoneCode: string) {
  return `ZONE-${normalizeCode(warehouseCode)}-${normalizeCode(zoneCode)}`;
}

function buildZoneQrPayload(warehouseCode: string, zoneCode: string) {
  return `ZONE|${normalizeCode(warehouseCode)}|${normalizeCode(zoneCode)}`;
}

function buildLocationQrCode(
  warehouseCode: string,
  zoneCode: string,
  locationCode: string
) {
  return `LOC-${normalizeCode(warehouseCode)}-${normalizeCode(zoneCode)}-${normalizeCode(locationCode)}`;
}

function buildLocationQrPayload(
  warehouseCode: string,
  zoneCode: string,
  locationCode: string
) {
  return `LOC|${normalizeCode(warehouseCode)}|${normalizeCode(zoneCode)}|${normalizeCode(locationCode)}`;
}

function formatLocationType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getMainCode(label: QRLabel) {
  if (label.type === "location" && label.location_code) return label.location_code;
  return label.zone_code ?? "";
}

export default function QRLabelsGrid() {
  const [labels, setLabels] = useState<QRLabel[]>([]);
  const [query, setQuery] = useState("");
  const [labelTypeFilter, setLabelTypeFilter] = useState<LabelTypeFilter>("all");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [bulkPrintMode, setBulkPrintMode] = useState<BulkPrintMode>("a4");
  const [bulkLabelSize, setBulkLabelSize] = useState<LabelSizeKey>("60x40");
  const [bulkA4Size, setBulkA4Size] = useState<A4GridSizeKey>("medium");
  const [selectedLabel, setSelectedLabel] = useState<QRLabel | null>(null);
  const [singleLabelSize, setSingleLabelSize] = useState<LabelSizeKey>("60x40");
  const [printJob, setPrintJob] = useState<PrintJob>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadLabels() {
    setIsLoading(true);
    setErrorMessage(null);

    const [
      { data: zoneData, error: zoneError },
      { data: locationData, error: locationError },
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
          warehouses (id, code, name)
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
          warehouses (id, code, name),
          zones (id, code, name)
        `)
        .eq("is_active", true),
    ]);

    if (zoneError) {
      setLabels([]);
      setErrorMessage(zoneError.message);
      setIsLoading(false);
      return;
    }

    if (locationError) {
      setLabels([]);
      setErrorMessage(locationError.message);
      setIsLoading(false);
      return;
    }

    const zoneLabels: QRLabel[] =
      zoneData?.flatMap((zone: any) => {
        const warehouseRaw = Array.isArray(zone.warehouses)
          ? zone.warehouses[0]
          : zone.warehouses;
        if (!warehouseRaw) return [];

        const qrCode =
          zone.qr_code || buildZoneQrCode(warehouseRaw.code, zone.code);
        const qrPayload =
          zone.qr_payload || buildZoneQrPayload(warehouseRaw.code, zone.code);

        return [
          {
            id: `zone-${zone.id}`,
            type: "zone" as const,
            warehouse_id: zone.warehouse_id,
            warehouse_code: warehouseRaw.code,
            warehouse_name: warehouseRaw.name,
            zone_id: zone.id,
            zone_code: zone.code,
            zone_name: zone.name,
            location_id: null,
            location_code: null,
            location_name: null,
            location_type: null,
            qr_code: qrCode,
            qr_payload: qrPayload,
            title: `${warehouseRaw.code} / ${zone.code}`,
            subtitle: zone.name,
          },
        ];
      }) ?? [];

    const locationLabels: QRLabel[] =
      locationData?.flatMap((location: any) => {
        const warehouseRaw = Array.isArray(location.warehouses)
          ? location.warehouses[0]
          : location.warehouses;
        const zoneRaw = Array.isArray(location.zones)
          ? location.zones[0]
          : location.zones;
        if (!warehouseRaw || !zoneRaw) return [];

        const qrCode = location.qr_code?.startsWith("LOC-")
          ? location.qr_code
          : buildLocationQrCode(warehouseRaw.code, zoneRaw.code, location.code);
        const qrPayload =
          location.qr_payload ||
          buildLocationQrPayload(warehouseRaw.code, zoneRaw.code, location.code);

        return [
          {
            id: `location-${location.id}`,
            type: "location" as const,
            warehouse_id: location.warehouse_id,
            warehouse_code: warehouseRaw.code,
            warehouse_name: warehouseRaw.name,
            zone_id: location.zone_id,
            zone_code: zoneRaw.code,
            zone_name: zoneRaw.name,
            location_id: location.id,
            location_code: location.code,
            location_name: location.name,
            location_type: location.location_type,
            qr_code: qrCode,
            qr_payload: qrPayload,
            title: `${warehouseRaw.code} / ${zoneRaw.code} / ${location.code}`,
            subtitle: location.name,
          },
        ];
      }) ?? [];

    const combinedLabels = [...zoneLabels, ...locationLabels];
    combinedLabels.sort((a, b) => {
      const warehouseCompare = a.warehouse_code.localeCompare(b.warehouse_code);
      if (warehouseCompare !== 0) return warehouseCompare;
      const zoneCompare = (a.zone_code ?? "").localeCompare(b.zone_code ?? "");
      if (zoneCompare !== 0) return zoneCompare;
      if (a.type !== b.type) return a.type === "zone" ? -1 : 1;
      return (a.location_code ?? "").localeCompare(b.location_code ?? "");
    });

    setLabels(combinedLabels);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadLabels();
  }, []);

  useEffect(() => {
    function handleAfterPrint() {
      setPrintJob(null);
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const warehouses = useMemo(() => {
    const warehouseMap = new Map<
      string,
      { id: string; code: string; name: string }
    >();

    labels.forEach((label) => {
      if (!warehouseMap.has(label.warehouse_id)) {
        warehouseMap.set(label.warehouse_id, {
          id: label.warehouse_id,
          code: label.warehouse_code,
          name: label.warehouse_name,
        });
      }
    });

    return Array.from(warehouseMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );
  }, [labels]);

  const filteredLabels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return labels.filter((label) => {
      if (labelTypeFilter !== "all" && label.type !== labelTypeFilter) return false;
      if (warehouseFilter && label.warehouse_id !== warehouseFilter) return false;
      if (!normalizedQuery) return true;

      const searchable = [
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
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [labels, query, labelTypeFilter, warehouseFilter]);

  const zoneCount = filteredLabels.filter((label) => label.type === "zone").length;
  const locationCount = filteredLabels.filter(
    (label) => label.type === "location"
  ).length;

  function executePrint(job: Exclude<PrintJob, null>) {
    setSelectedLabel(null);
    setPrintJob(job);
    setErrorMessage(null);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  function handleBulkPrint() {
    if (filteredLabels.length === 0) {
      setErrorMessage("There are no labels to print.");
      return;
    }
    executePrint({ kind: "bulk" });
  }

  const bulkLabelDimensions = LABEL_SIZES[bulkLabelSize];
  const singleLabelDimensions = LABEL_SIZES[singleLabelSize];
  const bulkA4Dimensions = A4_GRID_SIZES[bulkA4Size];

  const printCss = useMemo(() => {
    let pageCss = `
      @page { size: A4 portrait; margin: 10mm; }
    `;

    if (printJob?.kind === "single-a4") {
      pageCss = `@page { size: A4 portrait; margin: 0; }`;
    }

    if (printJob?.kind === "single-label") {
      pageCss = `
        @page {
          size: ${singleLabelDimensions.width}mm ${singleLabelDimensions.height}mm;
          margin: 0;
        }
      `;
    }

    if (printJob?.kind === "bulk" && bulkPrintMode === "label") {
      pageCss = `
        @page {
          size: ${bulkLabelDimensions.width}mm ${bulkLabelDimensions.height}mm;
          margin: 0;
        }
      `;
    }

    return `
      .modulex-print-root { display: none; }
      @media print {
        ${pageCss}
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
        }
        body * { visibility: hidden !important; }
        .modulex-print-root, .modulex-print-root * { visibility: visible !important; }
        .modulex-print-root {
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          color: black !important;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
  }, [
    printJob,
    bulkPrintMode,
    bulkLabelDimensions,
    singleLabelDimensions,
  ]);

  function renderScreenLabel(label: QRLabel) {
    return (
      <div className="flex items-start gap-5">
        <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700">
          <QRCodeSVG
            value={label.qr_payload}
            size={112}
            level="M"
            includeMargin={false}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={label.type === "zone" ? "primary" : "success"} size="sm">
              {label.type === "zone" ? "Zone" : "Location"}
            </Badge>
            {label.location_type ? (
              <Badge color="light" size="sm">
                {formatLocationType(label.location_type)}
              </Badge>
            ) : null}
          </div>
          <h4 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
            {label.title}
          </h4>
          <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
            {label.subtitle}
          </p>
        </div>
      </div>
    );
  }

  function renderPrintLabel(label: QRLabel, qrSize: number) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4mm",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
          color: "#000000",
          background: "#ffffff",
        }}
      >
        <div style={{ flexShrink: 0, background: "#ffffff" }}>
          <QRCodeSVG
            value={label.qr_payload}
            size={qrSize}
            level="M"
            includeMargin={false}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "7pt",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {label.type === "zone" ? "Zone" : "Shelf Location"}
          </div>
          <div
            style={{
              marginTop: "1.5mm",
              fontSize: "12pt",
              lineHeight: 1.1,
              fontWeight: 800,
              overflowWrap: "anywhere",
            }}
          >
            {label.title}
          </div>
          <div
            style={{
              marginTop: "1mm",
              fontSize: "8pt",
              lineHeight: 1.15,
              fontWeight: 600,
              overflowWrap: "anywhere",
            }}
          >
            {label.subtitle}
          </div>
          <div
            style={{
              marginTop: "2mm",
              fontSize: "7pt",
              lineHeight: 1.1,
              fontWeight: 700,
              fontFamily: "monospace",
              overflowWrap: "anywhere",
            }}
          >
            {label.qr_code}
          </div>
        </div>
      </div>
    );
  }

  function renderA4ShelfSign(label: QRLabel) {
    const mainCode = getMainCode(label);

    return (
      <div
        style={{
          width: "210mm",
          height: "297mm",
          boxSizing: "border-box",
          padding: "15mm",
          background: "#ffffff",
          color: "#000000",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "15pt",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
            }}
          >
            {label.type === "location" ? "Shelf Location" : "Warehouse Zone"}
          </div>
          <div style={{ marginTop: "5mm", fontSize: "24pt", fontWeight: 700 }}>
            {label.warehouse_name}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: mainCode.length > 12 ? "48pt" : "68pt",
              fontWeight: 900,
              lineHeight: 1,
              overflowWrap: "anywhere",
            }}
          >
            {mainCode}
          </div>
          <div
            style={{
              marginTop: "7mm",
              fontSize: "23pt",
              lineHeight: 1.15,
              fontWeight: 800,
            }}
          >
            {label.subtitle}
          </div>
          <div style={{ marginTop: "4mm", fontSize: "16pt", fontWeight: 500 }}>
            {label.title}
          </div>
          <div style={{ marginTop: "12mm", padding: "5mm", background: "#ffffff" }}>
            <QRCodeSVG
              value={label.qr_payload}
              size={430}
              level="M"
              includeMargin={false}
            />
          </div>
          <div
            style={{
              marginTop: "10mm",
              fontFamily: "monospace",
              fontSize: "18pt",
              fontWeight: 800,
              overflowWrap: "anywhere",
            }}
          >
            {label.qr_code}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #000000",
            paddingTop: "5mm",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "10pt", fontWeight: 600 }}>
            Scan QR code to identify this{" "}
            {label.type === "location" ? "shelf location" : "warehouse zone"}.
          </div>
          <div style={{ marginTop: "2mm", fontFamily: "monospace", fontSize: "8pt" }}>
            {label.qr_payload}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{printCss}</style>

      <div className="space-y-6 print:hidden">
        <ComponentCard
          title="QR Labels"
          desc="Print individual or bulk QR labels for warehouse zones and shelf locations."
          className="print:hidden"
        >
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={filteredLabels.length === 0}
              onClick={handleBulkPrint}
            >
              Print All ({filteredLabels.length})
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="qr-label-type">Label Type</Label>
              <Select
                id="qr-label-type"
                value={labelTypeFilter}
                options={[
                  { value: "all", label: "Zones + Locations" },
                  { value: "zone", label: "Zone Labels" },
                  { value: "location", label: "Location Labels" },
                ]}
                onChange={(value) => setLabelTypeFilter(value as LabelTypeFilter)}
              />
            </div>

            <div>
              <Label htmlFor="qr-label-warehouse">Warehouse</Label>
              <Select
                id="qr-label-warehouse"
                value={warehouseFilter}
                allowEmpty
                placeholder="All Warehouses"
                options={warehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: `${warehouse.code} — ${warehouse.name}`,
                }))}
                onChange={setWarehouseFilter}
              />
            </div>

            <div>
              <Label htmlFor="qr-label-bulk-mode">Bulk Print</Label>
              <Select
                id="qr-label-bulk-mode"
                value={bulkPrintMode}
                options={[
                  { value: "a4", label: "Normal Printer — A4 Sheet" },
                  { value: "label", label: "Label Printer" },
                ]}
                onChange={(value) => setBulkPrintMode(value as BulkPrintMode)}
              />
            </div>

            {bulkPrintMode === "label" ? (
              <div>
                <Label htmlFor="qr-label-bulk-size">Label Size</Label>
                <Select
                  id="qr-label-bulk-size"
                  value={bulkLabelSize}
                  options={Object.entries(LABEL_SIZES).map(([key, size]) => ({
                    value: key,
                    label: size.label,
                  }))}
                  onChange={(value) => setBulkLabelSize(value as LabelSizeKey)}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="qr-label-a4-size">A4 Label Size</Label>
                <Select
                  id="qr-label-a4-size"
                  value={bulkA4Size}
                  options={Object.entries(A4_GRID_SIZES).map(([key, size]) => ({
                    value: key,
                    label: size.label,
                  }))}
                  onChange={(value) => setBulkA4Size(value as A4GridSizeKey)}
                />
              </div>
            )}

            <div className="md:col-span-2 xl:col-span-4">
              <Label htmlFor="qr-label-search">Search</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <Input
                    id="qr-label-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search warehouse, zone, location or QR..."
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => void loadLabels()}>
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
            <Badge color="primary" size="sm">Zones: {zoneCount}</Badge>
            <Badge color="success" size="sm">Locations: {locationCount}</Badge>
            <Badge color="light" size="sm">Total: {filteredLabels.length}</Badge>
          </div>
        </ComponentCard>

        {errorMessage ? (
          <Alert variant="error" title="QR labels unavailable" message={errorMessage} />
        ) : null}

        {bulkPrintMode === "label" ? (
          <Alert
            variant="info"
            title="Label printer mode"
            message={`Select the same ${LABEL_SIZES[bulkLabelSize].label} paper size in the printer driver and use 100% scale.`}
          />
        ) : null}

        {isLoading ? (
          <ComponentCard title="QR Labels">
            <div className="flex min-h-[280px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
                  Loading QR labels...
                </p>
              </div>
            </div>
          </ComponentCard>
        ) : filteredLabels.length === 0 ? (
          <ComponentCard title="QR Labels">
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No QR labels found.
            </p>
          </ComponentCard>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredLabels.map((label) => (
              <article
                key={label.id}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
              >
                {renderScreenLabel(label)}

                <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Warehouse
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {label.warehouse_code} — {label.warehouse_name}
                    </dd>
                  </div>

                  {label.zone_code ? (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Zone
                      </dt>
                      <dd className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {label.zone_code}{label.zone_name ? ` — ${label.zone_name}` : ""}
                      </dd>
                    </div>
                  ) : null}

                  {label.type === "location" && label.location_code ? (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Location
                      </dt>
                      <dd className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {label.location_code}
                        {label.location_name ? ` — ${label.location_name}` : ""}
                      </dd>
                    </div>
                  ) : null}

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      QR Code
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                      {label.qr_code}
                    </dd>
                    <dt className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      QR Payload
                    </dt>
                    <dd className="mt-1 break-all font-mono text-[11px] text-gray-600 dark:text-gray-400">
                      {label.qr_payload}
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto pt-5">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setSelectedLabel(label)}
                  >
                    Print This QR
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={Boolean(selectedLabel)}
        onClose={() => setSelectedLabel(null)}
        className="max-w-xl p-6"
      >
        {selectedLabel ? (
          <div className="space-y-5">
            <div className="pr-10">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Print QR Label
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {selectedLabel.title} — {selectedLabel.subtitle}
              </p>
            </div>

            <ComponentCard
              title="Standard Label"
              desc="For adhesive labels and label printers."
            >
              <div>
                <Label htmlFor="qr-label-single-size">Label Size</Label>
                <Select
                  id="qr-label-single-size"
                  value={singleLabelSize}
                  options={Object.entries(LABEL_SIZES).map(([key, size]) => ({
                    value: key,
                    label: size.label,
                  }))}
                  onChange={(value) => setSingleLabelSize(value as LabelSizeKey)}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() =>
                  executePrint({ kind: "single-label", label: selectedLabel })
                }
              >
                Print Standard Label
              </Button>
            </ComponentCard>

            <ComponentCard
              title="A4 Full Page / Shelf Sign"
              desc="Print one large QR page for warehouse racks, shelf ends, and locations that must be readable from a distance."
            >
              <Button
                type="button"
                className="w-full"
                onClick={() => executePrint({ kind: "single-a4", label: selectedLabel })}
              >
                Print A4 Shelf Sign
              </Button>
            </ComponentCard>
          </div>
        ) : null}
      </Modal>

      <div className="modulex-print-root">
        {printJob?.kind === "single-label" ? (
          <div
            style={{
              width: `${singleLabelDimensions.width}mm`,
              height: `${singleLabelDimensions.height}mm`,
              padding: "3mm",
              boxSizing: "border-box",
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            {renderPrintLabel(
              printJob.label,
              singleLabelDimensions.qr * 3.7795
            )}
          </div>
        ) : null}

        {printJob?.kind === "single-a4"
          ? renderA4ShelfSign(printJob.label)
          : null}

        {printJob?.kind === "bulk" && bulkPrintMode === "label" ? (
          <div style={{ width: `${bulkLabelDimensions.width}mm` }}>
            {filteredLabels.map((label, index) => (
              <div
                key={label.id}
                style={{
                  width: `${bulkLabelDimensions.width}mm`,
                  height: `${bulkLabelDimensions.height}mm`,
                  padding: "3mm",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  background: "#ffffff",
                  breakAfter:
                    index === filteredLabels.length - 1 ? "auto" : "page",
                  pageBreakAfter:
                    index === filteredLabels.length - 1 ? "auto" : "always",
                }}
              >
                {renderPrintLabel(label, bulkLabelDimensions.qr * 3.7795)}
              </div>
            ))}
          </div>
        ) : null}

        {printJob?.kind === "bulk" && bulkPrintMode === "a4" ? (
          <div
            style={{
              width: "190mm",
              display: "grid",
              gridTemplateColumns: `repeat(${bulkA4Dimensions.columns}, minmax(0, 1fr))`,
              gap: "4mm",
              boxSizing: "border-box",
            }}
          >
            {filteredLabels.map((label) => (
              <div
                key={label.id}
                style={{
                  minHeight: `${bulkA4Dimensions.minHeight}mm`,
                  padding: "4mm",
                  boxSizing: "border-box",
                  border: "0.3mm solid #000000",
                  borderRadius: "2mm",
                  breakInside: "avoid",
                  pageBreakInside: "avoid",
                  background: "#ffffff",
                }}
              >
                {renderPrintLabel(label, bulkA4Dimensions.qr)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
