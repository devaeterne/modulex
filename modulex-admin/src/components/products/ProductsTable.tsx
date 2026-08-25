"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type ProductStatus = "active" | "inactive" | "archived";

type Product = {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  unit: string;
  min_stock_level: number;
  product_status: ProductStatus;
};

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

export default function ProductsTable() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadProducts(searchQuery = "") {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("search_products", {
      p_query: searchQuery,
      p_limit: 50,
    });

    if (error) {
      setErrorMessage(error.message);
      setProducts([]);
      setIsLoading(false);
      return;
    }

    setProducts((data as Product[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadProducts(query.trim());
  }

  function handleClearSearch() {
    setQuery("");
    loadProducts("");
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

    await loadProducts(query.trim());
    setActionLoadingId(null);
  }

  async function handleArchiveProduct(product: Product) {
    const confirmed = window.confirm(
      `Are you sure you want to archive ${product.sku}?`
    );

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

    await loadProducts(query.trim());
    setActionLoadingId(null);
  }

  function handleDuplicateProduct(product: Product) {
    router.push(`/products/new?duplicateFrom=${product.product_id}`);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Product List
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Search and manage product master data. Double click a row to edit.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch}>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="text"
                placeholder="Search SKU, barcode, name, brand..."
                className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[300px]"
              />

              {query.trim() && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          <Link
            href="/products/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add Product
          </Link>
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
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                SKU
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Product
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Barcode
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Brand
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Category
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Min Stock
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Loading products...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No products found.
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
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {product.product_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Unit: {product.unit}
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {product.barcode || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {product.brand || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {product.category || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {Number(product.min_stock_level).toLocaleString("en-US")}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          product.product_status
                        )}`}
                      >
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
                            handleToggleStatus(product);
                          }}
                          disabled={isActionLoading || isArchived}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${product.product_status === "active"
                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"
                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"
                            }`}
                        >
                          {product.product_status === "active"
                            ? "Deactivate"
                            : "Activate"}
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
                            handleArchiveProduct(product);
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
    </div>
  );
}