"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import type { HrDepartment, HrPosition } from "@/lib/hr/types";

export default function PositionsManager() {
  const [rows, setRows] = useState<HrPosition[]>([]);
  const [departments, setDepartments] = useState<HrDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [description, setDescription] = useState("");

  function showError(message: string, cause?: unknown) {
    if (cause) console.error(message, cause);
    setError(message);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const [positionsResult, departmentsResult] = await Promise.all([
      supabase.from("hr_positions").select("*").order("sort_order").order("title"),
      supabase.from("hr_departments").select("*").order("sort_order").order("name"),
    ]);
    const firstError = positionsResult.error ?? departmentsResult.error;
    if (firstError) showError("Positions could not be loaded. Please try again.", firstError);
    else {
      setRows((positionsResult.data ?? []) as HrPosition[]);
      setDepartments((departmentsResult.data ?? []) as HrDepartment[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);
  const departmentOptions = departments.filter((department) => department.is_active).map((department) => ({ value: department.id, label: department.name }));
  const allDepartmentOptions = departments.map((department) => ({ value: department.id, label: department.name }));

  async function addPosition() {
    if (!code.trim() || !title.trim()) {
      setError("Position code and title are required.");
      return;
    }
    setSavingId("new");
    setError(null);
    setSuccess(null);
    const { error: saveError } = await supabase.from("hr_positions").insert({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      department_id: departmentId || null,
      description: description.trim() || null,
      sort_order: rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10,
    });
    if (saveError) showError("Position could not be added. Check the code and try again.", saveError);
    else {
      setCode(""); setTitle(""); setDepartmentId(""); setDescription("");
      setSuccess("Position added.");
      await load();
    }
    setSavingId(null);
  }

  async function savePosition(row: HrPosition) {
    setSavingId(row.id);
    setError(null);
    setSuccess(null);
    const { error: saveError } = await supabase.from("hr_positions").update({
      code: row.code.trim().toUpperCase(),
      title: row.title.trim(),
      department_id: row.department_id,
      description: row.description?.trim() || null,
      is_active: row.is_active,
      sort_order: row.sort_order,
    }).eq("id", row.id);
    if (saveError) showError("Position could not be saved. Please try again.", saveError);
    else { setSuccess("Position saved."); await load(); }
    setSavingId(null);
  }

  function patchRow(id: string, patch: Partial<HrPosition>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Position action failed" message={error} /> : null}
      {success ? <Alert variant="success" title="Positions updated" message={success} /> : null}

      <ComponentCard title="Add Position" desc={`${activeCount} active position${activeCount === 1 ? "" : "s"}. Job titles are shared across Personnel and payroll.`}>
        <div className="grid gap-4 xl:grid-cols-[160px_1fr_1fr_1.5fr_auto] xl:items-end">
          <div><Label htmlFor="position-code">Code</Label><Input id="position-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="DESIGNER" /></div>
          <div><Label htmlFor="position-title">Title</Label><Input id="position-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Designer" /></div>
          <div><Label htmlFor="position-department">Department</Label><Select id="position-department" options={departmentOptions} value={departmentId} onChange={setDepartmentId} allowEmpty placeholder="No department" /></div>
          <div><Label htmlFor="position-description">Description</Label><Input id="position-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" /></div>
          <Button onClick={() => void addPosition()} disabled={savingId !== null}>{savingId === "new" ? "Adding…" : "Add Position"}</Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Positions" desc="Edit job title metadata, department assignment, order and active status inline.">
        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin"><TableRow>
              <TableCell isHeader variant="admin">Code</TableCell><TableCell isHeader variant="admin">Title</TableCell><TableCell isHeader variant="admin">Department</TableCell><TableCell isHeader variant="admin">Description</TableCell><TableCell isHeader variant="admin">Order</TableCell><TableCell isHeader variant="admin">Active</TableCell><TableCell isHeader variant="admin">Actions</TableCell>
            </TableRow></TableHeader>
            <TableBody variant="admin" aria-busy={loading}>
              {loading ? <TableStateRow colSpan={7}>Loading positions…</TableStateRow> : rows.length === 0 ? <TableStateRow colSpan={7}>No positions configured.</TableStateRow> : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell variant="admin"><Input aria-label={`Code for ${row.title}`} value={row.code} onChange={(event) => patchRow(row.id, { code: event.target.value })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Input aria-label={`Title for ${row.code}`} value={row.title} onChange={(event) => patchRow(row.id, { title: event.target.value })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Select ariaLabel={`Department for ${row.title}`} options={allDepartmentOptions} value={row.department_id ?? ""} onChange={(value) => patchRow(row.id, { department_id: value || null })} allowEmpty placeholder="No department" disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Input aria-label={`Description for ${row.title}`} value={row.description ?? ""} onChange={(event) => patchRow(row.id, { description: event.target.value })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Input aria-label={`Sort order for ${row.title}`} type="number" value={row.sort_order} onChange={(event) => patchRow(row.id, { sort_order: Number(event.target.value) || 0 })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Checkbox ariaLabel={`${row.title} active`} checked={row.is_active} onChange={(checked) => patchRow(row.id, { is_active: checked })} disabled={savingId === row.id} /></TableCell>
                  <TableCell variant="admin"><Button size="sm" onClick={() => void savePosition(row)} disabled={savingId !== null}>{savingId === row.id ? "Saving…" : "Save"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Inactive positions remain available on historical employee records.</p>
      </ComponentCard>
    </div>
  );
}
