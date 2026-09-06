"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Alert from "@/components/ui/alert/Alert";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Summary = {
  employees: number;
  active: number;
  onLeave: number;
  departments: number;
  pendingLeave: number;
  openTasks: number;
  expiringDocs: number;
  openPayroll: number;
};

const emptySummary: Summary = {
  employees: 0,
  active: 0,
  onLeave: 0,
  departments: 0,
  pendingLeave: 0,
  openTasks: 0,
  expiringDocs: 0,
  openPayroll: 0,
};

export default function PersonnelOverview() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const soon = new Date();
      soon.setDate(soon.getDate() + 60);
      const today = new Date().toISOString().slice(0, 10);
      const soonDate = soon.toISOString().slice(0, 10);
      const [employees, departments, leave, tasks, docs, payroll] =
        await Promise.all([
          supabase.from("hr_employees").select("employment_status"),
          supabase
            .from("hr_departments")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .from("hr_leave_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("hr_employee_tasks")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "in_progress"]),
          supabase
            .from("hr_documents")
            .select("id", { count: "exact", head: true })
            .eq("status", "active")
            .gte("expires_on", today)
            .lte("expires_on", soonDate),
          supabase
            .from("hr_payroll_periods")
            .select("id", { count: "exact", head: true })
            .neq("status", "closed"),
        ]);

      const first =
        employees.error ??
        departments.error ??
        leave.error ??
        tasks.error ??
        docs.error ??
        payroll.error;
      if (first) {
        console.error("Failed to load Personnel overview", first);
        setError("Personnel summary could not be loaded. Refresh the page to try again.");
        setLoading(false);
        return;
      }

      const rows = employees.data ?? [];
      setSummary({
        employees: rows.length,
        active: rows.filter((row) => row.employment_status === "active").length,
        onLeave: rows.filter((row) => row.employment_status === "on_leave").length,
        departments: departments.count ?? 0,
        pendingLeave: leave.count ?? 0,
        openTasks: tasks.count ?? 0,
        expiringDocs: docs.count ?? 0,
        openPayroll: payroll.count ?? 0,
      });
      setLoading(false);
    }

    void load();
  }, []);

  const cards = [
    ["Employees", summary.employees, "All employee records", "neutral"],
    ["Active", summary.active, "Currently active", "success"],
    ["On Leave", summary.onLeave, "Employment status", "warning"],
    ["Pending Leave", summary.pendingLeave, "Needs HR decision", "warning"],
    ["Open Tasks", summary.openTasks, "Onboarding / offboarding", "brand"],
    ["Expiring Documents", summary.expiringDocs, "Within 60 days", "warning"],
    ["Open Payroll", summary.openPayroll, "Periods not closed", "brand"],
    ["Departments", summary.departments, "Active departments", "neutral"],
  ] as const;

  const modules = [
    ["/personnel/employees", "Employees", "Employee master data, status, department, position, manager and employment history."],
    ["/personnel/attendance", "Attendance", "Daily hours, overtime, lateness, absence and no-show tracking."],
    ["/personnel/leave", "Leave & PTO", "Leave policies, balances, requests and approvals."],
    ["/personnel/compensation", "Compensation", "Salary/hourly rates, bonus, commission, advances and deductions."],
    ["/personnel/payroll", "Payroll", "Payroll periods, runs, taxes, net pay and employer cost."],
    ["/personnel/benefits", "Benefits", "Benefit plans and employee enrollments."],
    ["/personnel/documents", "Documents", "Private employee documents, licenses and expiration tracking."],
    ["/personnel/compliance", "Compliance & Emergency", "W-4/I-9 profile, work authorization and emergency contacts."],
    ["/personnel/lifecycle", "Onboarding & Offboarding", "Standard lifecycle checklists and task tracking."],
    ["/personnel/performance", "Performance", "Probation, periodic and annual performance reviews."],
    ["/personnel/reports", "HR Reports", "Headcount, attendance, leave, compliance and payroll reporting."],
    ["/personnel/departments", "Organization", "Departments and job positions used across HR."],
  ] as const;

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Personnel & HR"
        desc="Central employee lifecycle management from hire through attendance, leave, compensation, payroll, benefits, compliance, performance and offboarding."
      >
        <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>
          Use the module cards below to open the appropriate HR workspace.
        </p>
      </ComponentCard>

      {error ? (
        <Alert variant="error" title="Personnel summary unavailable" message={error} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={loading}>
        {cards.map(([label, value, helper, tone]) => (
          <StatTile
            key={label}
            label={label}
            value={loading ? "—" : value}
            helper={helper}
            tone={tone}
          />
        ))}
      </div>

      <ComponentCard title="Personnel modules" desc="Open a focused HR workspace.">
        <nav aria-label="Personnel modules" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(([href, title, description]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/50"
            >
              <h2 className={`${ADMIN_TEXT_STYLES.strong} font-semibold`}>{title}</h2>
              <p className={`${ADMIN_TEXT_STYLES.muted} mt-2 text-sm leading-6`}>
                {description}
              </p>
              <span className="mt-4 inline-flex text-sm font-medium text-brand-500">
                Open →
              </span>
            </Link>
          ))}
        </nav>
      </ComponentCard>
    </div>
  );
}
