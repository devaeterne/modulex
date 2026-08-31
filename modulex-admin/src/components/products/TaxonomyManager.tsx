"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
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
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type TaxonomyStatus = "active" | "inactive";
type TaxonomyRow = {
  id: string;
  name: string;
  status: TaxonomyStatus;
  updated_at: string;
  product_count?: number;
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
      .select("id,name,status,updated_at,products(count)")
      .order("name", { ascending: true });

    if (error) {
      reportTaxonomyError(entityLabelPlural, "load failed", error);
      setRows([]);
      setErrorMessage(`${entityLabelPlural} are temporarily unavailable. Please try again.`);
    } else {
      setRows(((data ?? []) as unknown as Array<TaxonomyRow & { products?: { count: number }[] }>).map((row) => ({ ...row, product_count: row.products?.[0]?.count ?? 0 })));
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
    <div className="space-y-6" aria-busy={isLoading || isCreating || Boolean(savingId)}>
      <ComponentCard
        title={`${entityLabel} Management`}
        desc={`Create and maintain ${entityLabelPlural.toLowerCase()} used by canonical product records.`}
      >
        <div className="grid gap-4 lg:grid-cols-2 lg:items-end">
          <div>
            <Label htmlFor={`${tableName}-search`}>Search {entityLabelPlural.toLowerCase()}</Label>
            <InputField id={`${tableName}-search`} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search ${entityLabelPlural.toLowerCase()}...`} />
          </div>
          <form onSubmit={createRow} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor={`${tableName}-new`}>New {entityLabel.toLowerCase()} name</Label>
              <InputField id={`${tableName}-new`} value={newName} onChange={(event) => setNewName(event.target.value)} type="text" />
            </div>
            <Button type="submit" disabled={isCreating}>{isCreating ? "Adding..." : `Add ${entityLabel}`}</Button>
          </form>
        </div>
      </ComponentCard>

      <ComponentCard title={`${entityLabel} Directory`} desc={`Review product usage and lifecycle status for ${entityLabelPlural.toLowerCase()}.`}>
        <div aria-live="polite" className="space-y-3">
          {errorMessage ? <div role="alert" className="space-y-3"><Alert variant="error" title={`${entityLabelPlural} unavailable`} message={errorMessage} /><Button variant="outline" size="sm" onClick={() => void loadRows()}>Retry</Button></div> : null}
          {successMessage ? <Alert variant="success" title="Saved" message={successMessage} /> : null}
        </div>

        {isLoading ? <Alert variant="info" title={`Loading ${entityLabelPlural}`} message={`Reference ${entityLabelPlural.toLowerCase()} are being loaded.`} /> : (
          <TableViewport>
            <Table variant="admin" className="min-w-[680px]">
              <TableHeader variant="admin"><TableRow>{[entityLabel, "Products", "Status", "Updated"].map((label) => <TableCell key={label} isHeader variant="admin" className="text-left">{label}</TableCell>)}<TableCell isHeader variant="admin" className="text-right">Actions</TableCell></TableRow></TableHeader>
              <TableBody variant="admin">
                {filteredRows.length === 0 ? <TableRow><TableCell variant="admin" colSpan={5} className="py-8 text-center">No {entityLabelPlural.toLowerCase()} match the current search.</TableCell></TableRow> : filteredRows.map((row) => (
                  <TableRow key={row.id} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <TableCell variant="admin">
                      {editingId === row.id ? <><Label htmlFor={`${tableName}-edit-${row.id}`} className="sr-only">Edit {entityLabel.toLowerCase()} {row.name}</Label><InputField id={`${tableName}-edit-${row.id}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} /></> : <span className="font-medium text-gray-800 dark:text-white/90">{row.name}</span>}
                    </TableCell>
                    <TableCell variant="admin"><Link className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400" href={`/products?${tableName === "product_brands" ? "brand" : "category"}=${row.id}`}>{row.product_count ?? 0}</Link></TableCell>
                    <TableCell variant="admin"><Badge color={row.status === "active" ? "success" : "light"} size="sm">{row.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell variant="admin" className="text-gray-500 dark:text-gray-400">{new Date(row.updated_at).toLocaleDateString()}</TableCell>
                    <TableCell variant="admin"><div className="flex justify-end gap-2">{editingId === row.id ? <><Button size="sm" onClick={() => void saveEdit(row)} disabled={savingId === row.id}>Save</Button><Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditingName(""); }}>Cancel</Button></> : <><Button size="sm" variant="outline" onClick={() => { setEditingId(row.id); setEditingName(row.name); }}>Edit</Button><Button size="sm" variant="outline" onClick={() => void toggleStatus(row)} disabled={savingId === row.id}>{row.status === "active" ? "Deactivate" : "Activate"}</Button><Button size="sm" variant="outline" onClick={() => setPendingDelete(row)} disabled={savingId === row.id}>Delete</Button></>}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        )}
      </ComponentCard>

      <Modal isOpen={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} showCloseButton={false} closeOnEscape={false} backdropCloseEvent="mouseDown" className="max-w-md p-5">
        {pendingDelete ? <div role="dialog" aria-modal="true" aria-labelledby="taxonomy-delete-title"><h3 id="taxonomy-delete-title" className="text-lg font-semibold text-gray-800 dark:text-white/90">Delete {entityLabel.toLowerCase()}?</h3><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Delete “{pendingDelete.name}”? A referenced {entityLabel.toLowerCase()} cannot be deleted; reassign its products first. Taxonomy used by active products also cannot be deactivated.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>Cancel</Button><Button size="sm" disabled={savingId === pendingDelete.id} onClick={() => void confirmDelete()}>{savingId === pendingDelete.id ? "Deleting..." : "Delete"}</Button></div></div> : null}
      </Modal>
    </div>
  );
}
