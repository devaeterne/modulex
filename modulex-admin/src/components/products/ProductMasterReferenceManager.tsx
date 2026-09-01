"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import MultiSelect from "@/components/form/MultiSelect";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type Kind = "product_types" | "units_of_measure";

type Uom = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type Row = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  pricing_model?: string;
  inventory_tracking?: boolean;
  reservable?: boolean;
  requires_variant_identity?: boolean;
  qr_required?: boolean;
  store_eligible?: boolean;
  default_uom_id?: string | null;
  allows_decimal?: boolean;
  product_count?: number;
  allowed_uoms?: string[];
};

type FormState = {
  name: string;
  code: string;
  description: string;
  pricing_model: string;
  inventory_tracking: boolean;
  reservable: boolean;
  requires_variant_identity: boolean;
  qr_required: boolean;
  store_eligible: boolean;
  allows_decimal: boolean;
  default_uom_id: string;
  allowed_uoms: string[];
};

const pricingLabels: Record<string, string> = {
  price_group: "Price Group",
  countertop_material_band: "Countertop Material Band",
  none: "No Commercial Pricing",
};

const pricingDescriptions: Record<string, string> = {
  price_group: "Uses the standard product and customer price-group engine.",
  countertop_material_band: "Uses the countertop material-band pricing engine.",
  none: "No commercial product pricing is assigned by this Product Type.",
};

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const pricingFilterOptions = [
  { value: "all", label: "All Pricing Models" },
  { value: "price_group", label: "Price Group" },
  { value: "countertop_material_band", label: "Countertop Material Band" },
  { value: "none", label: "No Commercial Pricing" },
];

const pricingModelOptions = pricingFilterOptions.slice(1);

const inventoryOptions = [
  { value: "all", label: "All Inventory" },
  { value: "tracked", label: "Inventory Tracked" },
  { value: "untracked", label: "Not Tracked" },
];

const quantityOptions = [
  { value: "all", label: "All Quantity Types" },
  { value: "whole", label: "Whole numbers" },
  { value: "decimal", label: "Decimals allowed" },
];

const emptyForm: FormState = {
  name: "",
  code: "",
  description: "",
  pricing_model: "none",
  inventory_tracking: true,
  reservable: true,
  requires_variant_identity: true,
  qr_required: false,
  store_eligible: false,
  allows_decimal: false,
  default_uom_id: "",
  allowed_uoms: [],
};

function friendlyError(message: string, kind: Kind) {
  const value = message.toLowerCase();

  if (value.includes("default") && value.includes("allow")) {
    return "Default UOM must be one of the allowed UOMs.";
  }
  if (value.includes("active product") && kind === "product_types") {
    return "Product Type is used by active products. Reassign products before deactivating.";
  }
  if (
    kind === "units_of_measure" &&
    (value.includes("referenced") || value.includes("active product") || value.includes("in use"))
  ) {
    return "Unit is used by active products or Product Types. Reassign references before deactivating.";
  }
  if (value.includes("duplicate") || value.includes("unique")) {
    return "A record with this name or code already exists.";
  }

  return "This change could not be saved. Check the values and try again.";
}

export default function ProductMasterReferenceManager({ kind }: { kind: Kind }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [quantityFilter, setQuantityFilter] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cols =
      kind === "product_types"
        ? "id,code,name,description,is_active,pricing_model,inventory_tracking,reservable,requires_variant_identity,qr_required,store_eligible,default_uom_id,products(count)"
        : "id,code,name,is_active,allows_decimal,products(count)";

    const { data, error: rowError } = await supabase.from(kind).select(cols).order("name");

    if (rowError) {
      setRows([]);
      setError("Unable to load reference data. Please retry.");
      setLoading(false);
      return;
    }

    const source = (data ?? []) as unknown as Array<Row & { products?: Array<{ count: number }> }>;
    const allowed = new Map<string, string[]>();

    if (kind === "product_types") {
      const [relationResult, uomResult] = await Promise.all([
        supabase.from("product_type_allowed_uoms").select("product_type_id,uom_id"),
        supabase.from("units_of_measure").select("id,name,code,is_active").order("sort_order"),
      ]);

      if (relationResult.error || uomResult.error) {
        setRows([]);
        setUoms([]);
        setError("Unable to load Product Type unit references. Please retry.");
        setLoading(false);
        return;
      }

      (relationResult.data ?? []).forEach((relation) => {
        allowed.set(relation.product_type_id, [
          ...(allowed.get(relation.product_type_id) ?? []),
          relation.uom_id,
        ]);
      });
      setUoms((uomResult.data ?? []) as Uom[]);
    } else {
      setUoms([]);
    }

    setRows(
      source.map((row) => ({
        ...row,
        allowed_uoms: allowed.get(row.id) ?? [],
        product_count: row.products?.[0]?.count ?? 0,
      }))
    );
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesQuery =
        !normalizedQuery || `${row.name} ${row.code}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        status === "all" || (status === "active" ? row.is_active : !row.is_active);
      const matchesInventory =
        kind !== "product_types" ||
        inventoryFilter === "all" ||
        (inventoryFilter === "tracked" ? row.inventory_tracking : !row.inventory_tracking);
      const matchesPricing =
        kind !== "product_types" || pricingFilter === "all" || row.pricing_model === pricingFilter;
      const matchesQuantity =
        kind !== "units_of_measure" ||
        quantityFilter === "all" ||
        (quantityFilter === "decimal" ? row.allows_decimal : !row.allows_decimal);

      return matchesQuery && matchesStatus && matchesInventory && matchesPricing && matchesQuantity;
    });
  }, [rows, query, status, inventoryFilter, pricingFilter, quantityFilter, kind]);

  const selectableUoms = useMemo(
    () => uoms.filter((uom) => uom.is_active || form.allowed_uoms.includes(uom.id)),
    [uoms, form.allowed_uoms]
  );

  function openEditor(row?: Row) {
    setError(null);
    setSuccess(null);
    setEditing(row ?? null);
    setForm(
      row
        ? {
            ...emptyForm,
            name: row.name,
            code: row.code,
            description: row.description ?? "",
            pricing_model: row.pricing_model ?? "none",
            inventory_tracking: row.inventory_tracking ?? true,
            reservable: row.reservable ?? true,
            requires_variant_identity: row.requires_variant_identity ?? true,
            qr_required: row.qr_required ?? false,
            store_eligible: row.store_eligible ?? false,
            allows_decimal: row.allows_decimal ?? false,
            default_uom_id: row.default_uom_id ?? "",
            allowed_uoms: row.allowed_uoms ?? [],
          }
        : emptyForm
    );
    setIsEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setIsEditorOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  }

  async function save() {
    if (!form.name.trim() || !form.code.trim()) {
      setError("Name and code are required.");
      return;
    }

    if (
      kind === "product_types" &&
      (!form.allowed_uoms.length ||
        !form.default_uom_id ||
        !form.allowed_uoms.includes(form.default_uom_id))
    ) {
      setError("Select at least one allowed UOM and a default from that list.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const effectiveReservable = form.inventory_tracking ? form.reservable : false;
    const result =
      kind === "product_types"
        ? await supabase.rpc("save_product_type_v2", {
            p_id: editing?.id ?? null,
            p_code: form.code.trim().toUpperCase(),
            p_name: form.name.trim(),
            p_description: form.description.trim() || null,
            p_default_uom_id: form.default_uom_id,
            p_allowed_uom_ids: form.allowed_uoms,
            p_inventory_tracking: form.inventory_tracking,
            p_reservable: effectiveReservable,
            p_requires_variant_identity: form.requires_variant_identity,
            p_pricing_model: form.pricing_model,
            p_qr_required: form.qr_required,
            p_store_eligible: form.store_eligible,
          })
        : editing
          ? await supabase
              .from(kind)
              .update({
                name: form.name.trim(),
                code: form.code.trim().toUpperCase(),
                allows_decimal: form.allows_decimal,
              })
              .eq("id", editing.id)
          : await supabase.from(kind).insert({
              name: form.name.trim(),
              code: form.code.trim().toUpperCase(),
              allows_decimal: form.allows_decimal,
            });

    if (result.error) {
      setError(friendlyError(result.error.message, kind));
      setSaving(false);
      return;
    }

    const successMessage = `${kind === "product_types" ? "Product Type" : "Unit"} saved successfully.`;
    setIsEditorOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
    setSuccess(successMessage);
    setSaving(false);
  }

  async function toggle(row: Row) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error: toggleError } = await supabase
      .from(kind)
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (toggleError) {
      setError(friendlyError(toggleError.message, kind));
      setSaving(false);
      return;
    }

    const successMessage = `${row.name} ${row.is_active ? "deactivated" : "activated"}.`;
    await load();
    setSuccess(successMessage);
    setSaving(false);
  }

  const title = kind === "product_types" ? "Product Types" : "Units of Measure";
  const description =
    kind === "product_types"
      ? "Define how products behave across inventory, pricing, QR and Store."
      : "Manage controlled units used by products and inventory.";
  const addLabel = kind === "product_types" ? "Add Product Type" : "Add Unit";
  const columnCount = kind === "product_types" ? 11 : 6;
  const editorTitle =
    kind === "product_types"
      ? editing
        ? "Edit Product Type"
        : "Add Product Type"
      : editing
        ? "Edit Unit"
        : "Add Unit";
  const editorDescription =
    kind === "product_types"
      ? "Configure identity, inventory, units, pricing and product capabilities."
      : "Define the controlled unit used by products and inventory.";

  return (
    <div className="space-y-6">
      <ComponentCard title={title} desc={description}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div
            className={
              kind === "product_types"
                ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
                : "grid gap-4 md:grid-cols-3"
            }
          >
            <div>
              <Label htmlFor={`${kind}-search`}>Search</Label>
              <Input
                id={`${kind}-search`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or code"
              />
            </div>

            <div>
              <Label htmlFor="reference-status">Status</Label>
              <Select id="reference-status" options={statusOptions} value={status} onChange={setStatus} />
            </div>

            {kind === "product_types" ? (
              <>
                <div>
                  <Label htmlFor="product-type-pricing-filter">Pricing Model</Label>
                  <Select
                    id="product-type-pricing-filter"
                    options={pricingFilterOptions}
                    value={pricingFilter}
                    onChange={setPricingFilter}
                  />
                </div>
                <div>
                  <Label htmlFor="product-type-inventory-filter">Inventory</Label>
                  <Select
                    id="product-type-inventory-filter"
                    options={inventoryOptions}
                    value={inventoryFilter}
                    onChange={setInventoryFilter}
                  />
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor="uom-quantity-filter">Quantity Type</Label>
                <Select
                  id="uom-quantity-filter"
                  options={quantityOptions}
                  value={quantityFilter}
                  onChange={setQuantityFilter}
                />
              </div>
            )}
          </div>

          <Button className="w-full xl:w-auto" onClick={() => openEditor()}>
            {addLabel}
          </Button>
        </div>
      </ComponentCard>

      <ComponentCard
        title={kind === "product_types" ? "Product Type Directory" : "Unit Directory"}
        desc={
          kind === "product_types"
            ? "Review capabilities, unit rules, pricing behavior and product usage."
            : "Review quantity behavior, product usage and lifecycle status."
        }
      >
        {!isEditorOpen && error ? (
          <div className="space-y-3">
            <Alert variant="error" title="Reference data unavailable" message={error} />
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}

        {success ? <Alert variant="success" title="Saved" message={success} /> : null}

        {loading ? (
          <Alert
            variant="info"
            title={`Loading ${title}`}
            message="Reference data is being loaded."
          />
        ) : (
          <TableViewport>
            <Table
              variant="admin"
              minWidth={kind === "product_types" ? "extraWide" : "standard"}
            >
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin" className="text-left">
                    {kind === "product_types" ? "Product Type" : "Unit"}
                  </TableCell>
                  <TableCell isHeader variant="admin" className="text-left">
                    Code
                  </TableCell>
                  {kind === "product_types" ? (
                    <>
                      <TableCell isHeader variant="admin" className="text-left">
                        Default UOM
                      </TableCell>
                      <TableCell isHeader variant="admin" className="text-left">
                        Allowed UOMs
                      </TableCell>
                      <TableCell isHeader variant="admin" className="text-left">
                        Inventory
                      </TableCell>
                      <TableCell isHeader variant="admin" className="text-left">
                        Pricing Model
                      </TableCell>
                      <TableCell isHeader variant="admin" className="text-left">
                        QR
                      </TableCell>
                      <TableCell isHeader variant="admin" className="text-left">
                        Store
                      </TableCell>
                    </>
                  ) : (
                    <TableCell isHeader variant="admin" className="text-left">
                      Quantity Type
                    </TableCell>
                  )}
                  <TableCell isHeader variant="admin" className="text-left">
                    Products
                  </TableCell>
                  <TableCell isHeader variant="admin" className="text-left">
                    Status
                  </TableCell>
                  <TableCell isHeader variant="admin" className="text-right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>

              <TableBody variant="admin">
                {visible.length === 0 ? (
                  <TableStateRow colSpan={columnCount}>
                    No {title.toLowerCase()} match the current filters.
                  </TableStateRow>
                ) : (
                  visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell variant="admin" className="align-top">
                        <div className="space-y-1">
                          <span>{row.name}</span>
                          {row.description ? <small className="text-gray-500 dark:text-gray-400">{row.description}</small> : null}
                        </div>
                      </TableCell>

                      <TableCell variant="admin" className="align-top">
                        <Badge color="light" size="sm">
                          {row.code}
                        </Badge>
                      </TableCell>

                      {kind === "product_types" ? (
                        <>
                          <TableCell variant="admin" className="align-top">
                            <Badge color="primary" size="sm">
                              {uoms.find((uom) => uom.id === row.default_uom_id)?.code ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell variant="admin" className="align-top">
                            <div className="flex flex-wrap gap-1">
                              {(row.allowed_uoms ?? []).length ? (
                                (row.allowed_uoms ?? []).map((id) => (
                                  <Badge key={id} color="light" size="sm">
                                    {uoms.find((uom) => uom.id === id)?.code ?? "Unknown"}
                                  </Badge>
                                ))
                              ) : (
                                <Badge color="light" size="sm">
                                  None
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell variant="admin" className="align-top">
                            <div className="flex flex-wrap gap-1">
                              <Badge color={row.inventory_tracking ? "success" : "light"} size="sm">
                                {row.inventory_tracking ? "Tracked" : "Not tracked"}
                              </Badge>
                              <Badge color={row.reservable ? "info" : "light"} size="sm">
                                {row.reservable ? "Reservable" : "Not reservable"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell variant="admin" className="align-top">
                            <Badge color="info" size="sm">
                              {pricingLabels[row.pricing_model ?? "none"]}
                            </Badge>
                          </TableCell>
                          <TableCell variant="admin" className="align-top">
                            <Badge color={row.qr_required ? "warning" : "light"} size="sm">
                              {row.qr_required ? "Required" : "Optional"}
                            </Badge>
                          </TableCell>
                          <TableCell variant="admin" className="align-top">
                            <Badge color={row.store_eligible ? "success" : "light"} size="sm">
                              {row.store_eligible ? "Eligible" : "Not eligible"}
                            </Badge>
                          </TableCell>
                        </>
                      ) : (
                        <TableCell variant="admin" className="align-top">
                          <Badge color={row.allows_decimal ? "info" : "light"} size="sm">
                            {row.allows_decimal ? "Decimals allowed" : "Whole numbers"}
                          </Badge>
                        </TableCell>
                      )}

                      <TableCell variant="admin" className="align-top">
                        <Link
                          href={`/products?${kind === "product_types" ? "type" : "uom"}=${row.id}`}
                          className="font-medium underline underline-offset-2"
                        >
                          {row.product_count ?? 0} · View Products
                        </Link>
                      </TableCell>

                      <TableCell variant="admin" className="align-top">
                        <Badge color={row.is_active ? "success" : "light"} size="sm">
                          {row.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>

                      <TableCell variant="admin" className="text-right align-top">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditor(row)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void toggle(row)}
                          >
                            {row.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableViewport>
        )}
      </ComponentCard>

      <Modal
        isOpen={isEditorOpen}
        onClose={closeEditor}
        className="m-4 max-w-[960px] overflow-hidden"
      >
        <div className="flex max-h-[calc(100vh-2rem)] flex-col sm:max-h-[calc(100vh-3rem)]">
          <div className="shrink-0 border-b border-gray-200 px-4 py-4 pr-14 dark:border-gray-800 sm:px-6 sm:py-5 sm:pr-20">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{editorTitle}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{editorDescription}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="space-y-5">
              {error ? <Alert variant="error" title="Unable to save" message={error} /> : null}

              {kind === "product_types" ? (
                <>
                  <ComponentCard
                    title="Identity"
                    desc="Set the canonical identity for this Product Type."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="product-type-name">Name</Label>
                        <Input
                          id="product-type-name"
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Product Type name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="product-type-code">Code</Label>
                        <Input
                          id="product-type-code"
                          value={form.code}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              code: event.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="CODE"
                          hint="Codes are normalized to uppercase."
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="product-type-description">Description</Label>
                        <TextArea
                          id="product-type-description"
                          value={form.description}
                          onChange={(value) =>
                            setForm((current) => ({ ...current, description: value }))
                          }
                          placeholder="Describe how this Product Type is used."
                        />
                      </div>
                    </div>
                  </ComponentCard>

                  <ComponentCard
                    title="Inventory Behavior"
                    desc="Control whether products of this type participate in inventory and reservations."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Checkbox
                        id="product-type-inventory"
                        label="Inventory Tracking"
                        checked={form.inventory_tracking}
                        onChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            inventory_tracking: checked,
                            reservable: checked ? current.reservable : false,
                          }))
                        }
                      />
                      <div className="space-y-2">
                        <Checkbox
                          id="product-type-reservable"
                          label="Reservable"
                          checked={form.reservable}
                          disabled={!form.inventory_tracking}
                          onChange={(checked) =>
                            setForm((current) => ({ ...current, reservable: checked }))
                          }
                        />
                        {!form.inventory_tracking ? (
                          <small className="text-gray-500 dark:text-gray-400">Reservation requires inventory tracking.</small>
                        ) : null}
                      </div>
                    </div>
                  </ComponentCard>

                  <ComponentCard
                    title="Units of Measure"
                    desc="Choose the allowed units first, then select exactly one default unit."
                  >
                    <div className="grid gap-4 lg:grid-cols-2">
                      <MultiSelect
                        key={`${editing?.id ?? "new"}-${isEditorOpen ? "open" : "closed"}`}
                        label="Allowed Units"
                        options={selectableUoms.map((uom) => ({
                          value: uom.id,
                          text: `${uom.name} (${uom.code})${uom.is_active ? "" : " — Inactive"}`,
                          selected: form.allowed_uoms.includes(uom.id),
                        }))}
                        defaultSelected={form.allowed_uoms}
                        onChange={(selected) =>
                          setForm((current) => ({
                            ...current,
                            allowed_uoms: selected,
                            default_uom_id: selected.includes(current.default_uom_id)
                              ? current.default_uom_id
                              : "",
                          }))
                        }
                      />
                      <div>
                        <Label htmlFor="product-type-default-uom">Default Unit</Label>
                        <Select
                          id="product-type-default-uom"
                          placeholder="Select default unit"
                          value={form.default_uom_id}
                          options={form.allowed_uoms.map((id) => {
                            const uom = uoms.find((item) => item.id === id);
                            return {
                              value: id,
                              label: uom ? `${uom.name} (${uom.code})` : "Unknown unit",
                            };
                          })}
                          onChange={(value) =>
                            setForm((current) => ({ ...current, default_uom_id: value }))
                          }
                        />
                      </div>
                    </div>
                  </ComponentCard>

                  <ComponentCard
                    title="Pricing Behavior"
                    desc="Select the supported pricing engine. Pricing values do not belong in Product Type."
                  >
                    <div className="space-y-2">
                      <Label htmlFor="product-type-pricing-model">Pricing Model</Label>
                      <Select
                        id="product-type-pricing-model"
                        options={pricingModelOptions}
                        value={form.pricing_model}
                        onChange={(value) =>
                          setForm((current) => ({ ...current, pricing_model: value }))
                        }
                      />
                      <small className="text-gray-500 dark:text-gray-400">{pricingDescriptions[form.pricing_model]}</small>
                    </div>
                  </ComponentCard>

                  <ComponentCard
                    title="Product Behavior & Capabilities"
                    desc="Configure identity, QR and Store eligibility without changing publication state."
                  >
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Checkbox
                          id="product-type-variant-identity"
                          label="Requires Variant Identity"
                          checked={form.requires_variant_identity}
                          onChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              requires_variant_identity: checked,
                            }))
                          }
                        />
                        <small className="text-gray-500 dark:text-gray-400">Requires family/base-product and color identity when enabled.</small>
                      </div>
                      <Checkbox
                        id="product-type-qr-required"
                        label="QR Required"
                        checked={form.qr_required}
                        onChange={(checked) =>
                          setForm((current) => ({ ...current, qr_required: checked }))
                        }
                      />
                      <div className="space-y-2">
                        <Checkbox
                          id="product-type-store-eligible"
                          label="Store Eligible"
                          checked={form.store_eligible}
                          onChange={(checked) =>
                            setForm((current) => ({ ...current, store_eligible: checked }))
                          }
                        />
                        <small className="text-gray-500 dark:text-gray-400">Store eligibility does not publish a product automatically.</small>
                      </div>
                    </div>
                  </ComponentCard>
                </>
              ) : (
                <>
                  <ComponentCard
                    title="Unit Details"
                    desc="Define the controlled unit used by products and inventory."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="uom-name">Name</Label>
                        <Input
                          id="uom-name"
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Unit name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="uom-code">Code</Label>
                        <Input
                          id="uom-code"
                          value={form.code}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              code: event.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="CODE"
                          hint="Codes are normalized to uppercase."
                        />
                      </div>
                    </div>
                  </ComponentCard>

                  <ComponentCard
                    title="Quantity Behavior"
                    desc="Choose whether this unit supports fractional quantities."
                  >
                    <div className="space-y-2">
                      <Checkbox
                        id="uom-allows-decimal"
                        label="Allows Decimal Quantities"
                        checked={form.allows_decimal}
                        onChange={(checked) =>
                          setForm((current) => ({ ...current, allows_decimal: checked }))
                        }
                      />
                      <small className="text-gray-500 dark:text-gray-400">
                        Whole units suit Piece or Slab. Decimal units support fractional quantities such as
                        SQ_FT or LINEAR_FT.
                      </small>
                    </div>
                  </ComponentCard>
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button className="w-full sm:w-auto" variant="outline" disabled={saving} onClick={closeEditor}>
                Cancel
              </Button>
              <Button className="w-full sm:w-auto" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
