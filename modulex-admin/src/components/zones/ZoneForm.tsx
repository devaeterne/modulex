"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  is_active: boolean;
};

type ZoneFormValues = {
  warehouse_id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
};

type ZoneRow = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  qr_code: string | null;
  qr_payload: string | null;
};

type ZoneFormProps = {
  mode: "create" | "edit";
  zoneId?: string;
  initialWarehouseId?: string;
};

type WarehouseSelectProps = {
  value: string;
  options: WarehouseOption[];
  onChange: (value: string) => void;
};

const initialValues: ZoneFormValues = {
  warehouse_id: "",
  code: "",
  name: "",
  description: "",
  is_active: true,
};

function normalizeZoneCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

function normalizeWarehouseCode(value: string) {
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
  const normalizedWarehouseCode =
    normalizeWarehouseCode(warehouseCode);

  const normalizedZoneCode =
    normalizeZoneCode(zoneCode);

  if (!normalizedWarehouseCode || !normalizedZoneCode) {
    return "";
  }

  return `ZONE-${normalizedWarehouseCode}-${normalizedZoneCode}`;
}

function buildZoneQrPayload(
  warehouseCode: string,
  zoneCode: string
) {
  const normalizedWarehouseCode =
    normalizeWarehouseCode(warehouseCode);

  const normalizedZoneCode =
    normalizeZoneCode(zoneCode);

  if (!normalizedWarehouseCode || !normalizedZoneCode) {
    return "";
  }

  return `ZONE|${normalizedWarehouseCode}|${normalizedZoneCode}`;
}

function formatWarehouseType(type: WarehouseType) {
  switch (type) {
    case "sellable":
      return "Sellable";

    case "non_sellable":
      return "Non-sellable";

    default:
      return type;
  }
}

function warehouseTypeClass(type: WarehouseType) {
  switch (type) {
    case "sellable":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";

    case "non_sellable":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";

    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
  }
}

function WarehouseSelect({
  value,
  options,
  onChange,
}: WarehouseSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedWarehouse = options.find(
    (option) => option.id === value
  );

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        Warehouse <span className="text-error-500">*</span>
      </label>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
      >
        {selectedWarehouse ? (
          <span className="flex items-center gap-2">
            <span className="font-medium">
              {selectedWarehouse.code}
            </span>

            <span className="text-gray-500 dark:text-gray-400">
              {selectedWarehouse.name}
            </span>
          </span>
        ) : (
          <span className="text-gray-400">
            Select warehouse
          </span>
        )}

        <span className="ml-3 text-gray-500 dark:text-gray-400">
          ▾
        </span>
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close warehouse dropdown"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
            {options.map((warehouse) => {
              const isSelected = warehouse.id === value;

              return (
                <button
                  key={warehouse.id}
                  type="button"
                  onClick={() => {
                    onChange(warehouse.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${isSelected
                    ? "bg-brand-500 text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                    }`}
                >
                  <span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {warehouse.code}
                      </span>

                      {!warehouse.is_active && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isSelected
                            ? "bg-white/15 text-white"
                            : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                            }`}
                        >
                          Inactive
                        </span>
                      )}
                    </span>

                    <span
                      className={`mt-0.5 block text-xs ${isSelected
                        ? "text-white/80"
                        : "text-gray-500 dark:text-gray-400"
                        }`}
                    >
                      {warehouse.name} ·{" "}
                      {formatWarehouseType(
                        warehouse.warehouse_type
                      )}
                    </span>
                  </span>

                  {isSelected && <span>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function ZoneForm({
  mode,
  zoneId,
  initialWarehouseId,
}: ZoneFormProps) {
  const router = useRouter();

  const [values, setValues] =
    useState<ZoneFormValues>(initialValues);

  const [warehouses, setWarehouses] =
    useState<WarehouseOption[]>([]);

  const [originalQrPayload, setOriginalQrPayload] =
    useState<string | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const selectedWarehouse = useMemo(
    () =>
      warehouses.find(
        (warehouse) =>
          warehouse.id === values.warehouse_id
      ) ?? null,
    [warehouses, values.warehouse_id]
  );

  const generatedQrCode = useMemo(
    () =>
      buildZoneQrCode(
        selectedWarehouse?.code ?? "",
        values.code
      ),
    [selectedWarehouse, values.code]
  );

  const generatedQrPayload = useMemo(
    () =>
      buildZoneQrPayload(
        selectedWarehouse?.code ?? "",
        values.code
      ),
    [selectedWarehouse, values.code]
  );

  useEffect(() => {
    async function loadFormData() {
      setIsLoading(true);
      setErrorMessage(null);

      const {
        data: warehouseData,
        error: warehouseError,
      } = await supabase
        .from("warehouses")
        .select(
          "id, code, name, warehouse_type, is_active"
        )
        .order("code", {
          ascending: true,
        });

      if (warehouseError) {
        setErrorMessage(warehouseError.message);
        setIsLoading(false);
        return;
      }

      const loadedWarehouses =
        (warehouseData as WarehouseOption[]) ?? [];

      setWarehouses(loadedWarehouses);

      if (mode === "create") {
        const requestedWarehouse =
          initialWarehouseId &&
            loadedWarehouses.some(
              (warehouse) =>
                warehouse.id === initialWarehouseId
            )
            ? initialWarehouseId
            : "";

        setValues({
          ...initialValues,
          warehouse_id: requestedWarehouse,
        });

        setOriginalQrPayload(null);
        setIsLoading(false);
        return;
      }

      if (!zoneId) {
        setErrorMessage("Zone ID is required.");
        setIsLoading(false);
        return;
      }

      const {
        data: zoneData,
        error: zoneError,
      } = await supabase
        .from("zones")
        .select(
          "id, warehouse_id, code, name, description, is_active, qr_code, qr_payload"
        )
        .eq("id", zoneId)
        .single();

      if (zoneError) {
        setErrorMessage(zoneError.message);
        setIsLoading(false);
        return;
      }

      const zone = zoneData as ZoneRow;

      setValues({
        warehouse_id: zone.warehouse_id ?? "",
        code: zone.code ?? "",
        name: zone.name ?? "",
        description: zone.description ?? "",
        is_active: zone.is_active ?? true,
      });

      setOriginalQrPayload(zone.qr_payload ?? null);

      setIsLoading(false);
    }

    loadFormData();
  }, [
    mode,
    zoneId,
    initialWarehouseId,
  ]);

  function updateField(
    field: keyof ZoneFormValues,
    value: string | boolean
  ) {
    setValues((current) => {
      const nextValues = {
        ...current,
        [field]: value,
      };

      if (
        field === "code" &&
        typeof value === "string"
      ) {
        nextValues.code =
          normalizeZoneCode(value);
      }

      return nextValues;
    });
  }

  function validateForm() {
    if (!values.warehouse_id) {
      return "Warehouse is required.";
    }

    if (!values.code.trim()) {
      return "Zone code is required.";
    }

    if (!values.name.trim()) {
      return "Zone name is required.";
    }

    if (!selectedWarehouse) {
      return "Selected warehouse is invalid.";
    }

    if (!generatedQrCode || !generatedQrPayload) {
      return "Zone QR identity could not be generated.";
    }

    return null;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const validationError =
      validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!selectedWarehouse) {
      setErrorMessage(
        "Selected warehouse could not be found."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const normalizedCode =
      normalizeZoneCode(values.code);

    const nextQrCode =
      buildZoneQrCode(
        selectedWarehouse.code,
        normalizedCode
      );

    const nextQrPayload =
      buildZoneQrPayload(
        selectedWarehouse.code,
        normalizedCode
      );

    const payload: {
      warehouse_id: string;
      code: string;
      name: string;
      description: string | null;
      is_active: boolean;
      qr_code: string;
      qr_payload: string;
      qr_svg_path?: null;
      qr_svg_url?: null;
      qr_generated_at?: null;
    } = {
      warehouse_id: values.warehouse_id,
      code: normalizedCode,
      name: values.name.trim(),
      description:
        values.description.trim() || null,
      is_active: values.is_active,
      qr_code: nextQrCode,
      qr_payload: nextQrPayload,
    };

    if (
      mode === "edit" &&
      originalQrPayload !== nextQrPayload
    ) {
      payload.qr_svg_path = null;
      payload.qr_svg_url = null;
      payload.qr_generated_at = null;
    }

    if (mode === "edit" && zoneId) {
      const { error } = await supabase
        .from("zones")
        .update(payload)
        .eq("id", zoneId);

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("zones")
        .insert(payload);

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    router.push(
      `/zones?warehouse=${values.warehouse_id}`
    );

    router.refresh();
  }

  function handleCancel() {
    if (values.warehouse_id) {
      router.push(
        `/zones?warehouse=${values.warehouse_id}`
      );
      return;
    }

    router.push("/zones");
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading zone...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const title =
    mode === "edit"
      ? "Edit Zone"
      : "Create Zone";

  const formDescription =
    mode === "edit"
      ? "Update zone master data, warehouse assignment, status, and QR identity."
      : "Create a warehouse zone for QR-based inventory operations.";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {title}
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {formDescription}
        </p>
      </div>

      {errorMessage && (
        <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        <WarehouseSelect
          value={values.warehouse_id}
          options={warehouses}
          onChange={(value) =>
            updateField(
              "warehouse_id",
              value
            )
          }
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Zone Code{" "}
            <span className="text-error-500">
              *
            </span>
          </label>

          <input
            value={values.code}
            onChange={(event) =>
              updateField(
                "code",
                event.target.value
              )
            }
            type="text"
            placeholder="A"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Zone codes are scoped to the
            selected warehouse. Example: A,
            B, C.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Zone Name{" "}
            <span className="text-error-500">
              *
            </span>
          </label>

          <input
            value={values.name}
            onChange={(event) =>
              updateField(
                "name",
                event.target.value
              )
            }
            type="text"
            placeholder="Fast Moving Zone"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Status
          </label>

          <button
            type="button"
            onClick={() =>
              updateField(
                "is_active",
                !values.is_active
              )
            }
            className={`flex h-11 w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm font-medium ${values.is_active
              ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
              : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
              }`}
          >
            <span>
              {values.is_active
                ? "Active"
                : "Inactive"}
            </span>

            <span>
              {values.is_active
                ? "Enabled"
                : "Disabled"}
            </span>
          </button>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Description
          </label>

          <textarea
            value={values.description}
            onChange={(event) =>
              updateField(
                "description",
                event.target.value
              )
            }
            rows={4}
            placeholder="Zone description"
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="md:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  QR Identity
                </h4>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  QR values are generated
                  automatically from the
                  warehouse code and zone code.
                </p>
              </div>

              {selectedWarehouse && (
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${warehouseTypeClass(
                    selectedWarehouse.warehouse_type
                  )}`}
                >
                  {formatWarehouseType(
                    selectedWarehouse.warehouse_type
                  )}{" "}
                  Warehouse
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  QR Code
                </label>

                <div className="min-h-11 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
                  {generatedQrCode || "-"}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  QR Payload
                </label>

                <div className="min-h-11 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
                  {generatedQrPayload || "-"}
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Example: warehouse MAIN +
              zone A generates{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                ZONE-MAIN-A
              </span>{" "}
              and{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                ZONE|MAIN|A
              </span>
              .
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? "Saving..."
            : mode === "edit"
              ? "Save Changes"
              : "Create Zone"}
        </button>
      </div>
    </form>
  );
}