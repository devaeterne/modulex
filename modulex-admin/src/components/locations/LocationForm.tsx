"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import QRPreview from "@/components/qr/QRPreview";

type WarehouseType =
  | "sellable"
  | "non_sellable";

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
  {
    value: "shelf",
    label: "Shelf",
  },
  {
    value: "bin",
    label: "Bin",
  },
  {
    value: "staging",
    label: "Staging",
  },
  {
    value: "floor",
    label: "Floor",
  },
  {
    value: "other",
    label: "Other",
  },
];

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

function buildLocationQrCode(
  warehouseCode: string,
  zoneCode: string,
  locationCode: string
) {
  if (
    !warehouseCode ||
    !zoneCode ||
    !locationCode
  ) {
    return "";
  }

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
  if (
    !warehouseCode ||
    !zoneCode ||
    !locationCode
  ) {
    return "";
  }

  return `LOC|${normalizeCode(
    warehouseCode
  )}|${normalizeCode(
    zoneCode
  )}|${normalizeCode(locationCode)}`;
}

export default function LocationForm({
  mode,
  locationId,
  initialZoneId,
  initialWarehouseId,
}: LocationFormProps) {
  const router = useRouter();

  const [warehouses, setWarehouses] =
    useState<WarehouseOption[]>([]);

  const [zones, setZones] = useState<
    ZoneOption[]
  >([]);

  const [values, setValues] =
    useState<LocationValues>({
      warehouse_id:
        initialWarehouseId ?? "",

      zone_id: initialZoneId ?? "",

      code: "",
      name: "",

      location_type: "shelf",

      max_capacity: "",

      is_active: true,
    });

  const [originalWarehouseId, setOriginalWarehouseId] =
    useState("");

  const [originalQrPayload, setOriginalQrPayload] =
    useState<string | null>(null);

  const [hasStock, setHasStock] =
    useState(false);

  const [stockQuantity, setStockQuantity] =
    useState(0);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const filteredZones = useMemo(() => {
    if (!values.warehouse_id) {
      return [];
    }

    return zones.filter(
      (zone) =>
        zone.warehouse_id ===
        values.warehouse_id
    );
  }, [zones, values.warehouse_id]);

  const selectedWarehouse = useMemo(
    () =>
      warehouses.find(
        (warehouse) =>
          warehouse.id ===
          values.warehouse_id
      ) ?? null,
    [warehouses, values.warehouse_id]
  );

  const selectedZone = useMemo(
    () =>
      zones.find(
        (zone) =>
          zone.id === values.zone_id
      ) ?? null,
    [zones, values.zone_id]
  );

  const normalizedLocationCode =
    normalizeCode(values.code);

  const qrCode = buildLocationQrCode(
    selectedWarehouse?.code ?? "",
    selectedZone?.code ?? "",
    normalizedLocationCode
  );

  const qrPayload = buildLocationQrPayload(
    selectedWarehouse?.code ?? "",
    selectedZone?.code ?? "",
    normalizedLocationCode
  );

  async function loadForm() {
    setIsLoading(true);
    setErrorMessage(null);

    const [
      {
        data: warehouseData,
        error: warehouseError,
      },
      {
        data: zoneData,
        error: zoneError,
      },
    ] = await Promise.all([
      supabase
        .from("warehouses")
        .select(`
          id,
          code,
          name,
          warehouse_type,
          is_active
        `)
        .order("code", {
          ascending: true,
        }),

      supabase
        .from("zones")
        .select(`
          id,
          warehouse_id,
          code,
          name,
          is_active
        `)
        .order("code", {
          ascending: true,
        }),
    ]);

    if (warehouseError) {
      setErrorMessage(
        warehouseError.message
      );

      setIsLoading(false);
      return;
    }

    if (zoneError) {
      setErrorMessage(zoneError.message);

      setIsLoading(false);
      return;
    }

    const warehouseOptions =
      (warehouseData as WarehouseOption[]) ??
      [];

    const zoneOptions =
      (zoneData as ZoneOption[]) ?? [];

    setWarehouses(warehouseOptions);
    setZones(zoneOptions);

    if (mode === "create") {
      if (initialZoneId) {
        const initialZone =
          zoneOptions.find(
            (zone) =>
              zone.id === initialZoneId
          );

        if (initialZone) {
          setValues((current) => ({
            ...current,

            warehouse_id:
              initialZone.warehouse_id,

            zone_id: initialZone.id,
          }));
        }
      } else if (initialWarehouseId) {
        setValues((current) => ({
          ...current,

          warehouse_id:
            initialWarehouseId,
        }));
      }

      setIsLoading(false);

      return;
    }

    if (!locationId) {
      setErrorMessage(
        "Location ID is required."
      );

      setIsLoading(false);
      return;
    }

    const {
      data: locationData,
      error: locationError,
    } = await supabase
      .from("locations")
      .select(`
        id,
        warehouse_id,
        zone_id,
        code,
        name,
        location_type,
        max_capacity,
        is_active,
        qr_payload
      `)
      .eq("id", locationId)
      .maybeSingle();

    if (locationError) {
      setErrorMessage(
        locationError.message
      );

      setIsLoading(false);
      return;
    }

    if (!locationData) {
      setErrorMessage(
        "Location could not be found."
      );

      setIsLoading(false);
      return;
    }

    setValues({
      warehouse_id:
        locationData.warehouse_id,

      zone_id:
        locationData.zone_id ?? "",

      code: locationData.code ?? "",

      name: locationData.name ?? "",

      location_type:
        locationData.location_type ??
        "shelf",

      max_capacity:
        locationData.max_capacity ===
          null
          ? ""
          : String(
            locationData.max_capacity
          ),

      is_active:
        locationData.is_active,
    });

    setOriginalWarehouseId(
      locationData.warehouse_id
    );

    setOriginalQrPayload(
      locationData.qr_payload
    );

    const {
      data: stockData,
      error: stockError,
    } = await supabase
      .from("v_location_stock_summary")
      .select(`
        total_quantity,
        total_reserved_quantity,
        total_available_quantity
      `)
      .eq("location_id", locationId)
      .maybeSingle();

    if (stockError) {
      setErrorMessage(stockError.message);

      setIsLoading(false);
      return;
    }

    const totalQuantity = Number(
      stockData?.total_quantity ?? 0
    );

    const reservedQuantity = Number(
      stockData?.total_reserved_quantity ??
      0
    );

    setStockQuantity(totalQuantity);

    setHasStock(
      totalQuantity !== 0 ||
      reservedQuantity !== 0
    );

    setIsLoading(false);
  }

  useEffect(() => {
    loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    locationId,
    initialZoneId,
    initialWarehouseId,
  ]);

  function updateValue<
    K extends keyof LocationValues,
  >(
    key: K,
    value: LocationValues[K]
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleWarehouseChange(
    warehouseId: string
  ) {
    if (
      mode === "edit" &&
      hasStock &&
      warehouseId !==
      originalWarehouseId
    ) {
      setErrorMessage(
        "This location contains stock. Transfer all stock out before moving the location to another warehouse."
      );

      return;
    }

    setErrorMessage(null);

    setValues((current) => {
      const currentZone =
        zones.find(
          (zone) =>
            zone.id === current.zone_id
        );

      const zoneStillValid =
        currentZone?.warehouse_id ===
        warehouseId;

      return {
        ...current,

        warehouse_id: warehouseId,

        zone_id: zoneStillValid
          ? current.zone_id
          : "",
      };
    });
  }

  function validate() {
    if (!values.warehouse_id) {
      return "Warehouse is required.";
    }

    if (!values.zone_id) {
      return "Zone is required.";
    }

    if (!normalizedLocationCode) {
      return "Location code is required.";
    }

    if (!values.name.trim()) {
      return "Location name is required.";
    }

    const zone = zones.find(
      (item) =>
        item.id === values.zone_id
    );

    if (!zone) {
      return "Selected zone is not valid.";
    }

    if (
      zone.warehouse_id !==
      values.warehouse_id
    ) {
      return "Selected zone does not belong to the selected warehouse.";
    }

    if (
      mode === "edit" &&
      hasStock &&
      values.warehouse_id !==
      originalWarehouseId
    ) {
      return "Transfer all stock out before moving this location to another warehouse.";
    }

    if (values.max_capacity.trim()) {
      const maxCapacity = Number(
        values.max_capacity
      );

      if (
        Number.isNaN(maxCapacity) ||
        maxCapacity < 0
      ) {
        return "Maximum capacity must be zero or greater.";
      }
    }

    if (!qrCode || !qrPayload) {
      return "QR identity could not be generated.";
    }

    return null;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage(null);

    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);

    const payload: Record<
      string,
      unknown
    > = {
      warehouse_id:
        values.warehouse_id,

      zone_id: values.zone_id,

      code: normalizedLocationCode,

      name: values.name.trim(),

      location_type:
        values.location_type,

      max_capacity:
        values.max_capacity.trim()
          ? Number(
            values.max_capacity
          )
          : null,

      is_active: values.is_active,

      qr_code: qrCode,

      qr_payload: qrPayload,
    };

    if (
      mode === "edit" &&
      originalQrPayload !== qrPayload
    ) {
      payload.qr_svg_path = null;
      payload.qr_svg_url = null;
      payload.qr_generated_at = null;
    }

    if (mode === "create") {
      const { error } = await supabase
        .from("locations")
        .insert(payload);

      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }
    } else {
      if (!locationId) {
        setErrorMessage(
          "Location ID is required."
        );

        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("locations")
        .update(payload)
        .eq("id", locationId);

      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }
    }

    router.push(
      `/locations?zone=${values.zone_id}`
    );

    router.refresh();
  }

  function handleCancel() {
    if (values.zone_id) {
      router.push(
        `/locations?zone=${values.zone_id}`
      );

      return;
    }

    if (values.warehouse_id) {
      router.push(
        `/locations?warehouse=${values.warehouse_id}`
      );

      return;
    }

    router.push("/locations");
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading location...
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {mode === "create"
            ? "Create Location"
            : "Edit Location"}
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure the warehouse hierarchy,
          shelf identity, capacity, and QR
          information.
        </p>
      </div>

      {errorMessage && (
        <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      {mode === "edit" && hasStock && (
        <div className="mx-5 mt-5 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          This location currently contains{" "}
          <strong>
            {stockQuantity.toLocaleString(
              "en-US"
            )}
          </strong>{" "}
          units. The warehouse cannot be
          changed until all stock is
          transferred out. Changing the zone
          inside the same warehouse moves this
          location and its stock to that zone.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Warehouse
          </label>

          <select
            value={values.warehouse_id}
            onChange={(event) =>
              handleWarehouseChange(
                event.target.value
              )
            }
            disabled={
              mode === "edit" && hasStock
            }
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-white/[0.03]"
          >
            <option value="">
              Select warehouse
            </option>

            {warehouses.map(
              (warehouse) => (
                <option
                  key={warehouse.id}
                  value={warehouse.id}
                >
                  {warehouse.code} —{" "}
                  {warehouse.name}
                  {!warehouse.is_active
                    ? " (Inactive)"
                    : ""}
                </option>
              )
            )}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Zone
          </label>

          <select
            value={values.zone_id}
            onChange={(event) =>
              updateValue(
                "zone_id",
                event.target.value
              )
            }
            disabled={!values.warehouse_id}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-white/[0.03]"
          >
            <option value="">
              {values.warehouse_id
                ? "Select zone"
                : "Select warehouse first"}
            </option>

            {filteredZones.map((zone) => (
              <option
                key={zone.id}
                value={zone.id}
              >
                {zone.code} — {zone.name}
                {!zone.is_active
                  ? " (Inactive)"
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Location Code
          </label>

          <input
            value={values.code}
            onChange={(event) =>
              updateValue(
                "code",
                event.target.value
              )
            }
            onBlur={() =>
              updateValue(
                "code",
                normalizeCode(values.code)
              )
            }
            type="text"
            placeholder="B-01-01"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />

          <p className="mt-1 text-xs text-gray-400">
            Example: B-01-01
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Location Name
          </label>

          <input
            value={values.name}
            onChange={(event) =>
              updateValue(
                "name",
                event.target.value
              )
            }
            type="text"
            placeholder="Standard Shelf 01"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Location Type
          </label>

          <select
            value={values.location_type}
            onChange={(event) =>
              updateValue(
                "location_type",
                event.target.value
              )
            }
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            {locationTypeOptions.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Maximum Capacity
          </label>

          <input
            value={values.max_capacity}
            onChange={(event) =>
              updateValue(
                "max_capacity",
                event.target.value
              )
            }
            type="number"
            min="0"
            step="1"
            placeholder="Optional"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Status
          </label>

          <select
            value={
              values.is_active
                ? "active"
                : "inactive"
            }
            onChange={(event) =>
              updateValue(
                "is_active",
                event.target.value ===
                "active"
              )
            }
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="active">
              Active
            </option>

            <option value="inactive">
              Inactive
            </option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Warehouse Type
          </label>

          <div className="flex h-11 items-center rounded-lg border border-gray-200 px-4 dark:border-gray-800">
            {selectedWarehouse ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${selectedWarehouse.warehouse_type ===
                  "sellable"
                  ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
                  }`}
              >
                {selectedWarehouse.warehouse_type ===
                  "sellable"
                  ? "Sellable"
                  : "Non-sellable"}
              </span>
            ) : (
              <span className="text-sm text-gray-400">
                Select warehouse
              </span>
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                QR Identity
              </h4>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                QR identity is generated automatically
                from the warehouse, zone, and location
                codes.
              </p>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="shrink-0">
                <QRPreview
                  value={qrPayload}
                  code={qrCode}
                  size={150}
                  showCode
                />
              </div>

              <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    QR Code
                  </p>

                  <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                    {qrCode || "-"}
                  </p>

                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Human-readable location identifier.
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    QR Payload
                  </p>

                  <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                    {qrPayload || "-"}
                  </p>

                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    This value is encoded inside the QR
                    code and used by the scanner.
                  </p>
                </div>

                {selectedWarehouse && selectedZone && (
                  <div className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Location Path
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800 dark:text-white/90">
                      <span>
                        {selectedWarehouse.code}
                      </span>

                      <span className="text-gray-400">
                        /
                      </span>

                      <span>
                        {selectedZone.code}
                      </span>

                      <span className="text-gray-400">
                        /
                      </span>

                      <span>
                        {normalizedLocationCode || "-"}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {selectedWarehouse.name} →{" "}
                      {selectedZone.name} →{" "}
                      {values.name.trim() ||
                        "Location"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving
            ? "Saving..."
            : mode === "create"
              ? "Create Location"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}