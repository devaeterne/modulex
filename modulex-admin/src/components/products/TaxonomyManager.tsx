"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type TaxonomyStatus = "active" | "inactive";
type TaxonomyRow = {
  id: string;
  name: string;
  status: TaxonomyStatus;
  updated_at: string;
};

type TaxonomyManagerProps = {
  entityLabel: "Brand" | "Category";
  entityLabelPlural: "Brands" | "Categories";
  tableName: "product_brands" | "product_categories";
};

type TaxonomyError = {
  code?: string;
  message?: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus-visible:border-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";
const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

function reportTaxonomyError(entity: string, context: string, error: unknown) {
  console.error(`[${entity}] ${context}`, error);
}

function taxonomyMutationErrorMessage(
  error: TaxonomyError,
  entityLabel: "Brand" | "Category",
  action: "create" | "update" | "deactivate" | "delete"
) {
  const detail = error?.message ?? "";
  const lowerEntity = entityLabel.toLowerCase();

  if (error?.code === "23505") {
    return `${entityLabel} already exists. Use a unique name.`;
  }
  if (detail.includes("used by active products cannot be deactivated")) {
    return `${entityLabel} used by active products cannot be deactivated. Deactivate or reassign those products first.`;
  }
  if (detail.includes("Referenced") && detail.includes("cannot be deleted")) {
    return `This referenced ${lowerEntity} cannot be deleted. Reassign its products first.`;
  }
  if (error?.code === "23503" && action === "delete") {
    return `This referenced ${lowerEntity} cannot be deleted. Reassign its products first.`;
  }

  const verb = action === "deactivate" ? "change the status of" : action;
  return `We couldn’t ${verb} the ${lowerEntity}. Please try again.`;
}

export default function TaxonomyManager({ entityLabel, entityLabelPlural, tableName }: TaxonomyManagerProps) {
  const [rows, setRows] = useState<TaxonomyRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TaxonomyRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? rows.filter((row) => row.name.toLowerCase().includes(query)) : rows;
  }, [rows, searchQuery]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from(tableName)
      .select("id,name,status,updated_at")
      .order("name", { ascending: true });

    if (error) {
      reportTaxonomyError(entityLabelPlural, "load failed", error);
      setRows([]);
      setErrorMessage(`${entityLabelPlural} are temporarily unavailable. Please try again.`);
    } else {
      setRows((data ?? []) as TaxonomyRow[]);
    }
    setIsLoading(false);
  }, [entityLabelPlural, tableName]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function createRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setErrorMessage(`${entityLabel} name is required.`);
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.from(tableName).insert({ name, status: "active" });
    if (error) {
      reportTaxonomyError(entityLabelPlural, "create failed", error);
      setErrorMessage(taxonomyMutationErrorMessage(error, entityLabel, "create"));
      setIsCreating(false);
      return;
    }

    setNewName("");
    setSuccessMessage(`${entityLabel} created.`);
    setIsCreating(false);
    await loadRows();
  }

  async function saveEdit(row: TaxonomyRow) {
    const name = editingName.trim();
    if (!name) {
      setErrorMessage(`${entityLabel} name is required.`);
      return;
    }

    setSavingId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.from(tableName).update({ name }).eq("id", row.id);
    if (error) {
      reportTaxonomyError(entityLabelPlural, "update failed", error);
      setErrorMessage(taxonomyMutationErrorMessage(error, entityLabel, "update"));
      setSavingId(null);
      return;
    }

    setEditingId(null);
    setEditingName("");
    setSuccessMessage(`${entityLabel} updated.`);
    setSavingId(null);
    await loadRows();
  }

  async function toggleStatus(row: TaxonomyRow) {
    const nextStatus: TaxonomyStatus = row.status === "active" ? "inactive" : "active";
    setSavingId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.from(tableName).update({ status: nextStatus }).eq("id", row.id);
    if (error) {
      reportTaxonomyError(entityLabelPlural, "status update failed", error);
      setErrorMessage(taxonomyMutationErrorMessage(error, entityLabel, "deactivate"));
      setSavingId(null);
      return;
    }

    setSuccessMessage(`${entityLabel} ${nextStatus === "active" ? "activated" : "deactivated"}.`);
    setSavingId(null);
    await loadRows();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const row = pendingDelete;
    setSavingId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.from(tableName).delete().eq("id", row.id);
    if (error) {
      reportTaxonomyError(entityLabelPlural, "delete failed", error);
      setErrorMessage(taxonomyMutationErrorMessage(error, entityLabel, "delete"));
      setSavingId(null);
      return;
    }

    setPendingDelete(null);
    setSuccessMessage(`${entityLabel} deleted.`);
    setSavingId(null);
    await loadRows();
  }

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      aria-busy={isLoading || isCreating || Boolean(savingId)}
    >
      <div className="border-b border-gray-200 px-4 py-4 sm:px-5 dark:border-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{entityLabel} Management</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create and maintain {entityLabelPlural.toLowerCase()} used by canonical product records.
            </p>
          </div>
          <div className="w-full lg:max-w-xs">
            <label htmlFor={`${tableName}-search`} className="sr-only">Search {entityLabelPlural.toLowerCase()}</label>
            <input
              id={`${tableName}-search`}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={`Search ${entityLabelPlural.toLowerCase()}...`}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div aria-live="polite" className="space-y-3">
          {errorMessage ? (
            <div className="flex flex-col gap-2 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => void loadRows()} className={`font-medium underline underline-offset-2 ${focusClass}`}>Retry</button>
            </div>
          ) : null}
          {successMessage ? (
            <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">{successMessage}</div>
          ) : null}
        </div>

        <form onSubmit={createRow} className="my-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={`${tableName}-new`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">New {entityLabel.toLowerCase()} name</label>
            <input id={`${tableName}-new`} value={newName} onChange={(event) => setNewName(event.target.value)} type="text" className={inputClass} />
          </div>
          <button type="submit" disabled={isCreating} className={`inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`}>{isCreating ? "Adding..." : `Add ${entityLabel}`}</button>
        </form>

        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">Loading {entityLabelPlural.toLowerCase()}...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="min-w-[680px] w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{entityLabel}</th>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Updated</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-transparent">
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-500">No {entityLabelPlural.toLowerCase()} match the current search.</td></tr>
                  ) : filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-4">
                        {editingId === row.id ? (
                          <>
                            <label htmlFor={`${tableName}-edit-${row.id}`} className="sr-only">Edit {entityLabel.toLowerCase()} {row.name}</label>
                            <input id={`${tableName}-edit-${row.id}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} className={inputClass} />
                          </>
                        ) : <span className="text-sm font-medium text-gray-800 dark:text-white/90">{row.name}</span>}
                      </td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.status === "active" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"}`}>{row.status === "active" ? "Active" : "Inactive"}</span></td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{new Date(row.updated_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {editingId === row.id ? (
                            <>
                              <button type="button" onClick={() => void saveEdit(row)} disabled={savingId === row.id} className={`rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${focusClass}`}>Save</button>
                              <button type="button" onClick={() => { setEditingId(null); setEditingName(""); }} className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => { setEditingId(row.id); setEditingName(row.name); }} className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>Edit</button>
                              <button type="button" onClick={() => void toggleStatus(row)} disabled={savingId === row.id} className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>{row.status === "active" ? "Deactivate" : "Activate"}</button>
                              <button type="button" onClick={() => setPendingDelete(row)} disabled={savingId === row.id} className={`rounded-lg border border-error-200 px-3 py-1.5 text-xs font-medium text-error-600 disabled:opacity-60 dark:border-error-500/30 dark:text-error-400 ${focusClass}`}>Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {pendingDelete ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-gray-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="taxonomy-delete-title" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 id="taxonomy-delete-title" className="text-lg font-semibold text-gray-800 dark:text-white/90">Delete {entityLabel.toLowerCase()}?</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Delete “{pendingDelete.name}”? A referenced {entityLabel.toLowerCase()} cannot be deleted; reassign its products first. Taxonomy used by active products also cannot be deactivated.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingDelete(null)} className={`h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300 ${focusClass}`}>Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} disabled={savingId === pendingDelete.id} className={`h-10 rounded-lg bg-error-500 px-4 text-sm font-medium text-white disabled:opacity-60 ${focusClass}`}>{savingId === pendingDelete.id ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
