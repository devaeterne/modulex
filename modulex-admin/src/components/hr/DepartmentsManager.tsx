"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import type { HrDepartment } from "@/lib/hr/types";

export default function DepartmentsManager() {
  const [rows, setRows] = useState<HrDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  function showError(message: string, cause?: unknown) {
    if (cause) console.error(message, cause);
    setError(message);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("hr_departments")
      .select("*")
      .order("sort_order")
      .order("name");
    if (loadError) showError("Departments could not be loaded. Please try again.", loadError);
    else setRows((data ?? []) as HrDepartment[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);

  async function addDepartment() {
    if (!name.trim() || !code.trim()) {
      setError("Department name and code are required.");
      return;
    }
    setSavingId("new");
    setError(null);
    setSuccess(null);
    const { error: saveError } = await supabase.from("hr_departments").insert({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      sort_order: rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10,
    });
    if (saveError) showError("Department could not be added. Check the code and try again.", saveError);
    else {
      setName("");
      setCode("");
      setDescription("");
      setSuccess("Department added.");
      await load();
    }
    setSavingId(null);
  }

  async function saveDepartment(row: HrDepartment) {
    setSavingId(row.id);
    setError(null);
    setSuccess(null);
    const { error: saveError } = await supabase
      .from("hr_departments")
      .update({
        code: row.code.trim().toUpperCase(),
        name: row.name.trim(),
        description: row.description?.trim() || null,
        is_active: row.is_active,
        sort_order: row.sort_order,
      })
      .eq("id", row.id);
    if (saveError) showError("Department could not be saved. Please try again.", saveError);
    else {
      setSuccess("Department saved.");
      await load();
    }
    setSavingId(null);
  }

  function patchRow(id: string, patch: Partial<HrDepartment>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Department action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Departments updated" message={success} /> : null}

      <ComponentCard title="Add Department" desc={`${activeCount} active department${activeCount === 1 ? "" : "s"}.`}>
        <div className="grid gap-4 lg:grid-cols-[180px_1fr_1.5fr_auto] lg:items-end">
          <div><Label htmlFor="department-code">Code</Label><Input id="department-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="SALES" /></div>
          <div><Label htmlFor="department-name">Name</Label><Input id="department-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Sales" /></div>
          <div><Label htmlFor="department-description">Description</Label><Input id="department-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" /></div>
          <Button onClick={() => void addDepartment()} disabled={savingId !== null}>{savingId === "new" ? "Adding…" : "Add Department"}</Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Departments" desc="Edit department metadata, order and active status inline.">
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin"><TableRow>
              <TableCell isHeader variant="admin">Code</TableCell>
              <TableCell isHeader variant="admin">Name</TableCell>
              <TableCell isHeader variant="admin">Description</TableCell>
              <TableCell isHeader variant="admin">Order</TableCell>
              <TableCell isHeader variant="admin">Active</TableCell>
              <TableCell isHeader variant="admin">Actions</TableCell>
            </TableRow></TableHeader>
            <TableBody variant="admin" aria-busy={loading}>
              {loading ? <TableStateRow colSpan={6}>Loading departments…</TableStateRow> : rows.length === 0 ? <TableStateRow colSpan={6}>No departments configured.</TableStateRow> : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell variant="admin"><Input aria-label={`Code for ${row.name}`} value={row.code} onChange={(event) => patchRow(row.id, { code: event.target.value })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Input aria-label={`Name for ${row.code}`} value={row.name} onChange={(event) => patchRow(row.id, { name: event.target.value })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Input aria-label={`Description for ${row.name}`} value={row.description ?? ""} onChange={(event) => patchRow(row.id, { description: event.target.value })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Input aria-label={`Sort order for ${row.name}`} type="number" value={row.sort_order} onChange={(event) => patchRow(row.id, { sort_order: Number(event.target.value) || 0 })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Checkbox ariaLabel={`${row.name} active`} checked={row.is_active} onChange={(checked) => patchRow(row.id, { is_active: checked })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Button size="sm" onClick={() => void saveDepartment(row)} disabled={savingId !== null}>{savingId === row.id ? "Saving…" : "Save"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Sort order controls how departments are presented in Personnel selectors.</p>
      </ComponentCard>
    </div>
  );
}
