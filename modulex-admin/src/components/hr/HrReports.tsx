"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Alert from "@/components/ui/alert/Alert";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; department_id: string | null; employment_status: string; hire_date: string | null; termination_date: string | null };
type Department = { id: string; name: string };
type Attendance = { employee_id: string; work_date: string; regular_hours: number; overtime_hours: number; status: string };
type LeaveBalance = { entitled_hours: number; carried_hours: number; adjusted_hours: number; used_hours: number; pending_hours: number };
type Document = { expires_on: string | null; status: string };
type Task = { status: string; due_date: string | null };
type PayrollItem = { gross_pay: number; net_pay: number; total_employer_cost: number };

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function HrReports() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payroll, setPayroll] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const yearStart = `${now.getFullYear()}-01-01`;

    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        const [e, d, a, b, doc, t, p] = await Promise.all([
          supabase.from("hr_employees").select("id,department_id,employment_status,hire_date,termination_date"),
          supabase.from("hr_departments").select("id,name"),
          supabase.from("hr_attendance_records").select("employee_id,work_date,regular_hours,overtime_hours,status").gte("work_date", monthStart),
          supabase.from("hr_leave_balances").select("entitled_hours,carried_hours,adjusted_hours,used_hours,pending_hours").eq("balance_year", now.getFullYear()),
          supabase.from("hr_documents").select("expires_on,status"),
          supabase.from("hr_employee_tasks").select("status,due_date"),
          supabase.from("hr_payroll_items").select("gross_pay,net_pay,total_employer_cost").gte("created_at", yearStart),
        ]);
        for (const result of [e, d, a, b, doc, t, p]) {
          if (result.error) throw result.error;
        }
        setEmployees((e.data ?? []) as Employee[]);
        setDepartments((d.data ?? []) as Department[]);
        setAttendance((a.data ?? []) as Attendance[]);
        setBalances((b.data ?? []) as LeaveBalance[]);
        setDocuments((doc.data ?? []) as Document[]);
        setTasks((t.data ?? []) as Task[]);
        setPayroll((p.data ?? []) as PayrollItem[]);
      } catch (error) {
        console.error("Failed to load HR reports", error);
        setMessage("HR reports could not be loaded. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const now = new Date();
  const year = now.getFullYear();
  const active = employees.filter((employee) => employee.employment_status === "active" || employee.employment_status === "on_leave").length;
  const hires = employees.filter((employee) => employee.hire_date && new Date(employee.hire_date).getFullYear() === year).length;
  const terms = employees.filter((employee) => employee.termination_date && new Date(employee.termination_date).getFullYear() === year).length;
  const regHours = attendance.reduce((sum, row) => sum + Number(row.regular_hours || 0), 0);
  const otHours = attendance.reduce((sum, row) => sum + Number(row.overtime_hours || 0), 0);
  const absent = attendance.filter((row) => row.status === "absent" || row.status === "no_show").length;
  const late = attendance.filter((row) => row.status === "late").length;
  const leaveAvailable = balances.reduce(
    (sum, row) => sum + Number(row.entitled_hours) + Number(row.carried_hours) + Number(row.adjusted_hours) - Number(row.used_hours) - Number(row.pending_hours),
    0,
  );
  const soon = new Date();
  soon.setDate(now.getDate() + 60);
  const expiring = documents.filter((row) => row.expires_on && new Date(row.expires_on) >= now && new Date(row.expires_on) <= soon).length;
  const openTasks = tasks.filter((row) => row.status === "pending" || row.status === "in_progress").length;
  const payrollTotals = payroll.reduce(
    (acc, row) => ({
      gross: acc.gross + Number(row.gross_pay || 0),
      net: acc.net + Number(row.net_pay || 0),
      cost: acc.cost + Number(row.total_employer_cost || 0),
    }),
    { gross: 0, net: 0, cost: 0 },
  );
  const departmentCounts = useMemo(
    () =>
      departments
        .map((department) => ({
          name: department.name,
          count: employees.filter(
            (employee) =>
              employee.department_id === department.id &&
              (employee.employment_status === "active" || employee.employment_status === "on_leave"),
          ).length,
        }))
        .sort((a, b) => b.count - a.count),
    [departments, employees],
  );

  const rows = [
    ["Active headcount", active],
    ["Hires YTD", hires],
    ["Terminations YTD", terms],
    ["Regular hours this month", number.format(regHours)],
    ["Overtime this month", number.format(otHours)],
    ["Absent / no-show this month", absent],
    ["Late records this month", late],
    ["Available leave hours", number.format(leaveAvailable)],
    ["Documents expiring ≤60 days", expiring],
    ["Open lifecycle tasks", openTasks],
    ["Payroll gross YTD", money.format(payrollTotals.gross)],
    ["Payroll employer cost YTD", money.format(payrollTotals.cost)],
  ] as const;

  return (
    <div className="space-y-6" aria-busy={loading}>
      <ComponentCard
        title="Workforce indicators"
        desc="Workforce, attendance, leave, compliance and payroll indicators from recorded HR data."
      >
        {message ? <Alert variant="error" title="HR reports unavailable" message={message} /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map(([label, value]) => (
            <StatTile key={label} label={label} value={loading ? "—" : value} />
          ))}
        </div>
      </ComponentCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard title="Headcount by Department" desc="Active and on-leave employees grouped by department.">
          <div className="space-y-3">
            {loading ? (
              <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>Loading department headcount…</p>
            ) : departmentCounts.length === 0 ? (
              <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>No departments configured.</p>
            ) : (
              departmentCounts.map((row) => (
                <div key={row.name} className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm dark:border-gray-800">
                  <span className={ADMIN_TEXT_STYLES.body}>{row.name}</span>
                  <strong className={ADMIN_TEXT_STYLES.strong}>{row.count}</strong>
                </div>
              ))
            )}
          </div>
        </ComponentCard>

        <ComponentCard title="Payroll YTD" desc="Totals reflect recorded payroll items.">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className={ADMIN_TEXT_STYLES.body}>Gross payroll</span><strong className={ADMIN_TEXT_STYLES.strong}>{loading ? "—" : money.format(payrollTotals.gross)}</strong></div>
            <div className="flex justify-between"><span className={ADMIN_TEXT_STYLES.body}>Net payroll</span><strong className={ADMIN_TEXT_STYLES.strong}>{loading ? "—" : money.format(payrollTotals.net)}</strong></div>
            <div className="flex justify-between border-t border-gray-100 pt-3 dark:border-gray-800"><span className={ADMIN_TEXT_STYLES.body}>Total employer cost</span><strong className={ADMIN_TEXT_STYLES.strong}>{loading ? "—" : money.format(payrollTotals.cost)}</strong></div>
          </div>
          <p className={`${ADMIN_TEXT_STYLES.muted} mt-4 text-xs`}>
            Tax accuracy depends on verified tax inputs until the automated US tax engine is enabled.
          </p>
        </ComponentCard>
      </div>
    </div>
  );
}
