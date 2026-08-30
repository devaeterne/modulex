"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { parseDbDecimal } from "@/lib/validation";

type ProductStatus = "active" | "inactive" | "archived";

type ProductFormValues = {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  brand_id: string;
  category_id: string;
  base_product_code: string;
  color_code: string;
  color_name: string;
  unit: string;
  min_stock_level: string;
  status: ProductStatus;
  qr_value: string;
  qr_svg_url: string;
  qr_svg_path: string;
  qr_generated_at: string;
};

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand_id: string | null;
  category_id: string | null;
  base_product_code: string | null;
  color_code: string | null;
  color_name: string | null;
  unit: string;
  min_stock_level: number;
  status: ProductStatus;
  qr_value: string | null;
  qr_svg_url: string | null;
  qr_svg_path: string | null;
  qr_generated_at: string | null;
};

type SelectOption = {
  id: string;
  name: string;
};

type DropdownOption = {
  value: string;
  label: string;
};

type ProductFormProps = {
  mode: "create" | "edit";
  productId?: string;
};

type CustomSelectProps = {
  label: string;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
};

type ProductWriteError = {
  code?: string;
  message?: string;
};

const initialValues: ProductFormValues = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  brand_id: "",
  category_id: "",
  base_product_code: "",
  color_code: "",
  color_name: "",
  unit: "piece",
  min_stock_level: "0",
  status: "active",
  qr_value: "",
  qr_svg_url: "",
  qr_svg_path: "",
  qr_generated_at: "",
};

function productWriteErrorMessage(error: ProductWriteError) {
  const message = error.message ?? "";

  if (
    error.code === "23505" &&
    (message.includes("ux_products_sku_ci") || message.includes("products_sku_key"))
  ) {
    return "SKU already exists. Use a unique SKU.";
  }

  if (
    error.code === "23505" &&
    (message.includes("ux_products_barcode_ci") || message.includes("products_barcode_key"))
  ) {
    return "Barcode already exists. Use a unique barcode or leave it empty.";
  }

  if (error.code === "23505" && message.includes("ux_products_family_color_ci")) {
    return "This product family already has a variant with the same color code.";
  }

  if (message.includes("All variants in a product family")) {
    return "All variants in the same product family must use the same brand and category.";
  }

  if (message.includes("Active products require an active brand and category")) {
    return "Active products require an active brand and category.";
  }

  if (message.includes("on-hand or reserved stock remains")) {
    return "This product still has on-hand or reserved stock. Clear stock before deactivating or archiving it.";
  }

  if (message.includes("Archived product status is terminal")) {
    return "Archived products cannot be reactivated.";
  }

  return "We couldn’t save the product. Review the master data and try again.";
}

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
        className="flex h-11 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
      >
        <span className={selectedOption ? "" : "text-gray-400"}>
          {selectedOption?.label || placeholder}
        </span>
        <span className="ml-3 text-gray-500 dark:text-gray-400">▾</span>
      </button>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close dropdown"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No options found.
              </div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                      isSelected
                        ? "bg-brand-500 text-white"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <span>✓</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function ProductForm({ mode, productId }: ProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicateFrom = searchParams.get("duplicateFrom");

  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [brandOptions, setBrandOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(mode === "edit" || Boolean(duplicateFrom));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sourceProductId = mode === "edit" ? productId : duplicateFrom;

  const brandDropdownOptions = useMemo(
    () => brandOptions.map((brand) => ({ value: brand.id, label: brand.name })),
    [brandOptions]
  );

  const categoryDropdownOptions = useMemo(
    () => categoryOptions.map((category) => ({ value: category.id, label: category.name })),
    [categoryOptions]
  );

  const statusDropdownOptions: DropdownOption[] =
    values.status === "archived"
      ? [{ value: "archived", label: "Archived" }]
      : [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "archived", label: "Archived" },
        ];

  useEffect(() => {
    async function loadSelectOptions() {
      const [
        { data: brands, error: brandsError },
        { data: categories, error: categoriesError },
      ] = await Promise.all([
        supabase
          .from("product_brands")
          .select("id, name")
          .eq("status", "active")
          .order("name", { ascending: true }),
        supabase
          .from("product_categories")
          .select("id, name")
          .eq("status", "active")
          .order("name", { ascending: true }),
      ]);

      if (brandsError) console.error("Failed to load brands:", brandsError.message);
      if (categoriesError) console.error("Failed to load categories:", categoriesError.message);

      const loadedBrands = (brands as SelectOption[]) ?? [];
      const loadedCategories = (categories as SelectOption[]) ?? [];

      setBrandOptions(loadedBrands);
      setCategoryOptions(loadedCategories);
      setValues((current) => ({
        ...current,
        brand_id: current.brand_id || loadedBrands[0]?.id || "",
        category_id: current.category_id || loadedCategories[0]?.id || "",
      }));
    }

    void loadSelectOptions();
  }, []);

  useEffect(() => {
    async function loadProduct() {
      if (!sourceProductId) return;

      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, barcode, name, description, brand_id, category_id, base_product_code, color_code, color_name, unit, min_stock_level, status, qr_value, qr_svg_url, qr_svg_path, qr_generated_at"
        )
        .eq("id", sourceProductId)
        .single();

      if (error) {
        console.error("Failed to load product:", error);
        setErrorMessage("Product data could not be loaded. Please return to the product list and try again.");
        setIsLoading(false);
        return;
      }

      const product = data as ProductRow;
      const isDuplicate = mode === "create";

      setValues((current) => ({
        ...current,
        sku: isDuplicate ? `${product.sku}-COPY` : product.sku,
        barcode: isDuplicate ? "" : product.barcode ?? "",
        name: isDuplicate ? `${product.name} Copy` : product.name,
        description: product.description ?? "",
        brand_id: product.brand_id ?? current.brand_id,
        category_id: product.category_id ?? current.category_id,
        base_product_code: product.base_product_code ?? "",
        color_code: isDuplicate ? "" : product.color_code ?? "",
        color_name: isDuplicate ? "" : product.color_name ?? "",
        unit: product.unit ?? "piece",
        min_stock_level: String(product.min_stock_level ?? 0),
        status: isDuplicate ? "active" : product.status,
        qr_value: isDuplicate ? "" : product.qr_value ?? "",
        qr_svg_url: isDuplicate ? "" : product.qr_svg_url ?? "",
        qr_svg_path: isDuplicate ? "" : product.qr_svg_path ?? "",
        qr_generated_at: isDuplicate ? "" : product.qr_generated_at ?? "",
      }));

      setIsLoading(false);
    }

    void loadProduct();
  }, [sourceProductId, mode]);

  function updateField(field: keyof ProductFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function validateForm() {
    if (!values.sku.trim()) return "SKU is required.";
    if (!values.name.trim()) return "Product name is required.";
    if (!values.brand_id) return "Brand is required.";
    if (!values.category_id) return "Category is required.";
    if (!values.base_product_code.trim()) return "Base product code is required.";
    if (!values.color_code.trim()) return "Color code is required.";
    if (!values.unit.trim()) return "Unit is required.";

    const minStock = parseDbDecimal(values.min_stock_level, {
      precision: 12,
      scale: 2,
      min: 0,
      allowNull: false,
    });
    if (minStock.error) return `Minimum stock level: ${minStock.error}`;

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

    const selectedBrand = brandOptions.find((brand) => brand.id === values.brand_id);
    const selectedCategory = categoryOptions.find((category) => category.id === values.category_id);
    const minStock = parseDbDecimal(values.min_stock_level, {
      precision: 12,
      scale: 2,
      min: 0,
      allowNull: false,
    });
    if (minStock.error || minStock.value === null) {
      setErrorMessage(`Minimum stock level: ${minStock.error ?? "A value is required."}`);
      setIsSubmitting(false);
      return;
    }

    const payload = {
      sku: values.sku.trim(),
      barcode: values.barcode.trim() || null,
      name: values.name.trim(),
      description: values.description.trim() || null,
      brand_id: values.brand_id,
      category_id: values.category_id,
      base_product_code: values.base_product_code.trim(),
      color_code: values.color_code.trim(),
      color_name: values.color_name.trim() || null,
      // Compatibility mirrors; DB trigger remains authoritative.
      brand: selectedBrand?.name ?? null,
      category: selectedCategory?.name ?? null,
      unit: values.unit.trim(),
      min_stock_level: minStock.value,
      status: values.status,
    };

    const result =
      mode === "edit" && productId
        ? await supabase.from("products").update(payload).eq("id", productId)
        : await supabase.from("products").insert(payload);

    if (result.error) {
      console.error("Product save failed:", result.error);
      setErrorMessage(productWriteErrorMessage(result.error));
      setIsSubmitting(false);
      return;
    }

    router.push("/products");
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading product...</p>
          </div>
        </div>
      </div>
    );
  }

  const title =
    mode === "edit"
      ? "Edit Product"
      : duplicateFrom
        ? "Duplicate Product"
        : "Create Product";

  const description =
    mode === "edit"
      ? "Update canonical product master data."
      : duplicateFrom
        ? "Create a new color variant from an existing product family."
        : "Create a new product variant record.";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      {errorMessage ? (
        <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            SKU <span className="text-error-500">*</span>
          </label>
          <input
            value={values.sku}
            onChange={(event) => updateField("sku", event.target.value)}
            type="text"
            placeholder="NB-B30"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Barcode</label>
          <input
            value={values.barcode}
            onChange={(event) => updateField("barcode", event.target.value)}
            type="text"
            placeholder="860000000001"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Product Name <span className="text-error-500">*</span>
          </label>
          <input
            value={values.name}
            onChange={(event) => updateField("name", event.target.value)}
            type="text"
            placeholder="Product name"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Base Product Code <span className="text-error-500">*</span>
          </label>
          <input
            value={values.base_product_code}
            onChange={(event) => updateField("base_product_code", event.target.value)}
            type="text"
            placeholder="B30"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Variants sharing this code must use the same brand and category.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Color Code <span className="text-error-500">*</span>
          </label>
          <input
            value={values.color_code}
            onChange={(event) => updateField("color_code", event.target.value)}
            type="text"
            placeholder="NB"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Color Name</label>
          <input
            value={values.color_name}
            onChange={(event) => updateField("color_name", event.target.value)}
            type="text"
            placeholder="Navy Blue"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <CustomSelect
          label="Brand *"
          value={values.brand_id}
          placeholder="Select brand"
          options={brandDropdownOptions}
          onChange={(value) => updateField("brand_id", value)}
        />

        <CustomSelect
          label="Category *"
          value={values.category_id}
          placeholder="Select category"
          options={categoryDropdownOptions}
          onChange={(value) => updateField("category_id", value)}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Unit <span className="text-error-500">*</span>
          </label>
          <input
            value={values.unit}
            onChange={(event) => updateField("unit", event.target.value)}
            type="text"
            placeholder="piece"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Minimum Stock Level</label>
          <input
            value={values.min_stock_level}
            onChange={(event) => updateField("min_stock_level", event.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <CustomSelect
          label="Status"
          value={values.status}
          placeholder="Select status"
          options={statusDropdownOptions}
          onChange={(value) => updateField("status", value as ProductStatus)}
        />

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Description</label>
          <textarea
            value={values.description}
            onChange={(event) => updateField("description", event.target.value)}
            rows={4}
            placeholder="Product description"
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
      </div>

      {mode === "edit" ? (
        <div className="px-5 pb-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">Product QR Code</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">This QR code is linked to this product SKU.</p>
              </div>

              {values.qr_svg_url ? (
                <a
                  href={values.qr_svg_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand-500 hover:text-brand-600"
                >
                  Open SVG
                </a>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white">
                {values.qr_svg_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={values.qr_svg_url}
                    alt={`${values.sku} QR code`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-center text-xs text-gray-400">QR SVG not generated yet.</span>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">QR Value:</span>{" "}
                  <span className="font-medium text-gray-800 dark:text-white/90">{values.qr_value || values.sku}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">SVG Path:</span>{" "}
                  <span className="break-all font-medium text-gray-800 dark:text-white/90">{values.qr_svg_path || "-"}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Generated At:</span>{" "}
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {values.qr_generated_at ? new Date(values.qr_generated_at).toLocaleString("en-US") : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Product"}
        </button>
      </div>
    </form>
  );
}
