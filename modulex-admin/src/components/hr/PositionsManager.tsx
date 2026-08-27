"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HrDepartment, HrPosition } from "@/lib/hr/types";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonClass = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50";

export default function PositionsManager() {
  const [rows, setRows] = useState<HrPosition[]>([]);
  const [departments, setDepartments] = useState<HrDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    setLoading(true);
    const [positionsResult, departmentsResult] = await Promise.all([
      supabase.from("hr_positions").select("*").order("sort_order").order("title"),
      supabase.from("hr_departments").select("*").order("sort_order").order("name"),
    ]);
    const firstError = positionsResult.error ?? departmentsResult.error;
    if (firstError) setError(firstError.message);
    else {
      setRows((positionsResult.data ?? []) as HrPosition[]);
      setDepartments((departmentsResult.data ?? []) as HrDepartment[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function departmentName(id: string | null) {
    return departments.find((item) => item.id === id)?.name ?? "—";
  }

  async function addPosition() {
    if (!code.trim() || !title.trim()) return setError("Position code and title are required.");
    setSaving(true); setError(null); setSuccess(null);
    const { error } = await supabase.from("hr_positions").insert({
      code: code.trim().toUpperCase(), title: title.trim(), department_id: departmentId || null,
      description: description.trim() || null,
      sort_order: rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10,
    });
    if (error) setError(error.message);
    else { setCode(""); setTitle(""); setDepartmentId(""); setDescription(""); setSuccess("Position added."); await load(); }
    setSaving(false);
  }

  async function savePosition(row: HrPosition) {
    setSaving(true); setError(null); setSuccess(null);
    const { error } = await supabase.from("hr_positions").update({
      code: row.code.trim().toUpperCase(), title: row.title.trim(), department_id: row.department_id,
      description: row.description?.trim() || null, is_active: row.is_active, sort_order: row.sort_order,
    }).eq("id", row.id);
    if (error) setError(error.message); else { setSuccess("Position saved."); await load(); }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Positions</h1><p className="mt-1 text-sm text-gray-500">Job titles used by the personnel and payroll modules.</p></div>
      {error && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
      {success && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Add Position</h2>
        <div className="mt-4 grid gap-3 xl:grid-cols-[160px_1fr_1fr_1.5fr_auto]">
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Position title" />
          <select className={inputClass} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">No department</option>{departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          <button className={buttonClass} disabled={saving} onClick={addPosition}>Add</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Code","Title","Department","Description","Active","Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">Loading...</td></tr> : rows.map((row) => <tr key={row.id}>
          <td className="px-4 py-3"><input className={inputClass} value={row.code} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, code: e.target.value } : item))} /></td>
          <td className="px-4 py-3"><input className={inputClass} value={row.title} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, title: e.target.value } : item))} /></td>
          <td className="px-4 py-3"><select className={inputClass} value={row.department_id ?? ""} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, department_id: e.target.value || null } : item))}><option value="">No department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><p className="mt-1 text-xs text-gray-400">{departmentName(row.department_id)}</p></td>
          <td className="px-4 py-3"><input className={inputClass} value={row.description ?? ""} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, description: e.target.value } : item))} /></td>
          <td className="px-4 py-3"><input type="checkbox" checked={row.is_active} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, is_active: e.target.checked } : item))} /></td>
          <td className="px-4 py-3"><button className={buttonClass} disabled={saving} onClick={() => savePosition(row)}>Save</button></td>
        </tr>)}</tbody></table></div></div>
    </div>
  );
}
