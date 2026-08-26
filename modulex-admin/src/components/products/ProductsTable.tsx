"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type ProductStatus = "active" | "inactive" | "archived";
type SortBy = "sku" | "name" | "brand" | "category" | "min_stock" | "status" | "created_at";
type SortDirection = "asc" | "desc";

type Product = {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  brand_id: string | null;
  category_id: string | null;
  brand: string | null;
  category: string | null;
  unit: string;
  min_stock_level: number;
  product_status: ProductStatus;
  created_at: string;
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
  };
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const controlClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300";

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

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default function ProductsTable() {
  const router = useRouter();
  const requestIdRef = useRef(0);

  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);

  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("sku");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeFilterCount = [query, statusFilter, brandFilter, categoryFilter].filter(Boolean).length;

  const loadProducts = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("get_products_page", {
      p_query: query,
      p_page: currentPage,
      p_page_size: pageSize,
      p_status: statusFilter || null,
      p_brand_id: brandFilter || null,
      p_category_id: categoryFilter || null,
      p_sort_by: sortBy,
      p_sort_direction: sortDirection,
    });

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    const payload = data as ProductsPagePayload | null;
    const nextTotalPages = Math.max(1, Number(payload?.total_pages ?? 1));

    if (currentPage > nextTotalPages) {
      setCurrentPage(nextTotalPages);
      return;
    }

    setProducts(payload?.items ?? []);
    setBrands(payload?.filters?.brands ?? []);
    setCategories(payload?.filters?.categories ?? []);
    setTotalCount(Number(payload?.total_count ?? 0));
    setTotalPages(nextTotalPages);
    setIsLoading(false);
  }, [
    query,
    currentPage,
    pageSize,
    statusFilter,
    brandFilter,
    categoryFilter,
    sortBy,
    sortDirection,
  ]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function resetToFirstPage() {
    setCurrentPage(1);
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput.trim());
    resetToFirstPage();
  }

  function handleClearSearch() {
    setQueryInput("");
    setQuery("");
    resetToFirstPage();
  }

  function handleClearFilters() {
    setQueryInput("");
    setQuery("");
    setStatusFilter("");
    setBrandFilter("");
    setCategoryFilter("");
    setSortBy("sku");
    setSortDirection("asc");
    resetToFirstPage();
  }

  function openProductEdit(productId: string) {
    router.push(`/products/${productId}/edit`);
  }

  async function handleToggleStatus(product: Product) {
    if (product.product_status === "archived") {
      setErrorMessage("Archived products cannot be activated from this table.");
      return;
    }

    const nextStatus: ProductStatus =
      product.product_status === "active" ? "inactive" : "active";

    setActionLoadingId(product.product_id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("products")
      .update({ status: nextStatus })
      .eq("id", product.product_id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadProducts();
    setActionLoadingId(null);
  }

  async function handleArchiveProduct(product: Product) {
    const confirmed = window.confirm(`Are you sure you want to archive ${product.sku}?`);
    if (!confirmed) return;

    setActionLoadingId(product.product_id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("products")
      .update({ status: "archived" })
      .eq("id", product.product_id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadProducts();
    setActionLoadingId(null);
  }

  function handleDuplicateProduct(product: Product) {
    router.push(`/products/new?duplicateFrom=${product.product_id}`);
  }

  const startRow = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Product List</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Server-side pagination, filtering and sorting. Double click a row to edit.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              type="text"
              placeholder="Search SKU, barcode, name, brand..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[320px]"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Search
            </button>
          </form>

          <Link
            href="/products/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add Product
          </Link>
        </div>
      </div>

      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
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

          <select
            value={brandFilter}
            onChange={(event) => {
              setBrandFilter(event.target.value);
              resetToFirstPage();
            }}
            className={controlClass}
          >
            <option value="">All Brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              resetToFirstPage();
            }}
            className={controlClass}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as SortBy);
              resetToFirstPage();
            }}
            className={controlClass}
          >
            <option value="sku">Sort: SKU</option>
            <option value="name">Sort: Product Name</option>
            <option value="brand">Sort: Brand</option>
            <option value="category">Sort: Category</option>
            <option value="min_stock">Sort: Min Stock</option>
            <option value="status">Sort: Status</option>
            <option value="created_at">Sort: Created Date</option>
          </select>

          <select
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

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                resetToFirstPage();
              }}
              className={`${controlClass} min-w-[110px] flex-1`}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                Clear ({activeFilterCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="m-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr>
              {[
                "SKU",
                "Product",
                "Barcode",
                "Brand",
                "Category",
                "Min Stock",
                "Status",
              ].map((label) => (
                <th
                  key={label}
                  className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                >
                  {label}
                </th>
              ))}
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading products...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  No products found for the selected filters.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const isActionLoading = actionLoadingId === product.product_id;
                const isArchived = product.product_status === "archived";

                return (
                  <tr
                    key={product.product_id}
                    onDoubleClick={() => openProductEdit(product.product_id)}
                    title="Double click to edit"
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                      {product.sku}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{product.product_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Unit: {product.unit}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.barcode || "-"}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.brand || "-"}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{product.category || "-"}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {Number(product.min_stock_level).toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(product.product_status)}`}>
                        {formatStatus(product.product_status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex min-w-[360px] items-center justify-end gap-2">
                        <Link
                          href={`/products/${product.product_id}/edit`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleStatus(product);
                          }}
                          disabled={isActionLoading || isArchived}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            product.product_status === "active"
                              ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"
                              : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
                          }`}
                        >
                          {product.product_status === "active" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDuplicateProduct(product);
                          }}
                          disabled={isActionLoading}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleArchiveProduct(product);
                          }}
                          disabled={isActionLoading || isArchived}
                          className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400"
                        >
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 border-t border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing <span className="font-medium text-gray-700 dark:text-gray-300">{startRow}–{endRow}</span> of{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">{totalCount}</span> products
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Previous
          </button>

          {pageNumbers.map((page) => (
            <button
              type="button"
              key={page}
              disabled={isLoading}
              onClick={() => setCurrentPage(page)}
              className={`h-9 min-w-9 rounded-lg px-3 text-xs font-medium transition ${
                currentPage === page
                  ? "bg-brand-500 text-white"
                  : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Next
          </button>

          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      </div>
    </div>
  );
}
