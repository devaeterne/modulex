"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Summary = {
  employees: number;
  active: number;
  onLeave: number;
  departments: number;
  positions: number;
};

export default function PersonnelOverview() {
  const [summary, setSummary] = useState<Summary>({ employees: 0, active: 0, onLeave: 0, departments: 0, positions: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const [employees, departments, positions] = await Promise.all([
        supabase.from("hr_employees").select("employment_status"),
        supabase.from("hr_departments").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("hr_positions").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);

      const firstError = employees.error ?? departments.error ?? positions.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const rows = employees.data ?? [];
      setSummary({
        employees: rows.length,
        active: rows.filter((row) => row.employment_status === "active").length,
        onLeave: rows.filter((row) => row.employment_status === "on_leave").length,
        departments: departments.count ?? 0,
        positions: positions.count ?? 0,
      });
      setLoading(false);
    }

    void load();
  }, []);

  const cards = [
    { label: "Employees", value: summary.employees, note: "All employee records" },
    { label: "Active", value: summary.active, note: "Currently active" },
    { label: "On Leave", value: summary.onLeave, note: "Temporary leave status" },
    { label: "Departments", value: summary.departments, note: "Active departments" },
    { label: "Positions", value: summary.positions, note: "Active job positions" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Personnel</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Employee master data, organizational structure and employment status. Payroll, compensation, attendance and tax data are intentionally kept in separate modules.
        </p>
      </div>

      {error && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">{loading ? "—" : card.value}</p>
            <p className="mt-1 text-xs text-gray-400">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { href: "/personnel/employees", title: "Employees", description: "Create and maintain employee records, employment status, department, position and manager." },
          { href: "/personnel/departments", title: "Departments", description: "Maintain the organization structure used throughout HR and reporting." },
          { href: "/personnel/positions", title: "Positions", description: "Maintain job titles and connect them to departments." },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500/50">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.description}</p>
            <span className="mt-4 inline-flex text-sm font-medium text-brand-500">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
