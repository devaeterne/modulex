"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
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

type WarehouseFieldErrors = {
  code?: string;
  name?: string;
  warehouse_type?: string;
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
  const [fieldErrors, setFieldErrors] = useState<WarehouseFieldErrors>({});
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

  const selectedWarehouseType = warehouseTypeOptions.find(
    (option) => option.value === values.warehouse_type
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

  function clearFieldError(field: keyof WarehouseFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

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

    if (field === "code" || field === "name" || field === "warehouse_type") {
      clearFieldError(field);
    }
  }

  function validateForm() {
    const errors: WarehouseFieldErrors = {};

    if (!values.code.trim()) errors.code = "Warehouse code is required.";
    if (!values.name.trim()) errors.name = "Warehouse name is required.";

    if (!["sellable", "non_sellable"].includes(values.warehouse_type)) {
      errors.warehouse_type = "Warehouse type is invalid.";
    }

    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateForm();
    setFieldErrors(validationErrors);

    const firstInvalidField = [
      validationErrors.code ? "warehouse-code" : null,
      validationErrors.name ? "warehouse-name" : null,
      validationErrors.warehouse_type ? "warehouse-type" : null,
    ].find((field): field is string => Boolean(field));

    if (firstInvalidField) {
      setErrorMessage("Review the highlighted warehouse fields and try again.");
      requestAnimationFrame(() => document.getElementById(firstInvalidField)?.focus());
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

  const title = mode === "edit" ? "Edit Warehouse" : "Create Warehouse";
  const description =
    mode === "edit"
      ? "Update warehouse master data, warehouse type, and QR information."
      : "Create a new warehouse for QR-based stock operations.";

  if (isLoading) {
    return (
      <ComponentCard title={title} desc={description}>
        <Alert variant="info" title="Loading warehouse" message="Warehouse data is being loaded." />
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title={title} desc={description}>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {errorMessage ? (
          <div role="alert">
            <Alert variant="error" title="Unable to save warehouse" message={errorMessage} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="warehouse-code">
              Warehouse Code <span aria-hidden="true" className="text-error-500">*</span>
            </Label>
            <Input
              id="warehouse-code"
              value={values.code}
              onChange={(event) => updateField("code", event.target.value)}
              placeholder="MAIN"
              required
              error={Boolean(fieldErrors.code)}
              hint={
                fieldErrors.code ??
                "Example: MAIN, RETURN, DEFECT. This code is used inside QR payloads."
              }
            />
          </div>

          <div>
            <Label htmlFor="warehouse-name">
              Warehouse Name <span aria-hidden="true" className="text-error-500">*</span>
            </Label>
            <Input
              id="warehouse-name"
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Main Warehouse"
              required
              error={Boolean(fieldErrors.name)}
              hint={fieldErrors.name}
            />
          </div>

          <div>
            <Label htmlFor="warehouse-type">
              Warehouse Type <span aria-hidden="true" className="text-error-500">*</span>
            </Label>
            <Select
              id="warehouse-type"
              value={values.warehouse_type}
              options={warehouseTypeOptions.map(({ value, label }) => ({ value, label }))}
              onChange={(value) => updateField("warehouse_type", value as WarehouseType)}
              required
              error={Boolean(fieldErrors.warehouse_type)}
              ariaDescribedBy={fieldErrors.warehouse_type ? "warehouse-type-error" : undefined}
            />
            {fieldErrors.warehouse_type ? (
              <p
                id="warehouse-type-error"
                role="alert"
                className="mt-1.5 text-xs text-error-600 dark:text-error-300"
              >
                {fieldErrors.warehouse_type}
              </p>
            ) : selectedWarehouseType?.description ? (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {selectedWarehouseType.description}
              </p>
            ) : null}
          </div>

          <div>
            <Label>Status</Label>
            <div className="flex h-11 items-center rounded-lg border border-gray-200 px-4 dark:border-gray-800 dark:bg-gray-900">
              <Checkbox
                id="warehouse-active"
                label={values.is_active ? "Active" : "Inactive"}
                checked={values.is_active}
                onChange={(checked) => updateField("is_active", checked)}
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="warehouse-description">Description</Label>
            <TextArea
              id="warehouse-description"
              value={values.description}
              onChange={(value) => updateField("description", value)}
              rows={4}
              placeholder="Warehouse description"
            />
          </div>

          <div>
            <Label htmlFor="warehouse-address">Address</Label>
            <Input
              id="warehouse-address"
              value={values.address}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="Street address"
            />
          </div>

          <div>
            <Label htmlFor="warehouse-city">City</Label>
            <Input
              id="warehouse-city"
              value={values.city}
              onChange={(event) => updateField("city", event.target.value)}
              placeholder="City"
            />
          </div>

          <div>
            <Label htmlFor="warehouse-country">Country</Label>
            <Input
              id="warehouse-country"
              value={values.country}
              onChange={(event) => updateField("country", event.target.value)}
              placeholder="Country"
            />
          </div>

          <ComponentCard
            className="md:col-span-2"
            title="Warehouse QR"
            desc="QR values are generated from the warehouse code."
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">QR Code</dt>
                <dd className="mt-1 break-all text-sm font-medium text-gray-800 dark:text-white/90">
                  {generatedQrCode || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">QR Payload</dt>
                <dd className="mt-1 break-all text-sm font-medium text-gray-800 dark:text-white/90">
                  {generatedQrPayload || "-"}
                </dd>
              </div>
            </dl>
          </ComponentCard>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => router.push("/warehouses")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Saving..."
              : mode === "edit"
                ? "Save Changes"
                : "Create Warehouse"}
          </Button>
        </div>
      </form>
    </ComponentCard>
  );
}
