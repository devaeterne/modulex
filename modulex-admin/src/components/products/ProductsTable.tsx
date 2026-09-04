"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import InputField from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { Modal } from "@/components/ui/modal";
import { ADMIN_FOCUS_RING } from "@/components/ui/theme/adminTheme";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";

type ProductStatus = "active" | "inactive" | "archived";
type SortBy =
  | "sku"
  | "name"
  | "brand"
  | "category"
  | "type"
  | "stock"
  | "min_stock"
  | "status"
  | "created_at";
type SortDirection = "asc" | "desc";

type Product = {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  base_product_code: string;
  color_code: string;
  color_name: string | null;
  brand_id: string;
  category_id: string;
  brand: string;
  category: string;
  unit: string;
  min_stock_level: number;
  product_status: ProductStatus;
  created_at: string;
  product_type_code?: string | null;
  product_type_name?: string | null;
  product_type_pricing_model?: string | null;
  uom_code?: string | null;
  uom_name?: string | null;
  on_hand?: number | string;
  reserved?: number | string;
  available?: number | string;
  qr_status?: "ready" | "missing";
  stone_type?: string | null;
  material_price_band?: string | null;
};

type ProductImage = {
  url: string;
  alt: string;
};

type ProductContentRow = {
  id: string;
  base_product_code: string;
};

type ProductMediaRow = {
  product_content_id: string;
  url: string;
  alt_text: string | null;
  title: string | null;
  sort_order: number;
  is_primary: boolean;
};

type FilterOption = {
  id: string;
  name: string;
};

type ProductsPagePayload = {
  items: Product[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  filters: {
    brands: FilterOption[];
    categories: FilterOption[];
    product_types?: FilterOption[];
    uoms?: FilterOption[];
  };
};

type RpcError = {
  code?: string;
  message?: string;
};

type ProductRowActionsProps = {
  product: Product;
  isLoading: boolean;
  onToggleStatus: () => void | Promise<void>;
  onDuplicate: () => void;
  onArchive: () => void;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const EXPORT_PAGE_SIZE = 100;

function statusColor(status: ProductStatus): "success" | "warning" | "light" {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "warning";
    case "archived":
      return "light";
    default:
      return "light";
  }
}

function formatStatus(status: ProductStatus) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function reportProductError(context: string, error: unknown) {
  console.error(`[Product List] ${context}`, error);
}

function normalizeV2Product(item: Record<string, unknown>): Product {
  return { product_id: String(item.id), sku: String(item.sku ?? ""), barcode: item.barcode as string | null, product_name: String(item.name ?? ""), base_product_code: String(item.base_product_code ?? ""), color_code: String(item.color_code ?? ""), color_name: item.color_name as string | null, brand_id: String(item.brand_id ?? ""), category_id: String(item.category_id ?? ""), brand: String(item.brand ?? ""), category: String(item.category ?? ""), unit: String(item.unit ?? ""), min_stock_level: Number(item.min_stock_level ?? 0), product_status: item.status as ProductStatus, created_at: String(item.created_at ?? ""), product_type_code: item.product_type_code as string | null, product_type_name: item.product_type_name as string | null, product_type_pricing_model: item.product_type_pricing_model as string | null, uom_code: item.uom_code as string | null, uom_name: item.uom_name as string | null, on_hand: item.on_hand as number | string, reserved: item.reserved as number | string, available: item.available as number | string, qr_status: item.qr_status as "ready" | "missing", stone_type: item.stone_type as string | null, material_price_band: item.material_price_band as string | null };
}

function lifecycleErrorMessage(error: RpcError) {
  const message = error.message ?? "";
  if (message.includes("on-hand or reserved stock remains")) {
    return "This product still has on-hand or reserved stock. Clear stock before deactivating or archiving it.";
  }
  if (message.includes("Archived product status is terminal")) {
    return "Archived products cannot be reactivated.";
  }
  if (message.includes("Active products require an active brand and category")) {
    return "This product cannot be activated until its brand and category are active.";
  }
  if (error.code === "42501") {
    return "You do not have permission to manage products.";
  }
  return "We couldn’t update the product status. Please try again.";
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function ProductRowActions({
  product,
  isLoading,
  onToggleStatus,
  onDuplicate,
  onArchive,
}: ProductRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const isArchived = product.product_status === "archived";

  const closeMenu = useCallback(() => setIsOpen(false), []);

  return (
    <span ref={anchorRef} className="relative inline-flex">
      <Button
        variant="ghost"
        size="sm"
        className="dropdown-toggle"
        aria-label={`Actions for ${product.product_name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isLoading}
        onClick={() => setIsOpen((current) => !current)}
      >
        …
      </Button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeMenu}
        portal
        anchorRef={anchorRef}
        role="menu"
        ariaLabel={`Actions for ${product.product_name}`}
        className="w-48 p-2"
      >
        <DropdownItem tag="a" href={`/products/${product.product_id}/edit`} onItemClick={closeMenu}>
          Edit
        </DropdownItem>
        {!isArchived ? (
          <DropdownItem
            onClick={() => {
              closeMenu();
              void onToggleStatus();
            }}
          >
            {product.product_status === "active" ? "Deactivate" : "Activate"}
          </DropdownItem>
        ) : null}
        <DropdownItem
          onClick={() => {
            closeMenu();
            onDuplicate();
          }}
        >
          Duplicate
        </DropdownItem>
        {!isArchived ? (
          <DropdownItem
            onClick={() => {
              closeMenu();
              onArchive();
            }}
          >
            Archive
          </DropdownItem>
        ) : null}
      </Dropdown>
    </span>
  );
}

export default function ProductsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);
  const archiveCancelRef = useRef<HTMLSpanElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productImages, setProductImages] = useState<Record<string, ProductImage>>({});
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const [brands, setBrands] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [productTypes, setProductTypes] = useState<FilterOption[]>([]);
  const [uoms, setUoms] = useState<FilterOption[]>([]);

  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [uomFilter, setUomFilter] = useState("");
  useEffect(() => {
    setTypeFilter(searchParams.get("type") ?? "");
    setUomFilter(searchParams.get("uom") ?? "");
    setBrandFilter(searchParams.get("brand") ?? "");
    setCategoryFilter(searchParams.get("category") ?? "");
  }, [searchParams]);
  const [qrFilter, setQrFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("sku");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canManage = hasPermission(profile?.roles, "products.manage");
  const activeFilterCount = [query, statusFilter, brandFilter, categoryFilter, typeFilter, uomFilter, qrFilter].filter(Boolean).length;
  const columnCount = canManage ? 9 : 8;

  const getLegacyRpcArgs = useCallback(
    (page: number, requestedPageSize: number) => ({
      p_query: query,
      p_page: page,
      p_page_size: requestedPageSize,
      p_status: statusFilter || null,
      p_brand_id: brandFilter || null,
      p_category_id: categoryFilter || null,
      p_sort_by: sortBy,
      p_sort_direction: sortDirection,
    }),
    [query, statusFilter, brandFilter, categoryFilter, sortBy, sortDirection]
  );
  const getV2RpcArgs = useCallback(
    (page: number, requestedPageSize: number) => ({ p_query: query, p_type_id: typeFilter || null, p_uom_id: uomFilter || null, p_status: statusFilter || null, p_qr_status: qrFilter || null, p_brand_id: brandFilter || null, p_category_id: categoryFilter || null, p_sort: sortBy, p_direction: sortDirection, p_page: page, p_page_size: requestedPageSize }),
    [query, typeFilter, uomFilter, statusFilter, qrFilter, brandFilter, categoryFilter, sortBy, sortDirection]
  );

  const loadProductImages = useCallback(async (items: Product[], requestId: number) => {
    const baseProductCodes = Array.from(
      new Set(items.map((product) => product.base_product_code || product.sku).filter(Boolean))
    );

    if (baseProductCodes.length === 0) {
      if (requestId === requestIdRef.current) setProductImages({});
      return;
    }

    const { data: contentRows, error: contentError } = await supabase
      .from("store_product_content")
      .select("id,base_product_code")
      .in("base_product_code", baseProductCodes);

    if (requestId !== requestIdRef.current) return;
    if (contentError) {
      reportProductError("product thumbnail content load failed", contentError);
      setProductImages({});
      return;
    }

    const contents = (contentRows ?? []) as ProductContentRow[];
    const contentIds = contents.map((content) => content.id);
    if (contentIds.length === 0) {
      setProductImages({});
      return;
    }

    const { data: mediaRows, error: mediaError } = await supabase
      .from("store_product_media")
      .select("product_content_id,url,alt_text,title,sort_order,is_primary")
      .in("product_content_id", contentIds)
      .eq("media_type", "image")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });

    if (requestId !== requestIdRef.current) return;
    if (mediaError) {
      reportProductError("product thumbnail media load failed", mediaError);
      setProductImages({});
      return;
    }

    const firstImageByContentId = new Map<string, ProductMediaRow>();
    for (const media of (mediaRows ?? []) as ProductMediaRow[]) {
      if (!firstImageByContentId.has(media.product_content_id)) {
        firstImageByContentId.set(media.product_content_id, media);
      }
    }

    const imageByBaseProductCode = new Map<string, ProductImage>();
    for (const content of contents) {
      const media = firstImageByContentId.get(content.id);
      if (!media) continue;
      imageByBaseProductCode.set(content.base_product_code, {
        url: media.url,
        alt: media.alt_text || media.title || "Product image",
      });
    }

    const nextImages: Record<string, ProductImage> = {};
    for (const product of items) {
      const image = imageByBaseProductCode.get(product.base_product_code || product.sku);
      if (image) {
        nextImages[product.product_id] = {
          ...image,
          alt: image.alt === "Product image" ? product.product_name : image.alt,
        };
      }
    }
    setProductImages(nextImages);
  }, []);

  const loadProducts = useCallback(
    async (options?: { background?: boolean }) => {
      const requestId = ++requestIdRef.current;
      const background = options?.background === true;
      if (!background) {
        setIsLoading(true);
        setProductImages({});
        setPreviewImage(null);
      }
      setErrorMessage(null);

      const legacyArgs = getLegacyRpcArgs(currentPage, pageSize);
      let { data, error } = await supabase.rpc("get_products_page_v2", getV2RpcArgs(currentPage, pageSize));
      const isV2 = !error;
      if (error) ({ data, error } = await supabase.rpc("get_products_page", legacyArgs));

      if (requestId !== requestIdRef.current) return;

      if (error) {
        reportProductError("product page load failed", error);
        setErrorMessage("Products are temporarily unavailable. Please try again.");
        if (!background) {
          setProducts([]);
          setProductImages({});
          setTotalCount(0);
          setTotalPages(1);
          setIsLoading(false);
        }
        return;
      }

      const rawPayload = data as (ProductsPagePayload & { items?: Array<Record<string, unknown>>; page_size?: number }) | null;
      const payload = isV2
        ? { ...rawPayload, items: (rawPayload?.items ?? []).map((item) => normalizeV2Product(item as unknown as Record<string, unknown>)) }
        : rawPayload;
      const nextTotalPages = Math.max(1, Math.ceil(Number(payload?.total_count ?? 0) / pageSize));
      if (currentPage > nextTotalPages) {
        setCurrentPage(nextTotalPages);
        if (!background) setIsLoading(false);
        return;
      }

      const nextProducts = payload?.items ?? [];
      setProducts(nextProducts);
      setBrands(payload?.filters?.brands ?? []);
      setCategories(payload?.filters?.categories ?? []);
      setProductTypes(payload?.filters?.product_types ?? []);
      setUoms(payload?.filters?.uoms ?? []);
      setTotalCount(Number(payload?.total_count ?? 0));
      setTotalPages(nextTotalPages);
      void loadProductImages(nextProducts, requestId);
      if (!background) setIsLoading(false);
    },
    [currentPage, pageSize, getLegacyRpcArgs, getV2RpcArgs, loadProductImages]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const { profile: current, error } = await getCurrentProfile();
      if (cancelled) return;

      if (error || !current) {
        reportProductError("profile load failed", error);
        setProfile(null);
        setAccessError(
          "We couldn’t verify product management access. Management actions are unavailable."
        );
        return;
      }

      setProfile(current);
      setAccessError(null);
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!archiveTarget) return;

    archiveCancelRef.current?.querySelector("button")?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && actionLoadingId !== archiveTarget?.product_id) {
        setArchiveTarget(null);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [archiveTarget, actionLoadingId]);

  function resetToFirstPage() {
    setCurrentPage(1);
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput.trim());
    resetToFirstPage();
  }

  function handleClearFilters() {
    setQueryInput("");
    setQuery("");
    setStatusFilter("");
    setBrandFilter("");
    setCategoryFilter("");
    setTypeFilter(""); setUomFilter(""); setQrFilter("");
    setSortBy("sku");
    setSortDirection("asc");
    router.replace("/products");
    resetToFirstPage();
  }

  async function setProductStatus(product: Product, nextStatus: ProductStatus) {
    setActionLoadingId(product.product_id);
    setErrorMessage(null);

    try {
      const { error } = await supabase.rpc("set_product_status", {
        p_product_id: product.product_id,
        p_status: nextStatus,
      });

      if (error) {
        reportProductError("product lifecycle update failed", error);
        setErrorMessage(lifecycleErrorMessage(error));
        return false;
      }

      await loadProducts({ background: true });
      return true;
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleToggleStatus(product: Product) {
    if (!canManage) {
      setErrorMessage("You do not have permission to manage products.");
      return;
    }
    if (product.product_status === "archived") {
      setErrorMessage("Archived products cannot be activated from this table.");
      return;
    }

    const nextStatus: ProductStatus =
      product.product_status === "active" ? "inactive" : "active";
    await setProductStatus(product, nextStatus);
  }

  async function confirmArchiveProduct() {
    const product = archiveTarget;
    if (!product) return;
    if (!canManage) {
      setArchiveTarget(null);
      setErrorMessage("You do not have permission to manage products.");
      return;
    }

    const changed = await setProductStatus(product, "archived");
    if (changed) setArchiveTarget(null);
  }

  function handleDuplicateProduct(product: Product) {
    if (!canManage) {
      setErrorMessage("You do not have permission to manage products.");
      return;
    }
    router.push(`/products/new?duplicateFrom=${product.product_id}`);
  }

  async function exportProductsCsv() {
    if (isExporting) return;
    setIsExporting(true);
    setErrorMessage(null);

    try {
      let exportPage = 1;
      let expectedTotal = Number.POSITIVE_INFINITY;
      const exported: Product[] = [];

      while (exported.length < expectedTotal) {
        let { data, error } = await supabase.rpc("get_products_page_v2", getV2RpcArgs(exportPage, EXPORT_PAGE_SIZE));
        if (error) ({ data, error } = await supabase.rpc("get_products_page", getLegacyRpcArgs(exportPage, EXPORT_PAGE_SIZE)));
        if (error) throw error;

        const payload = data as ProductsPagePayload | { items?: Array<Record<string, unknown>>; total_count?: number } | null;
        const rows = (payload?.items ?? []).map((row) => "id" in row ? normalizeV2Product(row) : row as Product);
        expectedTotal = Number(payload?.total_count ?? 0);
        exported.push(...rows);

        if (rows.length === 0 && exported.length < expectedTotal) {
          throw new Error("Product export stopped before reaching the exact total count.");
        }
        if (exportPage > 10000) {
          throw new Error("Product export exceeded the bounded page limit.");
        }
        exportPage += 1;
      }

      const headers = [
        "SKU",
        "Barcode",
        "Product Name",
        "Type",
        "Brand",
        "Category",
        "Variant / Stone",
        "UOM",
        "On Hand",
        "Reserved",
        "Available",
        "QR",
        "Status",
      ];
      const lines = exported.map((product) =>
        [
          product.sku,
          product.barcode,
          product.product_name,
          product.product_type_name || product.product_type_code,
          product.brand,
          product.category,
          product.product_type_pricing_model === "countertop_material_band" ? `${product.stone_type || "Stone"} · ${product.material_price_band || ""}` : `${product.base_product_code} · ${product.color_name || product.color_code}`,
          product.uom_name || product.uom_code || product.unit,
          product.on_hand,
          product.reserved,
          product.available,
          product.qr_status,
          product.product_status,
        ]
          .map(csvCell)
          .join(",")
      );
      const csv = [headers.map(csvCell).join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `product-master-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      reportProductError("product CSV export failed", error);
      setErrorMessage("The complete product CSV could not be exported. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  const startRow = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);
  const pageNumbers = getPageNumbers(currentPage, totalPages);
  const closeArchiveModal = useCallback(() => {
    if (!archiveTarget || actionLoadingId !== archiveTarget.product_id) {
      setArchiveTarget(null);
    }
  }, [archiveTarget, actionLoadingId]);

  const filterFields = [
    { id: "product-status-filter", label: "Status", value: statusFilter, setValue: setStatusFilter, placeholder: "All Statuses", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }] },
    { id: "product-brand-filter", label: "Brand", value: brandFilter, setValue: setBrandFilter, placeholder: "All Brands", options: brands.map((item) => ({ value: item.id, label: item.name })) },
    { id: "product-category-filter", label: "Category", value: categoryFilter, setValue: setCategoryFilter, placeholder: "All Categories", options: categories.map((item) => ({ value: item.id, label: item.name })) },
    { id: "product-type-filter", label: "Product Type", value: typeFilter, setValue: setTypeFilter, placeholder: "All Types", options: productTypes.map((item) => ({ value: item.id, label: item.name })) },
    { id: "product-uom-filter", label: "UOM", value: uomFilter, setValue: setUomFilter, placeholder: "All UOMs", options: uoms.map((item) => ({ value: item.id, label: item.name })) },
    { id: "product-qr-filter", label: "QR", value: qrFilter, setValue: setQrFilter, placeholder: "All QR", options: [{ value: "ready", label: "Ready" }, { value: "missing", label: "Missing" }] },
  ];

  return (
    <>
      <div aria-busy={isLoading || isExporting || Boolean(actionLoadingId)}>
        <ComponentCard
          title="Product List"
          desc="Search, filter and sort canonical product variants. Export always includes the full filtered result set."
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
              <div className="w-full sm:w-[320px]">
                <Label htmlFor="product-search">Search products</Label>
                <InputField id="product-search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} type="search" placeholder="Search SKU, family, color, barcode, name..." />
              </div>
              <Button type="submit" size="sm">Search</Button>
            </form>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" size="sm" onClick={() => void exportProductsCsv()} disabled={isExporting}>{isExporting ? "Exporting..." : "Export CSV"}</Button>
              {canManage ? <Link href="/products/new" className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Add Product</Link> : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {filterFields.map((field) => (
              <div key={field.id}>
                <Label htmlFor={field.id}>{field.label}</Label>
                <Select id={field.id} value={field.value} onChange={(value) => { field.setValue(value); resetToFirstPage(); }} placeholder={field.placeholder} options={field.options} allowEmpty />
              </div>
            ))}
            <div>
              <Label htmlFor="product-sort-by">Sort by</Label>
              <Select id="product-sort-by" value={sortBy} onChange={(value) => { setSortBy(value as SortBy); resetToFirstPage(); }} options={[{ value: "sku", label: "SKU" }, { value: "name", label: "Product Name" }, { value: "brand", label: "Brand" }, { value: "category", label: "Category" }, { value: "type", label: "Type" }, { value: "stock", label: "Stock" }, { value: "min_stock", label: "Min Stock" }, { value: "status", label: "Status" }, { value: "created_at", label: "Created Date" }]} />
            </div>
            <div>
              <Label htmlFor="product-sort-direction">Direction</Label>
              <Select id="product-sort-direction" value={sortDirection} onChange={(value) => { setSortDirection(value as SortDirection); resetToFirstPage(); }} options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} />
            </div>
            <div>
              <Label htmlFor="product-page-size">Rows per page</Label>
              <Select id="product-page-size" value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); resetToFirstPage(); }} options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} / page` }))} />
            </div>
            {activeFilterCount > 0 ? <div className="flex items-end"><Button variant="outline" size="sm" onClick={handleClearFilters}>Clear ({activeFilterCount})</Button></div> : null}
          </div>

          {accessError ? <div role="status"><Alert variant="warning" title="Management actions unavailable" message={accessError} /></div> : null}
          {errorMessage ? <div role="alert" className="space-y-3"><Alert variant="error" title="Product list error" message={errorMessage} /><Button variant="outline" size="sm" onClick={() => void loadProducts()}>Try again</Button></div> : null}

          <TableViewport>
            <Table variant="admin" className="min-w-[1280px]">
              <TableHeader variant="admin"><TableRow>{["Product", "Type", "Brand / Category", "Variant / Stone", "UOM", "On Hand / Reserved / Available", "QR", "Status"].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}{canManage ? <TableCell isHeader variant="admin" className="text-right">Actions</TableCell> : null}</TableRow></TableHeader>
              <TableBody variant="admin">
                {isLoading ? <TableRow><TableCell variant="admin" colSpan={columnCount} className="py-10 text-center">Loading products...</TableCell></TableRow> : products.length === 0 ? <TableRow><TableCell variant="admin" colSpan={columnCount} className="py-10 text-center">No products found for the selected filters.</TableCell></TableRow> : products.map((product) => {
                  const isActionLoading = actionLoadingId === product.product_id;
                  const productImage = productImages[product.product_id];
                  return <TableRow key={product.product_id} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <TableCell variant="admin">
                      <div className="flex min-w-[260px] items-center gap-3">
                        {productImage ? (
                          <button
                            type="button"
                            className={`${ADMIN_FOCUS_RING} block shrink-0`}
                            aria-label={`View ${product.product_name} image`}
                            onClick={() => setPreviewImage(productImage)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={productImage.url}
                              alt={productImage.alt}
                              className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain dark:border-gray-800 dark:bg-gray-900"
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">—</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 dark:text-white/90">{product.product_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell variant="admin">{product.product_type_name || product.product_type_code || "—"}</TableCell>
                    <TableCell variant="admin">{product.brand || "—"}<br />{product.category || "—"}</TableCell>
                    <TableCell variant="admin">{product.product_type_pricing_model === "countertop_material_band" ? `${product.stone_type || "Stone"} · ${product.material_price_band || "—"}` : `${product.base_product_code || "—"} · ${product.color_name || product.color_code || "—"}`}</TableCell>
                    <TableCell variant="admin">{product.uom_name || product.uom_code || product.unit}</TableCell>
                    <TableCell variant="admin">{product.on_hand == null ? "—" : `${formatNumber(Number(product.on_hand))} / ${formatNumber(Number(product.reserved))} / ${formatNumber(Number(product.available))}`}</TableCell>
                    <TableCell variant="admin"><Badge size="sm" color={product.qr_status === "ready" ? "success" : "warning"}>{product.qr_status || "missing"}</Badge></TableCell>
                    <TableCell variant="admin"><Badge size="sm" color={statusColor(product.product_status)}>{formatStatus(product.product_status)}</Badge></TableCell>
                    {canManage ? (
                      <TableCell variant="admin" className="text-right">
                        <ProductRowActions
                          product={product}
                          isLoading={isActionLoading}
                          onToggleStatus={() => handleToggleStatus(product)}
                          onDuplicate={() => handleDuplicateProduct(product)}
                          onArchive={() => setArchiveTarget(product)}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </TableViewport>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p aria-live="polite" className="text-sm text-gray-500 dark:text-gray-400">Showing <span className="font-medium text-gray-700 dark:text-gray-300">{startRow}–{endRow}</span> of <span className="font-medium text-gray-700 dark:text-gray-300">{totalCount}</span> products</p>
            <nav aria-label="Product list pagination" className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage <= 1 || isLoading} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>{pageNumbers.map((page) => <span key={page} aria-current={currentPage === page ? "page" : undefined}><Button variant={currentPage === page ? "primary" : "outline"} size="sm" disabled={isLoading} onClick={() => setCurrentPage(page)}>{page}</Button></span>)}<Button variant="outline" size="sm" disabled={currentPage >= totalPages || isLoading} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button><span className="text-xs text-gray-500 dark:text-gray-400">Page {currentPage} of {totalPages}</span></nav>
          </div>
        </ComponentCard>
      </div>

      <Modal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        ariaLabel="Product image preview"
        className="m-4 max-w-5xl overflow-hidden"
      >
        {previewImage ? (
          <div className="flex max-h-[calc(100vh-4rem)] items-center justify-center p-4 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.alt}
              className="max-h-[calc(100vh-7rem)] w-full object-contain"
            />
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={Boolean(archiveTarget)} onClose={closeArchiveModal} showCloseButton={false} className="max-w-md p-6">
        {archiveTarget ? <div role="dialog" aria-modal="true" aria-labelledby="archive-product-title" aria-describedby="archive-product-description"><h4 id="archive-product-title" className="text-lg font-semibold text-gray-900 dark:text-white">Archive product?</h4><p id="archive-product-description" className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{archiveTarget.sku} will be archived. On-hand and reserved stock must be zero; archived status is terminal.</p><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><span ref={archiveCancelRef}><Button variant="outline" size="sm" disabled={actionLoadingId === archiveTarget.product_id} onClick={closeArchiveModal}>Cancel</Button></span><Button size="sm" disabled={actionLoadingId === archiveTarget.product_id} onClick={() => void confirmArchiveProduct()}>{actionLoadingId === archiveTarget.product_id ? "Archiving..." : "Archive product"}</Button></div></div> : null}
      </Modal>
    </>
  );
}
