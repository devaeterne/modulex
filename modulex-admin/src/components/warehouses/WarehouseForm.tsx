"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseFormValues = {
  code: string;
  name: string;
  description: string;
  warehouse_type: WarehouseType;
  address: string;
  city: string;
  country: string;
  is_active: boolean;
  qr_code: string;
  qr_payload: string;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  warehouse_type: WarehouseType;
  address: string | null;
  city: string | null;
  country: string | null;
  is_active: boolean;
  qr_code: string | null;
  qr_payload: string | null;
};

type DropdownOption = {
  value: string;
  label: string;
  description?: string;
};

type WarehouseFormProps = {
  mode: "create" | "edit";
  warehouseId?: string;
};

type CustomSelectProps = {
  label: string;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
};

const initialValues: WarehouseFormValues = {
  code: "",
  name: "",
  description: "",
  warehouse_type: "sellable",
  address: "",
  city: "",
  country: "",
  is_active: true,
  qr_code: "",
  qr_payload: "",
};

const warehouseTypeOptions: DropdownOption[] = [
  {
    value: "sellable",
    label: "Sellable",
    description: "Products in this warehouse can be used for sales and orders.",
  },
  {
    value: "non_sellable",
    label: "Non-sellable",
    description:
      "Products in this warehouse are blocked from sales, returns, defects, or inspection.",
  },
];

function CustomSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
      >
        <span className={selectedOption ? "" : "text-gray-400"}>
          {selectedOption?.label || placeholder}
        </span>
        <span className="ml-3 text-gray-500 dark:text-gray-400">▾</span>
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close dropdown"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${isSelected
                    ? "bg-brand-500 text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                    }`}
                >
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    {option.description && (
                      <span
                        className={`mt-0.5 block text-xs ${isSelected
                          ? "text-white/80"
                          : "text-gray-500 dark:text-gray-400"
                          }`}
                      >
                        {option.description}
                      </span>
                    )}
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

function normalizeWarehouseCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

function buildWarehouseQrCode(code: string) {
  const normalizedCode = normalizeWarehouseCode(code);

  if (!normalizedCode) return "";

  return `WH-${normalizedCode}`;
}

function buildWarehouseQrPayload(code: string) {
  const normalizedCode = normalizeWarehouseCode(code);

  if (!normalizedCode) return "";

  return `WH|${normalizedCode}`;
}

export default function WarehouseForm({
  mode,
  warehouseId,
}: WarehouseFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<WarehouseFormValues>(initialValues);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generatedQrCode = useMemo(
    () => buildWarehouseQrCode(values.code),
    [values.code]
  );

  const generatedQrPayload = useMemo(
    () => buildWarehouseQrPayload(values.code),
    [values.code]
  );

  useEffect(() => {
    async function loadWarehouse() {
      if (mode !== "edit" || !warehouseId) return;

      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("warehouses")
        .select(
          "id, code, name, description, warehouse_type, address, city, country, is_active, qr_code, qr_payload"
        )
        .eq("id", warehouseId)
        .single();

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      const warehouse = data as WarehouseRow;

      setValues({
        code: warehouse.code ?? "",
        name: warehouse.name ?? "",
        description: warehouse.description ?? "",
        warehouse_type: warehouse.warehouse_type ?? "sellable",
        address: warehouse.address ?? "",
        city: warehouse.city ?? "",
        country: warehouse.country ?? "",
        is_active: warehouse.is_active ?? true,
        qr_code: warehouse.qr_code ?? buildWarehouseQrCode(warehouse.code),
        qr_payload:
          warehouse.qr_payload ?? buildWarehouseQrPayload(warehouse.code),
      });

      setIsLoading(false);
    }

    loadWarehouse();
  }, [mode, warehouseId]);

  function updateField(field: keyof WarehouseFormValues, value: string | boolean) {
    setValues((current) => {
      const nextValues = {
        ...current,
        [field]: value,
      };

      if (field === "code" && typeof value === "string") {
        const normalizedCode = normalizeWarehouseCode(value);

        nextValues.code = normalizedCode;
        nextValues.qr_code = buildWarehouseQrCode(normalizedCode);
        nextValues.qr_payload = buildWarehouseQrPayload(normalizedCode);
      }

      return nextValues;
    });
  }

  function validateForm() {
    if (!values.code.trim()) return "Warehouse code is required.";
    if (!values.name.trim()) return "Warehouse name is required.";

    if (!["sellable", "non_sellable"].includes(values.warehouse_type)) {
      return "Warehouse type is invalid.";
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const normalizedCode = normalizeWarehouseCode(values.code);

    const payload = {
      code: normalizedCode,
      name: values.name.trim(),
      description: values.description.trim() || null,
      warehouse_type: values.warehouse_type,
      address: values.address.trim() || null,
      city: values.city.trim() || null,
      country: values.country.trim() || null,
      is_active: values.is_active,
      qr_code: buildWarehouseQrCode(normalizedCode),
      qr_payload: buildWarehouseQrPayload(normalizedCode),
    };

    if (mode === "edit" && warehouseId) {
      const { error } = await supabase
        .from("warehouses")
        .update(payload)
        .eq("id", warehouseId);

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
    } else {
      const { error } = await supabase.from("warehouses").insert(payload);

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    router.push("/warehouses");
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading warehouse...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const title = mode === "edit" ? "Edit Warehouse" : "Create Warehouse";

  const description =
    mode === "edit"
      ? "Update warehouse master data, warehouse type, and QR information."
      : "Create a new warehouse for QR-based stock operations.";

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
          {description}
        </p>
      </div>

      {errorMessage && (
        <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Warehouse Code <span className="text-error-500">*</span>
          </label>
          <input
            value={values.code}
            onChange={(event) => updateField("code", event.target.value)}
            type="text"
            placeholder="MAIN"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Example: MAIN, RETURN, DEFECT. This code is used inside QR payloads.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Warehouse Name <span className="text-error-500">*</span>
          </label>
          <input
            value={values.name}
            onChange={(event) => updateField("name", event.target.value)}
            type="text"
            placeholder="Main Warehouse"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <CustomSelect
          label="Warehouse Type"
          value={values.warehouse_type}
          placeholder="Select warehouse type"
          options={warehouseTypeOptions}
          onChange={(value) =>
            updateField("warehouse_type", value as WarehouseType)
          }
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Status
          </label>

          <button
            type="button"
            onClick={() => updateField("is_active", !values.is_active)}
            className={`flex h-11 w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm font-medium ${values.is_active
              ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
              : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
              }`}
          >
            <span>{values.is_active ? "Active" : "Inactive"}</span>
            <span>{values.is_active ? "Enabled" : "Disabled"}</span>
          </button>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Description
          </label>
          <textarea
            value={values.description}
            onChange={(event) => updateField("description", event.target.value)}
            rows={4}
            placeholder="Warehouse description"
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Address
          </label>
          <input
            value={values.address}
            onChange={(event) => updateField("address", event.target.value)}
            type="text"
            placeholder="Street address"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            City
          </label>
          <input
            value={values.city}
            onChange={(event) => updateField("city", event.target.value)}
            type="text"
            placeholder="City"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Country
          </label>
          <input
            value={values.country}
            onChange={(event) => updateField("country", event.target.value)}
            type="text"
            placeholder="Country"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Warehouse QR
          </h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            QR values are generated from the warehouse code.
          </p>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                QR Code
              </span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {generatedQrCode || "-"}
              </span>
            </div>

            <div>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                QR Payload
              </span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {generatedQrPayload || "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
        <button
          type="button"
          onClick={() => router.push("/warehouses")}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "Saving..."
            : mode === "edit"
              ? "Save Changes"
              : "Create Warehouse"}
        </button>
      </div>
    </form>
  );
}