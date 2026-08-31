"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";

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

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const EXPORT_PAGE_SIZE = 100;

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";
const controlClass =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-theme-xs outline-none transition focus-visible:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300";

function statusClass(status: ProductStatus) {
  switch (status) {
    case "active":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
    case "inactive":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
    case "archived":
      return "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
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

export default function ProductsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
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

  const loadProducts = useCallback(
    async (options?: { background?: boolean }) => {
      const requestId = ++requestIdRef.current;
      const background = options?.background === true;
      if (!background) setIsLoading(true);
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

      setProducts(payload?.items ?? []);
      setBrands(payload?.filters?.brands ?? []);
      setCategories(payload?.filters?.categories ?? []);
      setProductTypes(payload?.filters?.product_types ?? []);
      setUoms(payload?.filters?.uoms ?? []);
      setTotalCount(Number(payload?.total_count ?? 0));
      setTotalPages(nextTotalPages);
      if (!background) setIsLoading(false);
    },
    [currentPage, pageSize, getLegacyRpcArgs, getV2RpcArgs]
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

  return (
    <>
      <div
        className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        aria-busy={isLoading || isExporting || Boolean(actionLoadingId)}
      >
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Product List</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Search, filter and sort canonical product variants. Export always includes the full filtered result set.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
              <div>
                <label htmlFor="product-search" className="sr-only">Search products</label>
                <input
                  id="product-search"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  type="search"
                  placeholder="Search SKU, family, color, barcode, name..."
                  className={`h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[320px] ${focusClass}`}
                />
              </div>
              <button
                type="submit"
                className={`inline-flex h-10 w-full items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 sm:w-auto ${focusClass}`}
              >
                Search
              </button>
            </form>

            <button
              type="button"
              onClick={() => void exportProductsCsv()}
              disabled={isExporting}
              className={`inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04] ${focusClass}`}
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>

            {canManage ? (
              <Link
                href="/products/new"
                className={`inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 ${focusClass}`}
              >
                Add Product
              </Link>
            ) : null}
          </div>
        </div>

        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
            <div className="space-y-1.5">
              <label htmlFor="product-status-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
              <select
                id="product-status-filter"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  resetToFirstPage();
                }}
                className={controlClass}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-brand-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Brand</label>
              <select
                id="product-brand-filter"
                value={brandFilter}
                onChange={(event) => {
                  setBrandFilter(event.target.value);
                  resetToFirstPage();
                }}
                className={controlClass}
              >
                <option value="">All Brands</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-category-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Category</label>
              <select
                id="product-category-filter"
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  resetToFirstPage();
                }}
                className={controlClass}
              >
                <option value="">All Categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-type-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Product Type</label>
              <select id="product-type-filter" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); resetToFirstPage(); }} className={controlClass}><option value="">All Types</option>{productTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-uom-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400">UOM</label>
              <select id="product-uom-filter" value={uomFilter} onChange={(event) => { setUomFilter(event.target.value); resetToFirstPage(); }} className={controlClass}><option value="">All UOMs</option>{uoms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-qr-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400">QR</label>
              <select id="product-qr-filter" value={qrFilter} onChange={(event) => { setQrFilter(event.target.value); resetToFirstPage(); }} className={controlClass}><option value="">All QR</option><option value="ready">Ready</option><option value="missing">Missing</option></select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-sort-by" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Sort by</label>
              <select
                id="product-sort-by"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as SortBy);
                  resetToFirstPage();
                }}
                className={controlClass}
              >
                <option value="sku">SKU</option>
                <option value="name">Product Name</option>
                <option value="brand">Brand</option>
                <option value="category">Category</option>
                <option value="type">Type</option>
                <option value="stock">Stock</option>
                <option value="min_stock">Min Stock</option>
                <option value="status">Status</option>
                <option value="created_at">Created Date</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-sort-direction" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Direction</label>
              <select
                id="product-sort-direction"
                value={sortDirection}
                onChange={(event) => {
                  setSortDirection(event.target.value as SortDirection);
                  resetToFirstPage();
                }}
                className={controlClass}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-page-size" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Rows per page</label>
              <div className="flex items-center gap-2">
                <select
                  id="product-page-size"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    resetToFirstPage();
                  }}
                  className={`${controlClass} min-w-[110px] flex-1`}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className={`h-10 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04] ${focusClass}`}
                  >
                    Clear ({activeFilterCount})
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {accessError ? (
          <div role="status" className="mx-5 mt-5 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
            {accessError}
          </div>
        ) : null}

        {errorMessage ? (
          <div role="alert" className="m-5 flex flex-col gap-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-error-300 px-3 text-xs font-semibold transition hover:bg-error-100 dark:border-error-500/40 dark:hover:bg-error-500/10 ${focusClass}`}
            >
              Try again
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {["Product", "Type", "Brand / Category", "Variant / Stone", "UOM", "On Hand / Reserved / Available", "QR", "Status"].map((label) => (
                  <th key={label} scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>
                ))}
                {canManage ? <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Actions</th> : null}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={columnCount} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading products...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={columnCount} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No products found for the selected filters.</td></tr>
              ) : (
                products.map((product) => {
                  const isActionLoading = actionLoadingId === product.product_id;
                  const isArchived = product.product_status === "archived";
                  return (
                    <tr key={product.product_id} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">{product.product_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.product_type_name || product.product_type_code || "—"}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.brand || "—"}<br />{product.category || "—"}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.product_type_pricing_model === "countertop_material_band" ? `${product.stone_type || "Stone"} · ${product.material_price_band || "—"}` : `${product.base_product_code || "—"} · ${product.color_name || product.color_code || "—"}`}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.uom_name || product.uom_code || product.unit}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.on_hand == null ? "—" : `${formatNumber(Number(product.on_hand))} / ${formatNumber(Number(product.reserved))} / ${formatNumber(Number(product.available))}`}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.qr_status || "missing"}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(product.product_status)}`}>{formatStatus(product.product_status)}</span>
                      </td>
                      {canManage ? (
                        <td className="px-5 py-4">
                          <div className="flex min-w-0 items-center justify-end gap-2">
                            <Link href={`/products/${product.product_id}/edit`} className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${focusClass}`}>Edit</Link>
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(product)}
                              disabled={isActionLoading || isArchived}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${focusClass} ${product.product_status === "active" ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400" : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"}`}
                            >
                              {isActionLoading ? "Saving..." : product.product_status === "active" ? "Deactivate" : "Activate"}
                            </button>
                            <button type="button" onClick={() => handleDuplicateProduct(product)} disabled={isActionLoading} className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] ${focusClass}`}>Duplicate</button>
                            <button type="button" onClick={() => setArchiveTarget(product)} disabled={isActionLoading || isArchived} className={`rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 ${focusClass}`}>Archive</button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <p aria-live="polite" className="text-sm text-gray-500 dark:text-gray-400">
            Showing <span className="font-medium text-gray-700 dark:text-gray-300">{startRow}–{endRow}</span> of <span className="font-medium text-gray-700 dark:text-gray-300">{totalCount}</span> products
          </p>

          <nav aria-label="Product list pagination" className="flex flex-wrap items-center gap-2">
            <button type="button" aria-label="Previous page" disabled={currentPage <= 1 || isLoading} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className={`h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04] ${focusClass}`}>Previous</button>
            {pageNumbers.map((page) => (
              <button
                type="button"
                key={page}
                aria-label={`Page ${page}`}
                aria-current={currentPage === page ? "page" : undefined}
                disabled={isLoading}
                onClick={() => setCurrentPage(page)}
                className={`h-9 min-w-9 rounded-lg px-3 text-xs font-medium transition ${focusClass} ${currentPage === page ? "bg-brand-500 text-white" : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"}`}
              >
                {page}
              </button>
            ))}
            <button type="button" aria-label="Next page" disabled={currentPage >= totalPages || isLoading} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} className={`h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04] ${focusClass}`}>Next</button>
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">Page {currentPage} of {totalPages}</span>
          </nav>
        </div>
      </div>

      {archiveTarget ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close archive confirmation"
            onClick={() => {
              if (actionLoadingId !== archiveTarget.product_id) setArchiveTarget(null);
            }}
            className="absolute inset-0 bg-gray-950/50 backdrop-blur-[1px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-product-title"
            aria-describedby="archive-product-description"
            className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900"
          >
            <h4 id="archive-product-title" className="text-lg font-semibold text-gray-900 dark:text-white">Archive product?</h4>
            <p id="archive-product-description" className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {archiveTarget.sku} will be archived. On-hand and reserved stock must be zero; archived status is terminal.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" autoFocus disabled={actionLoadingId === archiveTarget.product_id} onClick={() => setArchiveTarget(null)} className={`inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04] ${focusClass}`}>Cancel</button>
              <button type="button" disabled={actionLoadingId === archiveTarget.product_id} onClick={() => void confirmArchiveProduct()} className={`inline-flex h-10 items-center justify-center rounded-lg bg-error-600 px-4 text-sm font-semibold text-white transition hover:bg-error-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>{actionLoadingId === archiveTarget.product_id ? "Archiving..." : "Archive product"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
