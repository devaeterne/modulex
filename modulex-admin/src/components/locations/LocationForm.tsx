"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import QRPreview from "@/components/qr/QRPreview";
import { supabase } from "@/lib/supabase/client";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  is_active: boolean;
};

type ZoneOption = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type LocationValues = {
  warehouse_id: string;
  zone_id: string;
  code: string;
  name: string;
  location_type: string;
  max_capacity: string;
  is_active: boolean;
};

type LocationFormProps = {
  mode: "create" | "edit";
  locationId?: string;
  initialZoneId?: string;
  initialWarehouseId?: string;
};

const locationTypeOptions = [
  { value: "shelf", label: "Shelf" },
  { value: "bin", label: "Bin" },
  { value: "staging", label: "Staging" },
  { value: "floor", label: "Floor" },
  { value: "other", label: "Other" },
];

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-_]/g, "");
}

function buildLocationQrCode(warehouseCode: string, zoneCode: string, locationCode: string) {
  if (!warehouseCode || !zoneCode || !locationCode) return "";
  return `LOC-${normalizeCode(warehouseCode)}-${normalizeCode(zoneCode)}-${normalizeCode(locationCode)}`;
}

function buildLocationQrPayload(warehouseCode: string, zoneCode: string, locationCode: string) {
  if (!warehouseCode || !zoneCode || !locationCode) return "";
  return `LOC|${normalizeCode(warehouseCode)}|${normalizeCode(zoneCode)}|${normalizeCode(locationCode)}`;
}

export default function LocationForm({
  mode,
  locationId,
  initialZoneId,
  initialWarehouseId,
}: LocationFormProps) {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [values, setValues] = useState<LocationValues>({
    warehouse_id: initialWarehouseId ?? "",
    zone_id: initialZoneId ?? "",
    code: "",
    name: "",
    location_type: "shelf",
    max_capacity: "",
    is_active: true,
  });
  const [originalWarehouseId, setOriginalWarehouseId] = useState("");
  const [originalQrPayload, setOriginalQrPayload] = useState<string | null>(null);
  const [hasStock, setHasStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredZones = useMemo(() => {
    if (!values.warehouse_id) return [];
    return zones.filter((zone) => zone.warehouse_id === values.warehouse_id);
  }, [zones, values.warehouse_id]);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === values.warehouse_id) ?? null,
    [warehouses, values.warehouse_id],
  );

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === values.zone_id) ?? null,
    [zones, values.zone_id],
  );

  const normalizedLocationCode = normalizeCode(values.code);
  const qrCode = buildLocationQrCode(
    selectedWarehouse?.code ?? "",
    selectedZone?.code ?? "",
    normalizedLocationCode,
  );
  const qrPayload = buildLocationQrPayload(
    selectedWarehouse?.code ?? "",
    selectedZone?.code ?? "",
    normalizedLocationCode,
  );

  async function loadForm() {
    setIsLoading(true);
    setErrorMessage(null);

    const [warehouseResult, zoneResult] = await Promise.all([
      supabase
        .from("warehouses")
        .select("id, code, name, warehouse_type, is_active")
        .order("code", { ascending: true }),
      supabase
        .from("zones")
        .select("id, warehouse_id, code, name, is_active")
        .order("code", { ascending: true }),
    ]);

    if (warehouseResult.error) {
      setErrorMessage(warehouseResult.error.message);
      setIsLoading(false);
      return;
    }
    if (zoneResult.error) {
      setErrorMessage(zoneResult.error.message);
      setIsLoading(false);
      return;
    }

    const warehouseOptions = (warehouseResult.data as WarehouseOption[]) ?? [];
    const zoneOptions = (zoneResult.data as ZoneOption[]) ?? [];
    setWarehouses(warehouseOptions);
    setZones(zoneOptions);

    if (mode === "create") {
      if (initialZoneId) {
        const initialZone = zoneOptions.find((zone) => zone.id === initialZoneId);
        if (initialZone) {
          setValues((current) => ({
            ...current,
            warehouse_id: initialZone.warehouse_id,
            zone_id: initialZone.id,
          }));
        }
      } else if (initialWarehouseId) {
        setValues((current) => ({ ...current, warehouse_id: initialWarehouseId }));
      }
      setIsLoading(false);
      return;
    }

    if (!locationId) {
      setErrorMessage("Location ID is required.");
      setIsLoading(false);
      return;
    }

    const { data: locationData, error: locationError } = await supabase
      .from("locations")
      .select("id, warehouse_id, zone_id, code, name, location_type, max_capacity, is_active, qr_payload")
      .eq("id", locationId)
      .maybeSingle();

    if (locationError) {
      setErrorMessage(locationError.message);
      setIsLoading(false);
      return;
    }
    if (!locationData) {
      setErrorMessage("Location could not be found.");
      setIsLoading(false);
      return;
    }

    setValues({
      warehouse_id: locationData.warehouse_id,
      zone_id: locationData.zone_id ?? "",
      code: locationData.code ?? "",
      name: locationData.name ?? "",
      location_type: locationData.location_type ?? "shelf",
      max_capacity: locationData.max_capacity === null ? "" : String(locationData.max_capacity),
      is_active: locationData.is_active,
    });
    setOriginalWarehouseId(locationData.warehouse_id);
    setOriginalQrPayload(locationData.qr_payload);

    const { data: stockData, error: stockError } = await supabase
      .from("v_location_stock_summary")
      .select("total_quantity, total_reserved_quantity, total_available_quantity")
      .eq("location_id", locationId)
      .maybeSingle();

    if (stockError) {
      setErrorMessage(stockError.message);
      setIsLoading(false);
      return;
    }

    const totalQuantity = Number(stockData?.total_quantity ?? 0);
    const reservedQuantity = Number(stockData?.total_reserved_quantity ?? 0);
    setStockQuantity(totalQuantity);
    setHasStock(totalQuantity !== 0 || reservedQuantity !== 0);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, locationId, initialZoneId, initialWarehouseId]);

  function updateValue<K extends keyof LocationValues>(key: K, value: LocationValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleWarehouseChange(warehouseId: string) {
    if (mode === "edit" && hasStock && warehouseId !== originalWarehouseId) {
      setErrorMessage(
        "This location contains stock. Transfer all stock out before moving the location to another warehouse.",
      );
      return;
    }

    setErrorMessage(null);
    setValues((current) => {
      const currentZone = zones.find((zone) => zone.id === current.zone_id);
      const zoneStillValid = currentZone?.warehouse_id === warehouseId;
      return {
        ...current,
        warehouse_id: warehouseId,
        zone_id: zoneStillValid ? current.zone_id : "",
      };
    });
  }

  function validate() {
    if (!values.warehouse_id) return "Warehouse is required.";
    if (!values.zone_id) return "Zone is required.";
    if (!normalizedLocationCode) return "Location code is required.";
    if (!values.name.trim()) return "Location name is required.";

    const zone = zones.find((item) => item.id === values.zone_id);
    if (!zone) return "Selected zone is not valid.";
    if (zone.warehouse_id !== values.warehouse_id) {
      return "Selected zone does not belong to the selected warehouse.";
    }
    if (mode === "edit" && hasStock && values.warehouse_id !== originalWarehouseId) {
      return "Transfer all stock out before moving this location to another warehouse.";
    }
    if (values.max_capacity.trim()) {
      const maxCapacity = Number(values.max_capacity);
      if (Number.isNaN(maxCapacity) || maxCapacity < 0) {
        return "Maximum capacity must be zero or greater.";
      }
    }
    if (!qrCode || !qrPayload) return "QR identity could not be generated.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    const payload: Record<string, unknown> = {
      warehouse_id: values.warehouse_id,
      zone_id: values.zone_id,
      code: normalizedLocationCode,
      name: values.name.trim(),
      location_type: values.location_type,
      max_capacity: values.max_capacity.trim() ? Number(values.max_capacity) : null,
      is_active: values.is_active,
      qr_code: qrCode,
      qr_payload: qrPayload,
    };

    if (mode === "edit" && originalQrPayload !== qrPayload) {
      payload.qr_svg_path = null;
      payload.qr_svg_url = null;
      payload.qr_generated_at = null;
    }

    if (mode === "create") {
      const { error } = await supabase.from("locations").insert(payload);
      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }
    } else {
      if (!locationId) {
        setErrorMessage("Location ID is required.");
        setIsSaving(false);
        return;
      }
      const { error } = await supabase.from("locations").update(payload).eq("id", locationId);
      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }
    }

    router.push(`/locations?zone=${values.zone_id}`);
    router.refresh();
  }

  function handleCancel() {
    if (values.zone_id) {
      router.push(`/locations?zone=${values.zone_id}`);
      return;
    }
    if (values.warehouse_id) {
      router.push(`/locations?warehouse=${values.warehouse_id}`);
      return;
    }
    router.push("/locations");
  }

  const title = mode === "create" ? "Create Location" : "Edit Location";
  const description = "Configure the warehouse hierarchy, shelf identity, capacity, and QR information.";

  if (isLoading) {
    return (
      <ComponentCard title={title} desc={description}>
        <Alert variant="info" title="Loading location" message="Location data and warehouse hierarchy are being loaded." />
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title={title} desc={description}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage ? (
          <Alert variant="error" title="Unable to save location" message={errorMessage} />
        ) : null}

        {mode === "edit" && hasStock ? (
          <Alert
            variant="warning"
            title="Location contains stock"
            message={`This location currently contains ${stockQuantity.toLocaleString("en-US")} units. The warehouse cannot be changed until all stock is transferred out. Changing the zone inside the same warehouse moves this location and its stock to that zone.`}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="location-warehouse">Warehouse</Label>
            <Select
              id="location-warehouse"
              value={values.warehouse_id}
              allowEmpty
              placeholder="Select warehouse"
              disabled={mode === "edit" && hasStock}
              options={warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: `${warehouse.code} — ${warehouse.name}${warehouse.is_active ? "" : " (Inactive)"}`,
              }))}
              onChange={handleWarehouseChange}
            />
          </div>

          <div>
            <Label htmlFor="location-zone">Zone</Label>
            <Select
              id="location-zone"
              value={values.zone_id}
              allowEmpty
              placeholder={values.warehouse_id ? "Select zone" : "Select warehouse first"}
              disabled={!values.warehouse_id}
              options={filteredZones.map((zone) => ({
                value: zone.id,
                label: `${zone.code} — ${zone.name}${zone.is_active ? "" : " (Inactive)"}`,
              }))}
              onChange={(value) => updateValue("zone_id", value)}
            />
          </div>

          <div>
            <Label htmlFor="location-code">Location Code</Label>
            <Input
              id="location-code"
              value={values.code}
              onChange={(event) => updateValue("code", event.target.value)}
              onBlur={() => updateValue("code", normalizeCode(values.code))}
              placeholder="B-01-01"
              hint="Example: B-01-01"
            />
          </div>

          <div>
            <Label htmlFor="location-name">Location Name</Label>
            <Input
              id="location-name"
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              placeholder="Standard Shelf 01"
            />
          </div>

          <div>
            <Label htmlFor="location-type">Location Type</Label>
            <Select
              id="location-type"
              value={values.location_type}
              options={locationTypeOptions}
              onChange={(value) => updateValue("location_type", value)}
            />
          </div>

          <div>
            <Label htmlFor="location-capacity">Maximum Capacity</Label>
            <Input
              id="location-capacity"
              value={values.max_capacity}
              onChange={(event) => updateValue("max_capacity", event.target.value)}
              type="number"
              min="0"
              step="1"
              placeholder="Optional"
            />
          </div>

          <div>
            <Label htmlFor="location-status">Status</Label>
            <Select
              id="location-status"
              value={values.is_active ? "active" : "inactive"}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              onChange={(value) => updateValue("is_active", value === "active")}
            />
          </div>

          <div>
            <Label>Warehouse Type</Label>
            <div className="flex h-11 items-center rounded-lg border border-gray-200 px-4 dark:border-gray-800 dark:bg-gray-900">
              {selectedWarehouse ? (
                <Badge color={selectedWarehouse.warehouse_type === "sellable" ? "success" : "warning"} size="sm">
                  {selectedWarehouse.warehouse_type === "sellable" ? "Sellable" : "Non-sellable"}
                </Badge>
              ) : (
                <span className="text-sm text-gray-400">Select warehouse</span>
              )}
            </div>
          </div>

          <ComponentCard
            className="md:col-span-2"
            title="QR Identity"
            desc="QR identity is generated automatically from the warehouse, zone, and location codes."
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="shrink-0">
                <QRPreview value={qrPayload} code={qrCode} size={150} showCode />
              </div>
              <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">QR Code</p>
                  <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">{qrCode || "-"}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Human-readable location identifier.</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">QR Payload</p>
                  <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">{qrPayload || "-"}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This value is encoded inside the QR code and used by the scanner.</p>
                </div>
                {selectedWarehouse && selectedZone ? (
                  <div className="md:col-span-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="primary" size="sm">{selectedWarehouse.code}</Badge>
                      <Badge color="light" size="sm">Zone {selectedZone.code}</Badge>
                      <Badge color={values.is_active ? "success" : "light"} size="sm">
                        {values.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {selectedWarehouse.code} / {selectedZone.code} / {normalizedLocationCode || "-"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {selectedWarehouse.name} → {selectedZone.name} → {values.name.trim() || "Location"}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </ComponentCard>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={isSaving} onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:w-auto" disabled={isSaving}>
            {isSaving ? "Saving..." : mode === "create" ? "Create Location" : "Save Changes"}
          </Button>
        </div>
      </form>
    </ComponentCard>
  );
}
