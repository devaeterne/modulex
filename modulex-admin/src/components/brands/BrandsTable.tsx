"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type BrandStatus = "active" | "inactive";

type BrandRow = {
  id: string;
  name: string;
  status: BrandStatus;
  created_at: string;
  updated_at: string;
};

const statusBadgeClass: Record<BrandStatus, string> = {
  active:
    "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  inactive:
    "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
};

export default function BrandsTable() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredBrands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return brands;

    return brands.filter((brand) =>
      brand.name.toLowerCase().includes(query)
    );
  }, [brands, searchQuery]);

  async function loadBrands() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("product_brands")
      .select("id, name, status, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setBrands((data as BrandRow[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadBrands();
  }, []);

  async function handleCreateBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newBrandName.trim();

    if (!name) {
      setErrorMessage("Brand name is required.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.from("product_brands").insert({
      name,
      status: "active",
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setNewBrandName("");
    setSuccessMessage("Brand created successfully.");
    setIsSaving(false);
    await loadBrands();
  }

  function startEdit(brand: BrandRow) {
    setEditingId(brand.id);
    setEditingName(brand.name);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(brandId: string) {
    const name = editingName.trim();

    if (!name) {
      setErrorMessage("Brand name is required.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("product_brands")
      .update({ name })
      .eq("id", brandId);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setEditingId(null);
    setEditingName("");
    setSuccessMessage("Brand updated successfully.");
    setIsSaving(false);
    await loadBrands();
  }

  async function toggleStatus(brand: BrandRow) {
    const nextStatus: BrandStatus =
      brand.status === "active" ? "inactive" : "active";

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("product_brands")
      .update({ status: nextStatus })
      .eq("id", brand.id);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage(
      nextStatus === "active"
        ? "Brand activated successfully."
        : "Brand deactivated successfully."
    );
    setIsSaving(false);
    await loadBrands();
  }

  async function deleteBrand(brand: BrandRow) {
    const confirmed = window.confirm(
      `Delete brand "${brand.name}"? Existing products will keep the current text value.`
    );

    if (!confirmed) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("product_brands")
      .delete()
      .eq("id", brand.id);

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSuccessMessage("Brand deleted successfully.");
    setIsSaving(false);
    await loadBrands();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Brand Management
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create and manage product brands used in product forms.
            </p>
          </div>

          <div className="w-full lg:max-w-xs">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              type="text"
              placeholder="Search brands..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>
      </div>

      <div className="p-5">
        {errorMessage && (
          <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {successMessage}
          </div>
        )}

        <form
          onSubmit={handleCreateBrand}
          className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 sm:flex-row sm:items-center"
        >
          <input
            value={newBrandName}
            onChange={(event) => setNewBrandName(event.target.value)}
            type="text"
            placeholder="New brand name"
            className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          />

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Brand
          </button>
        </form>

        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading brands...
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Brand
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Updated
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-transparent">
                  {filteredBrands.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        No brands found.
                      </td>
                    </tr>
                  ) : (
                    filteredBrands.map((brand) => (
                      <tr key={brand.id}>
                        <td className="px-5 py-4">
                          {editingId === brand.id ? (
                            <input
                              value={editingName}
                              onChange={(event) =>
                                setEditingName(event.target.value)
                              }
                              type="text"
                              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                            />
                          ) : (
                            <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {brand.name}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[brand.status]
                              }`}
                          >
                            {brand.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(brand.updated_at).toLocaleDateString(
                            "en-US"
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {editingId === brand.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => saveEdit(brand.id)}
                                  disabled={isSaving}
                                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(brand)}
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleStatus(brand)}
                                  disabled={isSaving}
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300"
                                >
                                  {brand.status === "active"
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteBrand(brand)}
                                  disabled={isSaving}
                                  className="rounded-lg border border-error-200 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-60 dark:border-error-500/30 dark:text-error-400"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}