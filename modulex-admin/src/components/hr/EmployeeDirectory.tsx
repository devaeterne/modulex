"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
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

type EmployeeFinancePayment = {
  transaction_id: string;
  transaction_kind: string;
  transaction_at: string;
  posted_at: string | null;
  amount: number;
  currency_code: string;
  reference_no: string | null;
  source_account_name: string | null;
  payroll_item_id: string | null;
  period_code: string | null;
  payment_status: string;
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

function paymentMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function employeeStatusColor(status: EmploymentStatus) {
  if (status === "active") return "success" as const;
  if (status === "terminated") return "error" as const;
  if (status === "leave") return "warning" as const;
  return "primary" as const;
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
  const [paymentEmployee, setPaymentEmployee] = useState<HrEmployee | null>(null);
  const [payments, setPayments] = useState<EmployeeFinancePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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

  const statusOptions = Object.entries(EMPLOYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  const employmentTypeOptions = Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const departmentOptions = departments.filter((department) => department.is_active).map((department) => ({ value: department.id, label: department.name }));
  const positionOptions = positions
    .filter((position) => position.is_active && (!form.department_id || !position.department_id || position.department_id === form.department_id))
    .map((position) => ({ value: position.id, label: position.title }));
  const managerOptions = employees
    .filter((employee) => employee.id !== editing?.id && employee.employment_status !== "terminated")
    .map((employee) => ({ value: employee.id, label: `${employee.first_name} ${employee.last_name} (${employee.employee_number})` }));

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

  async function openPayments(employee: HrEmployee) {
    setPaymentEmployee(employee);
    setPayments([]);
    setPaymentError(null);
    setPaymentsLoading(true);
    const { data, error: paymentsError } = await supabase.rpc("get_hr_employee_finance_payments", { p_employee_id: employee.id });
    if (paymentsError) setPaymentError(paymentsError.message);
    else setPayments((data ?? []) as EmployeeFinancePayment[]);
    setPaymentsLoading(false);
  }

  function closePayments() {
    setPaymentEmployee(null);
    setPayments([]);
    setPaymentError(null);
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
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Personnel error" message={error} /> : null}
      {success ? <Alert variant="success" title="Personnel updated" message={success} /> : null}

      <ComponentCard
        title="Employees"
        desc="Employee master records and employment status. Finance payment history is linked read-only; payment entry remains in Finance."
        headerAction={<Button onClick={openCreate}>Add Employee</Button>}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Search"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, employee no, email or phone" /></Field>
          <Field label="Status"><Select options={[{ value: "all", label: "All statuses" }, ...statusOptions]} value={statusFilter} onChange={(value) => setStatusFilter(value as "all" | EmploymentStatus)} /></Field>
          <Field label="Department"><Select options={[{ value: "all", label: "All departments" }, ...departmentOptions]} value={departmentFilter} onChange={setDepartmentFilter} /></Field>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Employee</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Employment</TableCell><TableCell isHeader variant="admin">Department</TableCell><TableCell isHeader variant="admin">Position</TableCell><TableCell isHeader variant="admin">Manager</TableCell><TableCell isHeader variant="admin">Hire Date</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={8}>Loading employees...</TableStateRow> : filtered.length === 0 ? <TableStateRow colSpan={8}>No employees found.</TableStateRow> : filtered.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell variant="admin"><div className="font-medium">{employee.preferred_name || `${employee.first_name} ${employee.last_name}`}</div><div className="text-xs">{employee.employee_number}{employee.work_email ? ` · ${employee.work_email}` : ""}</div></TableCell>
                  <TableCell variant="admin"><Badge color={employeeStatusColor(employee.employment_status)}>{EMPLOYMENT_STATUS_LABELS[employee.employment_status]}</Badge></TableCell>
                  <TableCell variant="admin">{EMPLOYMENT_TYPE_LABELS[employee.employment_type]}</TableCell>
                  <TableCell variant="admin">{departmentName(employee.department_id)}</TableCell>
                  <TableCell variant="admin">{positionName(employee.position_id)}</TableCell>
                  <TableCell variant="admin">{managerName(employee.manager_id)}</TableCell>
                  <TableCell variant="admin">{employee.hire_date || "—"}</TableCell>
                  <TableCell variant="admin"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void openPayments(employee)}>Payments</Button><Button size="sm" variant="outline" onClick={() => openEdit(employee)}>Edit</Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <Modal isOpen={modalOpen} onClose={closeModal} className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto" ariaLabel={editing ? "Edit employee" : "Add employee"}>
        <div className="space-y-6 p-6">
          <div className="pr-12"><h2 className="text-lg font-semibold">{editing ? `Edit ${editing.employee_number}` : "Add Employee"}</h2><p className="mt-1 text-sm">Employee Master only — payroll and tax-sensitive data are managed separately.</p></div>
          <form onSubmit={save} className="space-y-6">
            <FormSection title="Identity & Contact">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="First Name *"><Input required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></Field>
                <Field label="Last Name *"><Input required value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></Field>
                <Field label="Preferred Name"><Input value={form.preferred_name} onChange={(event) => setForm({ ...form, preferred_name: event.target.value })} /></Field>
                <Field label="Work Email"><Input type="email" value={form.work_email} onChange={(event) => setForm({ ...form, work_email: event.target.value })} /></Field>
                <Field label="Personal Email"><Input type="email" value={form.personal_email} onChange={(event) => setForm({ ...form, personal_email: event.target.value })} /></Field>
                <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
                <Field label="Date of Birth"><Input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></Field>
              </div>
            </FormSection>

            <FormSection title="Employment">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Status"><Select options={statusOptions} value={form.employment_status} onChange={(value) => setForm({ ...form, employment_status: value as EmploymentStatus })} /></Field>
                <Field label="Employment Type"><Select options={employmentTypeOptions} value={form.employment_type} onChange={(value) => setForm({ ...form, employment_type: value as EmploymentType })} /></Field>
                <Field label="Hire Date"><Input type="date" value={form.hire_date} onChange={(event) => setForm({ ...form, hire_date: event.target.value })} /></Field>
                <Field label="Department"><Select options={departmentOptions} value={form.department_id} allowEmpty placeholder="No department" onChange={(value) => setForm({ ...form, department_id: value, position_id: positions.find((position) => position.id === form.position_id && (!value || position.department_id === value)) ? form.position_id : "" })} /></Field>
                <Field label="Position"><Select options={positionOptions} value={form.position_id} allowEmpty placeholder="No position" onChange={(value) => setForm({ ...form, position_id: value })} /></Field>
                <Field label="Manager"><Select options={managerOptions} value={form.manager_id} allowEmpty placeholder="No manager" onChange={(value) => setForm({ ...form, manager_id: value })} /></Field>
                <Field label="Work Location"><Input value={form.work_location} onChange={(event) => setForm({ ...form, work_location: event.target.value })} /></Field>
                <Field label="Termination Date"><Input type="date" value={form.termination_date} onChange={(event) => setForm({ ...form, termination_date: event.target.value })} /></Field>
                <Field label="Termination Reason"><Input value={form.termination_reason} onChange={(event) => setForm({ ...form, termination_reason: event.target.value })} /></Field>
              </div>
            </FormSection>

            <FormSection title="Home Address">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Address Line 1"><Input value={form.address_line1} onChange={(event) => setForm({ ...form, address_line1: event.target.value })} /></Field>
                <Field label="Address Line 2"><Input value={form.address_line2} onChange={(event) => setForm({ ...form, address_line2: event.target.value })} /></Field>
                <Field label="City"><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
                <Field label="State"><Input value={form.state_region} onChange={(event) => setForm({ ...form, state_region: event.target.value })} /></Field>
                <Field label="ZIP Code"><Input value={form.postal_code} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} /></Field>
                <Field label="Country"><Input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></Field>
              </div>
            </FormSection>

            <FormSection title="Internal Notes"><TextArea value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} rows={4} placeholder="Internal HR notes" /></FormSection>
            <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={closeModal}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create Employee"}</Button></div>
          </form>
        </div>
      </Modal>

      <Modal isOpen={Boolean(paymentEmployee)} onClose={closePayments} className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto" ariaLabel="Employee Finance payment history">
        <div className="space-y-6 p-6">
          <div className="pr-12"><h2 className="text-lg font-semibold">Payments · {paymentEmployee ? paymentEmployee.preferred_name || `${paymentEmployee.first_name} ${paymentEmployee.last_name}` : "Employee"}</h2><p className="mt-1 text-sm">Finance payment history — read-only projection of posted Finance employee payments and reversals.</p></div>
          {paymentError ? <Alert variant="error" title="Payment history error" message={paymentError} /> : null}
          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Date</TableCell><TableCell isHeader variant="admin">Reference</TableCell><TableCell isHeader variant="admin">Payroll</TableCell><TableCell isHeader variant="admin">Account</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell></TableRow></TableHeader>
              <TableBody variant="admin">
                {paymentsLoading ? <TableStateRow colSpan={6}>Loading Finance payment history...</TableStateRow> : payments.length === 0 ? <TableStateRow colSpan={6}>No posted Finance payments are linked to this employee.</TableStateRow> : payments.map((payment) => (
                  <TableRow key={`${payment.transaction_id}-${payment.payroll_item_id ?? "employee"}`}>
                    <TableCell variant="admin">{new Date(payment.transaction_at).toLocaleString()}</TableCell>
                    <TableCell variant="admin"><div className="font-medium">{payment.reference_no || payment.transaction_kind.replaceAll("_", " ")}</div><div className="text-xs">{payment.transaction_id}</div></TableCell>
                    <TableCell variant="admin">{payment.period_code || "—"}</TableCell>
                    <TableCell variant="admin">{payment.source_account_name || "—"}</TableCell>
                    <TableCell variant="admin"><Badge color={payment.payment_status === "reversed" ? "error" : "success"}>{payment.payment_status}</Badge></TableCell>
                    <TableCell variant="admin" className="text-right font-semibold">{paymentMoney(payment.amount, payment.currency_code)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="flex justify-end"><Button variant="outline" onClick={closePayments}>Close</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4"><h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>{children}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>;
}
