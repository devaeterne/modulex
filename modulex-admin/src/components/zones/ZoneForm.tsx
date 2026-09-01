"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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

const initialValues: ZoneFormValues = {
  warehouse_id: "",
  code: "",
  name: "",
  description: "",
  is_active: true,
};

function normalizeZoneCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-_]/g, "");
}

function normalizeWarehouseCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-_]/g, "");
}

function buildZoneQrCode(warehouseCode: string, zoneCode: string) {
  const normalizedWarehouseCode = normalizeWarehouseCode(warehouseCode);
  const normalizedZoneCode = normalizeZoneCode(zoneCode);
  if (!normalizedWarehouseCode || !normalizedZoneCode) return "";
  return `ZONE-${normalizedWarehouseCode}-${normalizedZoneCode}`;
}

function buildZoneQrPayload(warehouseCode: string, zoneCode: string) {
  const normalizedWarehouseCode = normalizeWarehouseCode(warehouseCode);
  const normalizedZoneCode = normalizeZoneCode(zoneCode);
  if (!normalizedWarehouseCode || !normalizedZoneCode) return "";
  return `ZONE|${normalizedWarehouseCode}|${normalizedZoneCode}`;
}

function formatWarehouseType(type: WarehouseType) {
  return type === "sellable" ? "Sellable" : "Non-sellable";
}

export default function ZoneForm({ mode, zoneId, initialWarehouseId }: ZoneFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ZoneFormValues>(initialValues);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [originalQrPayload, setOriginalQrPayload] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === values.warehouse_id) ?? null,
    [warehouses, values.warehouse_id],
  );

  const generatedQrCode = useMemo(
    () => buildZoneQrCode(selectedWarehouse?.code ?? "", values.code),
    [selectedWarehouse, values.code],
  );

  const generatedQrPayload = useMemo(
    () => buildZoneQrPayload(selectedWarehouse?.code ?? "", values.code),
    [selectedWarehouse, values.code],
  );

  useEffect(() => {
    async function loadFormData() {
      setIsLoading(true);
      setErrorMessage(null);

      const { data: warehouseData, error: warehouseError } = await supabase
        .from("warehouses")
        .select("id, code, name, warehouse_type, is_active")
        .order("code", { ascending: true });

      if (warehouseError) {
        setErrorMessage(warehouseError.message);
        setIsLoading(false);
        return;
      }

      const loadedWarehouses = (warehouseData as WarehouseOption[]) ?? [];
      setWarehouses(loadedWarehouses);

      if (mode === "create") {
        const requestedWarehouse =
          initialWarehouseId && loadedWarehouses.some((warehouse) => warehouse.id === initialWarehouseId)
            ? initialWarehouseId
            : "";
        setValues({ ...initialValues, warehouse_id: requestedWarehouse });
        setOriginalQrPayload(null);
        setIsLoading(false);
        return;
      }

      if (!zoneId) {
        setErrorMessage("Zone ID is required.");
        setIsLoading(false);
        return;
      }

      const { data: zoneData, error: zoneError } = await supabase
        .from("zones")
        .select("id, warehouse_id, code, name, description, is_active, qr_code, qr_payload")
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

    void loadFormData();
  }, [mode, zoneId, initialWarehouseId]);

  function updateField(field: keyof ZoneFormValues, value: string | boolean) {
    setValues((current) => {
      const nextValues = { ...current, [field]: value } as ZoneFormValues;
      if (field === "code" && typeof value === "string") {
        nextValues.code = normalizeZoneCode(value);
      }
      return nextValues;
    });
  }

  function validateForm() {
    if (!values.warehouse_id) return "Warehouse is required.";
    if (!values.code.trim()) return "Zone code is required.";
    if (!values.name.trim()) return "Zone name is required.";
    if (!selectedWarehouse) return "Selected warehouse is invalid.";
    if (!generatedQrCode || !generatedQrPayload) return "Zone QR identity could not be generated.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (!selectedWarehouse) {
      setErrorMessage("Selected warehouse could not be found.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const normalizedCode = normalizeZoneCode(values.code);
    const nextQrCode = buildZoneQrCode(selectedWarehouse.code, normalizedCode);
    const nextQrPayload = buildZoneQrPayload(selectedWarehouse.code, normalizedCode);
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
      description: values.description.trim() || null,
      is_active: values.is_active,
      qr_code: nextQrCode,
      qr_payload: nextQrPayload,
    };

    if (mode === "edit" && originalQrPayload !== nextQrPayload) {
      payload.qr_svg_path = null;
      payload.qr_svg_url = null;
      payload.qr_generated_at = null;
    }

    if (mode === "edit" && zoneId) {
      const { error } = await supabase.from("zones").update(payload).eq("id", zoneId);
      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
    } else {
      const { error } = await supabase.from("zones").insert(payload);
      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    router.push(`/zones?warehouse=${values.warehouse_id}`);
    router.refresh();
  }

  function handleCancel() {
    router.push(values.warehouse_id ? `/zones?warehouse=${values.warehouse_id}` : "/zones");
  }

  const title = mode === "edit" ? "Edit Zone" : "Create Zone";
  const description =
    mode === "edit"
      ? "Update zone master data, warehouse assignment, status, and QR identity."
      : "Create a warehouse zone for QR-based inventory operations.";

  if (isLoading) {
    return (
      <ComponentCard title={title} desc={description}>
        <Alert variant="info" title="Loading zone" message="Zone data and warehouse options are being loaded." />
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title={title} desc={description}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage ? (
          <Alert variant="error" title="Unable to save zone" message={errorMessage} />
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="zone-warehouse">
              Warehouse <span className="text-error-500">*</span>
            </Label>
            <Select
              id="zone-warehouse"
              value={values.warehouse_id}
              allowEmpty
              placeholder="Select warehouse"
              options={warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: `${warehouse.code} — ${warehouse.name} · ${formatWarehouseType(warehouse.warehouse_type)}${warehouse.is_active ? "" : " · Inactive"}`,
              }))}
              onChange={(value) => updateField("warehouse_id", value)}
            />
          </div>

          <div>
            <Label htmlFor="zone-code">
              Zone Code <span className="text-error-500">*</span>
            </Label>
            <Input
              id="zone-code"
              value={values.code}
              onChange={(event) => updateField("code", event.target.value)}
              placeholder="A"
              hint="Zone codes are scoped to the selected warehouse. Example: A, B, C."
            />
          </div>

          <div>
            <Label htmlFor="zone-name">
              Zone Name <span className="text-error-500">*</span>
            </Label>
            <Input
              id="zone-name"
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Fast Moving Zone"
            />
          </div>

          <div>
            <Label htmlFor="zone-status">Status</Label>
            <Select
              id="zone-status"
              value={values.is_active ? "active" : "inactive"}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              onChange={(value) => updateField("is_active", value === "active")}
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="zone-description">Description</Label>
            <TextArea
              id="zone-description"
              value={values.description}
              onChange={(value) => updateField("description", value)}
              rows={4}
              placeholder="Zone description"
            />
          </div>

          <ComponentCard
            className="md:col-span-2"
            title="QR Identity"
            desc="QR values are generated automatically from the warehouse code and zone code."
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                {generatedQrPayload ? (
                  <QRCodeSVG value={generatedQrPayload} size={160} level="M" includeMargin={false} />
                ) : (
                  <div className="flex h-[160px] w-[160px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400 dark:bg-white/[0.03]">
                    QR Preview
                  </div>
                )}
              </div>

              <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">QR Code</p>
                  <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                    {generatedQrCode || "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">QR Payload</p>
                  <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-800 dark:text-white/90">
                    {generatedQrPayload || "-"}
                  </p>
                </div>
                {selectedWarehouse ? (
                  <div className="md:col-span-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={selectedWarehouse.warehouse_type === "sellable" ? "success" : "warning"} size="sm">
                        {formatWarehouseType(selectedWarehouse.warehouse_type)} Warehouse
                      </Badge>
                      <Badge color={values.is_active ? "success" : "light"} size="sm">
                        {values.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {selectedWarehouse.code} / {normalizeZoneCode(values.code) || "-"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {selectedWarehouse.name} → {values.name.trim() || "Zone"}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </ComponentCard>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={isSubmitting} onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Zone"}
          </Button>
        </div>
      </form>
    </ComponentCard>
  );
}
