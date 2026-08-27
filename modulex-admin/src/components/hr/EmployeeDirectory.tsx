"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  type EmploymentStatus,
  type EmploymentType,
  type HrDepartment,
  type HrEmployee,
  type HrPosition,
} from "@/lib/hr/types";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50";
const secondaryButton = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

type EmployeeForm = {
  first_name: string;
  last_name: string;
  preferred_name: string;
  work_email: string;
  personal_email: string;
  phone: string;
  date_of_birth: string;
  department_id: string;
  position_id: string;
  manager_id: string;
  employment_status: EmploymentStatus;
  employment_type: EmploymentType;
  hire_date: string;
  termination_date: string;
  termination_reason: string;
  work_location: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_region: string;
  postal_code: string;
  country: string;
  notes: string;
};

const emptyForm: EmployeeForm = {
  first_name: "",
  last_name: "",
  preferred_name: "",
  work_email: "",
  personal_email: "",
  phone: "",
  date_of_birth: "",
  department_id: "",
  position_id: "",
  manager_id: "",
  employment_status: "active",
  employment_type: "full_time",
  hire_date: "",
  termination_date: "",
  termination_reason: "",
  work_location: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state_region: "",
  postal_code: "",
  country: "United States",
  notes: "",
};

function toForm(employee: HrEmployee): EmployeeForm {
  return {
    first_name: employee.first_name,
    last_name: employee.last_name,
    preferred_name: employee.preferred_name ?? "",
    work_email: employee.work_email ?? "",
    personal_email: employee.personal_email ?? "",
    phone: employee.phone ?? "",
    date_of_birth: employee.date_of_birth ?? "",
    department_id: employee.department_id ?? "",
    position_id: employee.position_id ?? "",
    manager_id: employee.manager_id ?? "",
    employment_status: employee.employment_status,
    employment_type: employee.employment_type,
    hire_date: employee.hire_date ?? "",
    termination_date: employee.termination_date ?? "",
    termination_reason: employee.termination_reason ?? "",
    work_location: employee.work_location ?? "",
    address_line1: employee.address_line1 ?? "",
    address_line2: employee.address_line2 ?? "",
    city: employee.city ?? "",
    state_region: employee.state_region ?? "",
    postal_code: employee.postal_code ?? "",
    country: employee.country || "United States",
    notes: employee.notes ?? "",
  };
}

function optional(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

export default function EmployeeDirectory() {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [departments, setDepartments] = useState<HrDepartment[]>([]);
  const [positions, setPositions] = useState<HrPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmploymentStatus>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [editing, setEditing] = useState<HrEmployee | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);

  async function load() {
    setLoading(true);
    setError(null);
    const [employeeResult, departmentResult, positionResult] = await Promise.all([
      supabase.from("hr_employees").select("*").order("employee_number"),
      supabase.from("hr_departments").select("*").order("sort_order").order("name"),
      supabase.from("hr_positions").select("*").order("sort_order").order("title"),
    ]);
    const firstError = employeeResult.error ?? departmentResult.error ?? positionResult.error;
    if (firstError) setError(firstError.message);
    else {
      setEmployees((employeeResult.data ?? []) as HrEmployee[]);
      setDepartments((departmentResult.data ?? []) as HrDepartment[]);
      setPositions((positionResult.data ?? []) as HrPosition[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch = !query || [employee.employee_number, employee.first_name, employee.last_name, employee.preferred_name, employee.work_email, employee.phone]
        .some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || employee.employment_status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || employee.department_id === departmentFilter;
      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [employees, search, statusFilter, departmentFilter]);

  const departmentName = (id: string | null) => departments.find((item) => item.id === id)?.name ?? "—";
  const positionName = (id: string | null) => positions.find((item) => item.id === id)?.title ?? "—";
  const managerName = (id: string | null) => {
    const employee = employees.find((item) => item.id === id);
    return employee ? `${employee.first_name} ${employee.last_name}` : "—";
  };

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setSuccess(null);
    setModalOpen(true);
  }

  function openEdit(employee: HrEmployee) {
    setEditing(employee);
    setForm(toForm(employee));
    setError(null);
    setSuccess(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (form.manager_id && editing?.id === form.manager_id) {
      setError("An employee cannot be their own manager.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      preferred_name: optional(form.preferred_name),
      work_email: optional(form.work_email)?.toLowerCase() ?? null,
      personal_email: optional(form.personal_email)?.toLowerCase() ?? null,
      phone: optional(form.phone),
      date_of_birth: form.date_of_birth || null,
      department_id: form.department_id || null,
      position_id: form.position_id || null,
      manager_id: form.manager_id || null,
      employment_status: form.employment_status,
      employment_type: form.employment_type,
      hire_date: form.hire_date || null,
      termination_date: form.termination_date || null,
      termination_reason: optional(form.termination_reason),
      work_location: optional(form.work_location),
      address_line1: optional(form.address_line1),
      address_line2: optional(form.address_line2),
      city: optional(form.city),
      state_region: optional(form.state_region),
      postal_code: optional(form.postal_code),
      country: form.country.trim() || "United States",
      notes: optional(form.notes),
    };

    const result = editing
      ? await supabase.from("hr_employees").update(payload).eq("id", editing.id)
      : await supabase.from("hr_employees").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    closeModal();
    setSuccess(editing ? "Employee updated." : "Employee created.");
    await load();
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Employees</h1><p className="mt-1 text-sm text-gray-500">Employee master records and employment status.</p></div>
          <button className={primaryButton} onClick={openCreate}>+ Add Employee</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee no, email or phone" />
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | EmploymentStatus)}><option value="all">All statuses</option>{Object.entries(EMPLOYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className={inputClass} value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}><option value="all">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
        </div>
      </div>

      {error && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
      {success && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto"><table className="min-w-[1050px] w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Employee","Status","Employment","Department","Position","Manager","Hire Date","Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {loading ? <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">Loading employees...</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">No employees found.</td></tr> : filtered.map((employee) => <tr key={employee.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
            <td className="px-4 py-4"><p className="text-sm font-medium text-gray-800 dark:text-white/90">{employee.preferred_name || `${employee.first_name} ${employee.last_name}`}</p><p className="mt-0.5 text-xs text-gray-500">{employee.employee_number}{employee.work_email ? ` · ${employee.work_email}` : ""}</p></td>
            <td className="px-4 py-4"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{EMPLOYMENT_STATUS_LABELS[employee.employment_status]}</span></td>
            <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{EMPLOYMENT_TYPE_LABELS[employee.employment_type]}</td>
            <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{departmentName(employee.department_id)}</td>
            <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{positionName(employee.position_id)}</td>
            <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{managerName(employee.manager_id)}</td>
            <td className="px-4 py-4 text-sm text-gray-500">{employee.hire_date || "—"}</td>
            <td className="px-4 py-4"><button className={secondaryButton} onClick={() => openEdit(employee)}>Edit</button></td>
          </tr>)}</tbody></table></div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[calc(100vh-32px)] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-900">
              <div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{editing ? `Edit ${editing.employee_number}` : "Add Employee"}</h2><p className="mt-1 text-sm text-gray-500">Employee Master only — payroll and tax-sensitive data are managed separately.</p></div>
              <button className="text-gray-400 hover:text-gray-700" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={save} className="space-y-6 p-6">
              <Section title="Identity & Contact"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="First Name *"><input required className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
                <Field label="Last Name *"><input required className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
                <Field label="Preferred Name"><input className={inputClass} value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} /></Field>
                <Field label="Work Email"><input type="email" className={inputClass} value={form.work_email} onChange={(e) => setForm({ ...form, work_email: e.target.value })} /></Field>
                <Field label="Personal Email"><input type="email" className={inputClass} value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} /></Field>
                <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="Date of Birth"><input type="date" className={inputClass} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
              </div></Section>

              <Section title="Employment"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Status"><select className={inputClass} value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value as EmploymentStatus })}>{Object.entries(EMPLOYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Employment Type"><select className={inputClass} value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value as EmploymentType })}>{Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Hire Date"><input type="date" className={inputClass} value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
                <Field label="Department"><select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value, position_id: positions.find((p) => p.id === form.position_id && (!e.target.value || p.department_id === e.target.value)) ? form.position_id : "" })}><option value="">No department</option>{departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                <Field label="Position"><select className={inputClass} value={form.position_id} onChange={(e) => setForm({ ...form, position_id: e.target.value })}><option value="">No position</option>{positions.filter((p) => p.is_active && (!form.department_id || !p.department_id || p.department_id === form.department_id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
                <Field label="Manager"><select className={inputClass} value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}><option value="">No manager</option>{employees.filter((item) => item.id !== editing?.id && item.employment_status !== "terminated").map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} ({item.employee_number})</option>)}</select></Field>
                <Field label="Work Location"><input className={inputClass} value={form.work_location} onChange={(e) => setForm({ ...form, work_location: e.target.value })} /></Field>
                <Field label="Termination Date"><input type="date" className={inputClass} value={form.termination_date} onChange={(e) => setForm({ ...form, termination_date: e.target.value })} /></Field>
                <Field label="Termination Reason"><input className={inputClass} value={form.termination_reason} onChange={(e) => setForm({ ...form, termination_reason: e.target.value })} /></Field>
              </div></Section>

              <Section title="Home Address"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Address Line 1"><input className={inputClass} value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></Field>
                <Field label="Address Line 2"><input className={inputClass} value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} /></Field>
                <Field label="City"><input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
                <Field label="State"><input className={inputClass} value={form.state_region} onChange={(e) => setForm({ ...form, state_region: e.target.value })} /></Field>
                <Field label="ZIP Code"><input className={inputClass} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></Field>
                <Field label="Country"><input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
              </div></Section>

              <Section title="Internal Notes"><textarea className={textareaClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal HR notes" /></Section>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-5 dark:border-gray-800"><button type="button" className={secondaryButton} onClick={closeModal}>Cancel</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? "Saving..." : editing ? "Save Changes" : "Create Employee"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>;
}
