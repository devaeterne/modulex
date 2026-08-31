"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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
  product_type_id: string;
  uom_id: string;
  min_stock_level: string;
  status: ProductStatus;
  qr_value: string;
  qr_svg_url: string;
  qr_svg_path: string;
  qr_generated_at: string;
  stone_type_id: string;
  material_price_band_id: string;
  vendor_name: string;
  source_ref: string;
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
  product_type_id?: string | null;
  uom_id?: string | null;
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
  product_type_id: "",
  uom_id: "",
  min_stock_level: "0",
  status: "active",
  qr_value: "",
  qr_svg_url: "",
  qr_svg_path: "",
  qr_generated_at: "",
  stone_type_id: "",
  material_price_band_id: "",
  vendor_name: "",
  source_ref: "",
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

export default function ProductForm({ mode, productId }: ProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicateFrom = searchParams.get("duplicateFrom");

  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [brandOptions, setBrandOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [productTypeOptions, setProductTypeOptions] = useState<
    (SelectOption & {
      code: string;
      default_uom_id: string | null;
      pricing_model: string;
      requires_variant_identity: boolean;
    })[]
  >([]);
  const [uomOptions, setUomOptions] = useState<
    (SelectOption & { code: string; allows_decimal: boolean })[]
  >([]);
  const [allowedUoms, setAllowedUoms] = useState<Record<string, string[]>>({});
  const [stoneTypeOptions, setStoneTypeOptions] = useState<SelectOption[]>([]);
  const [materialBandOptions, setMaterialBandOptions] = useState<
    (SelectOption & { code: string; price_per_sqft: number | string })[]
  >([]);
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
  const productTypeDropdownOptions = useMemo(
    () => productTypeOptions.map((type) => ({ value: type.id, label: type.name })),
    [productTypeOptions]
  );
  const stoneTypeDropdownOptions = useMemo(
    () => stoneTypeOptions.map((item) => ({ value: item.id, label: item.name })),
    [stoneTypeOptions]
  );
  const materialBandDropdownOptions = useMemo(
    () =>
      materialBandOptions.map((item) => ({
        value: item.id,
        label: `${item.code} — $${Number(item.price_per_sqft).toFixed(2)} / sq ft`,
      })),
    [materialBandOptions]
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
        { data: types },
        { data: uoms },
        { data: stoneTypes },
        { data: bands },
        { data: allowed },
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
        supabase
          .from("product_types")
          .select("id,name,code,default_uom_id,pricing_model,requires_variant_identity")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("units_of_measure")
          .select("id,name,code,allows_decimal")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("countertop_stone_types")
          .select("id,name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("countertop_material_price_bands")
          .select("id,code,price_per_sqft")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("product_type_allowed_uoms").select("product_type_id,uom_id"),
      ]);

      if (brandsError) console.error("Failed to load brands:", brandsError.message);
      if (categoriesError) console.error("Failed to load categories:", categoriesError.message);

      const loadedBrands = (brands as SelectOption[]) ?? [];
      const loadedCategories = (categories as SelectOption[]) ?? [];

      setBrandOptions(loadedBrands);
      setCategoryOptions(loadedCategories);
      setProductTypeOptions((types ?? []) as typeof productTypeOptions);
      setUomOptions((uoms ?? []) as typeof uomOptions);
      setAllowedUoms(
        (allowed ?? []).reduce<Record<string, string[]>>((acc, row) => {
          (acc[row.product_type_id] ??= []).push(row.uom_id);
          return acc;
        }, {})
      );
      setStoneTypeOptions((stoneTypes ?? []) as SelectOption[]);
      setMaterialBandOptions(
        (bands ?? []).map((row) => ({
          id: row.id,
          name: row.code,
          code: row.code,
          price_per_sqft: row.price_per_sqft,
        })) as typeof materialBandOptions
      );
      setValues((current) => ({
        ...current,
        brand_id: current.brand_id,
        category_id: current.category_id,
        product_type_id:
          current.product_type_id || (types?.find((type) => type.code === "STANDARD")?.id ?? ""),
      }));
    }

    void loadSelectOptions();
  }, []);

  const allowedUomOptions = useMemo(() => {
    const ids = allowedUoms[values.product_type_id] ?? [];
    return uomOptions.filter((uom) => ids.includes(uom.id));
  }, [allowedUoms, uomOptions, values.product_type_id]);

  const allowedUomDropdownOptions = useMemo(
    () =>
      allowedUomOptions.map((uom) => ({
        value: uom.id,
        label: `${uom.name} (${uom.code})`,
      })),
    [allowedUomOptions]
  );

  const selectedProductType = useMemo(
    () => productTypeOptions.find((type) => type.id === values.product_type_id),
    [productTypeOptions, values.product_type_id]
  );

  useEffect(() => {
    if (!values.product_type_id) return;
    const allowed = allowedUoms[values.product_type_id] ?? [];
    if (values.uom_id && allowed.includes(values.uom_id)) return;
    const type = productTypeOptions.find((item) => item.id === values.product_type_id);
    const next =
      type?.default_uom_id && allowed.includes(type.default_uom_id)
        ? type.default_uom_id
        : allowed[0] ?? "";
    setValues((current) => ({
      ...current,
      uom_id: next,
      unit: uomOptions.find((item) => item.id === next)?.code.toLowerCase() ?? current.unit,
    }));
  }, [allowedUoms, productTypeOptions, uomOptions, values.product_type_id, values.uom_id]);

  useEffect(() => {
    async function loadProduct() {
      if (!sourceProductId) return;

      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, barcode, name, description, brand_id, category_id, base_product_code, color_code, color_name, unit, min_stock_level, status, qr_value, qr_svg_url, qr_svg_path, qr_generated_at, product_type_id, uom_id"
        )
        .eq("id", sourceProductId)
        .single();

      if (error) {
        console.error("Failed to load product:", error);
        setErrorMessage(
          "Product data could not be loaded. Please return to the product list and try again."
        );
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
        product_type_id: product.product_type_id ?? current.product_type_id,
        uom_id: product.uom_id ?? current.uom_id,
        min_stock_level: String(product.min_stock_level ?? 0),
        status: isDuplicate ? "active" : product.status,
        qr_value: isDuplicate ? "" : product.qr_value ?? "",
        qr_svg_url: isDuplicate ? "" : product.qr_svg_url ?? "",
        qr_svg_path: isDuplicate ? "" : product.qr_svg_path ?? "",
        qr_generated_at: isDuplicate ? "" : product.qr_generated_at ?? "",
      }));

      const { data: profile } = await supabase
        .from("countertop_stone_product_profiles")
        .select("stone_type_id,material_price_band_id,vendor_name,source_ref")
        .eq("product_id", sourceProductId)
        .maybeSingle();

      if (profile) {
        setValues((current) => ({
          ...current,
          stone_type_id: profile.stone_type_id,
          material_price_band_id: profile.material_price_band_id,
          vendor_name: profile.vendor_name ?? "",
          source_ref: profile.source_ref ?? "",
        }));
      }

      setIsLoading(false);
    }

    void loadProduct();
  }, [sourceProductId, mode]);

  function updateField(field: keyof ProductFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function generateQr(productIdForQr: string, force = false) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        ok: false,
        message: "Your session has expired. Sign in again before generating the QR code.",
      };
    }

    const response = await fetch("/api/admin/products/qr", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ product_id: productIdForQr, force }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      qr_value?: string;
      qr_svg_path?: string;
      qr_svg_url?: string;
      qr_generated_at?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        message:
          response.status === 401
            ? "Your session has expired. Sign in again before generating the QR code."
            : response.status === 403
              ? "You do not have permission to generate product QR codes."
              : body.error || "Product was saved, but the QR file could not be generated. Retry QR.",
      };
    }

    setValues((current) => ({
      ...current,
      qr_value: body.qr_value ?? current.sku,
      qr_svg_path: body.qr_svg_path ?? current.qr_svg_path,
      qr_svg_url: body.qr_svg_url ?? current.qr_svg_url,
      qr_generated_at: body.qr_generated_at ?? current.qr_generated_at,
    }));

    return { ok: true, message: "QR code generated." };
  }

  function validateForm() {
    if (!values.sku.trim()) return "SKU is required.";
    if (!values.name.trim()) return "Product name is required.";
    if (!values.brand_id) return "Brand is required.";
    if (!values.category_id) return "Category is required.";
    if (selectedProductType?.requires_variant_identity && !values.base_product_code.trim()) {
      return "Base product code is required.";
    }
    if (selectedProductType?.requires_variant_identity && !values.color_code.trim()) {
      return "Color code is required.";
    }
    if (!values.unit.trim()) return "Unit is required.";
    if (!values.product_type_id) return "Product type is required.";
    if (!values.uom_id) return "Unit of measure is required.";
    if (
      selectedProductType?.pricing_model === "countertop_material_band" &&
      (!values.stone_type_id || !values.material_price_band_id)
    ) {
      return "Stone type and material price band are required for countertop material products.";
    }

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
      base_product_code: values.base_product_code.trim() || values.sku.trim(),
      color_code: values.color_code.trim() || "DEFAULT",
      color_name: values.color_name.trim() || null,
      brand: selectedBrand?.name ?? null,
      category: selectedCategory?.name ?? null,
      unit: values.unit.trim(),
      product_type_id: values.product_type_id,
      uom_id: values.uom_id,
      min_stock_level: minStock.value,
      status: values.status,
    };

    const { data: savedId, error: resultError } = await supabase.rpc("save_product_master_v2", {
      p_product: { ...payload, id: mode === "edit" ? productId : null },
      p_stone_profile:
        selectedProductType?.pricing_model === "countertop_material_band"
          ? {
              stone_type_id: values.stone_type_id,
              material_price_band_id: values.material_price_band_id,
              vendor_name: values.vendor_name.trim() || null,
              source_ref: values.source_ref.trim() || null,
            }
          : null,
    });

    if (resultError) {
      console.error("Product save failed:", resultError);
      setErrorMessage(productWriteErrorMessage(resultError));
      setIsSubmitting(false);
      return;
    }

    const savedProductId = String(savedId ?? "");

    if (savedProductId) {
      const qrResult = await generateQr(savedProductId);
      if (!qrResult.ok) {
        setErrorMessage(qrResult.message);
        setIsSubmitting(false);
        return;
      }
    }

    router.push("/products");
    router.refresh();
  }

  const title =
    mode === "edit" ? "Edit Product" : duplicateFrom ? "Duplicate Product" : "Create Product";
  const description =
    mode === "edit"
      ? "Update canonical product master data."
      : duplicateFrom
        ? "Create a new color variant from an existing product family."
        : "Create a new product variant record.";

  if (isLoading) {
    return (
      <ComponentCard title={title} desc={description}>
        <Alert
          variant="info"
          title="Loading product"
          message="Canonical product master data is being loaded."
        />
      </ComponentCard>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ComponentCard title={title} desc={description}>
        <div className="flex flex-wrap gap-2">
          <Badge color={values.status === "active" ? "success" : values.status === "archived" ? "dark" : "light"} size="sm">
            {values.status === "active" ? "Active" : values.status === "archived" ? "Archived" : "Inactive"}
          </Badge>
          {selectedProductType ? (
            <Badge color="primary" size="sm">
              {selectedProductType.name}
            </Badge>
          ) : null}
          {values.uom_id ? (
            <Badge color="light" size="sm">
              {uomOptions.find((uom) => uom.id === values.uom_id)?.code ?? "UOM"}
            </Badge>
          ) : null}
        </div>
      </ComponentCard>

      {errorMessage ? (
        <Alert variant="error" title="Unable to save product" message={errorMessage} />
      ) : null}

      <ComponentCard
        title="Product Identity"
        desc="Maintain the canonical SKU, product name and variant identity used across orders and inventory."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="product-sku">SKU *</Label>
            <Input
              id="product-sku"
              value={values.sku}
              onChange={(event) => updateField("sku", event.target.value)}
              placeholder="NB-B30"
              required
            />
          </div>

          <div>
            <Label htmlFor="product-barcode">Barcode</Label>
            <Input
              id="product-barcode"
              value={values.barcode}
              onChange={(event) => updateField("barcode", event.target.value)}
              placeholder="860000000001"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="product-name">Product Name *</Label>
            <Input
              id="product-name"
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Product name"
              required
            />
          </div>

          <div>
            <Label htmlFor="base-product-code">Base Product Code</Label>
            <Input
              id="base-product-code"
              value={values.base_product_code}
              onChange={(event) => updateField("base_product_code", event.target.value)}
              placeholder="B30"
              hint={
                selectedProductType?.requires_variant_identity
                  ? "Required for this Product Type. Variants sharing the code must use the same brand and category."
                  : "Used when this Product Type participates in family/variant identity."
              }
            />
          </div>

          <div>
            <Label htmlFor="color-code">Color Code</Label>
            <Input
              id="color-code"
              value={values.color_code}
              onChange={(event) => updateField("color_code", event.target.value)}
              placeholder="NB"
              hint={
                selectedProductType?.requires_variant_identity
                  ? "Required for this Product Type."
                  : "Optional for standalone product types."
              }
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="color-name">Color Name</Label>
            <Input
              id="color-name"
              value={values.color_name}
              onChange={(event) => updateField("color_name", event.target.value)}
              placeholder="Navy Blue"
            />
          </div>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Classification & Units"
        desc="Assign canonical taxonomy, Product Type and one allowed Unit of Measure."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="product-brand">Brand *</Label>
            <Select
              id="product-brand"
              placeholder="Select brand"
              value={values.brand_id}
              options={brandDropdownOptions}
              onChange={(value) => updateField("brand_id", value)}
            />
          </div>

          <div>
            <Label htmlFor="product-category">Category *</Label>
            <Select
              id="product-category"
              placeholder="Select category"
              value={values.category_id}
              options={categoryDropdownOptions}
              onChange={(value) => updateField("category_id", value)}
            />
          </div>

          <div>
            <Label htmlFor="product-type">Product Type *</Label>
            <Select
              id="product-type"
              placeholder="Select product type"
              value={values.product_type_id}
              options={productTypeDropdownOptions}
              onChange={(value) => {
                const nextType = productTypeOptions.find((type) => type.id === value);
                setValues((current) => ({
                  ...current,
                  product_type_id: value,
                  uom_id: nextType?.default_uom_id ?? current.uom_id,
                }));
              }}
            />
          </div>

          <div>
            <Label htmlFor="product-uom">Unit of Measure *</Label>
            <Select
              id="product-uom"
              placeholder="Select unit"
              value={values.uom_id}
              options={allowedUomDropdownOptions}
              onChange={(value) => {
                const uom = uomOptions.find((item) => item.id === value);
                setValues((current) => ({
                  ...current,
                  uom_id: value,
                  unit: uom?.code.toLowerCase() ?? current.unit,
                }));
              }}
            />
          </div>
        </div>
      </ComponentCard>

      {selectedProductType?.pricing_model === "countertop_material_band" ? (
        <ComponentCard
          title="Countertop Material"
          desc="Connect this Stone product to the controlled material type and price band masters."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="stone-type">Stone Type *</Label>
              <Select
                id="stone-type"
                placeholder="Select stone type"
                value={values.stone_type_id}
                options={stoneTypeDropdownOptions}
                onChange={(value) => updateField("stone_type_id", value)}
              />
            </div>

            <div>
              <Label htmlFor="material-price-band">Material Price Band *</Label>
              <Select
                id="material-price-band"
                placeholder="Select material band"
                value={values.material_price_band_id}
                options={materialBandDropdownOptions}
                onChange={(value) => updateField("material_price_band_id", value)}
              />
            </div>

            <div>
              <Label htmlFor="stone-vendor">Vendor</Label>
              <Input
                id="stone-vendor"
                value={values.vendor_name}
                onChange={(event) => updateField("vendor_name", event.target.value)}
                placeholder="Vendor name"
              />
            </div>

            <div>
              <Label htmlFor="stone-source">Source</Label>
              <Input
                id="stone-source"
                value={values.source_ref}
                onChange={(event) => updateField("source_ref", event.target.value)}
                placeholder="Source reference"
              />
            </div>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard
        title="Inventory & Lifecycle"
        desc="Configure the low-stock threshold and product lifecycle state."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="minimum-stock">Minimum Stock Level</Label>
            <Input
              id="minimum-stock"
              value={values.min_stock_level}
              onChange={(event) => updateField("min_stock_level", event.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              hint="Low-stock reporting compares Available quantity to this threshold."
            />
          </div>

          <div>
            <Label htmlFor="product-status">Status</Label>
            <Select
              id="product-status"
              placeholder="Select status"
              value={values.status}
              options={statusDropdownOptions}
              onChange={(value) => updateField("status", value as ProductStatus)}
            />
          </div>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Description"
        desc="Add operator-facing product context without changing classification or pricing behavior."
      >
        <div>
          <Label htmlFor="product-description">Description</Label>
          <TextArea
            id="product-description"
            value={values.description}
            onChange={(value) => updateField("description", value)}
            rows={4}
            placeholder="Product description"
          />
        </div>
      </ComponentCard>

      {mode === "edit" ? (
        <ComponentCard
          title="Product QR Code"
          desc="The canonical QR payload remains the current SKU and is generated through the protected Admin API."
        >
          <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            {values.qr_svg_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.qr_svg_url}
                alt={`${values.sku} QR code`}
                className="h-40 w-40 object-contain"
              />
            ) : (
              <Alert
                variant="info"
                title="QR pending"
                message="QR SVG has not been generated for this product yet."
              />
            )}

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge color={values.qr_svg_url ? "success" : "warning"} size="sm">
                  {values.qr_svg_url ? "QR Ready" : "QR Pending"}
                </Badge>
                <Badge color="light" size="sm">
                  {values.qr_value || values.sku}
                </Badge>
              </div>

              <dl className="grid gap-3">
                <div>
                  <dt className="text-sm font-medium text-gray-700 dark:text-gray-400">SVG Path</dt>
                  <dd className="break-all text-sm text-gray-500 dark:text-gray-400">{values.qr_svg_path || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-700 dark:text-gray-400">Generated At</dt>
                  <dd className="text-sm text-gray-500 dark:text-gray-400">
                    {values.qr_generated_at
                      ? new Date(values.qr_generated_at).toLocaleString("en-US")
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-3">
                {values.qr_svg_url ? (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => window.open(values.qr_svg_url, "_blank", "noopener,noreferrer")}
                  >
                    Open SVG
                  </Button>
                ) : null}

                {productId ? (
                  <Button
                    size="sm"
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      const result = await generateQr(productId, true);
                      setErrorMessage(result.ok ? null : result.message);
                      setIsSubmitting(false);
                    }}
                  >
                    Regenerate QR
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </ComponentCard>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          className="w-full sm:w-auto"
          variant="outline"
          type="button"
          disabled={isSubmitting}
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>
        <Button className="w-full sm:w-auto" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Product"}
        </Button>
      </div>
    </form>
  );
}
