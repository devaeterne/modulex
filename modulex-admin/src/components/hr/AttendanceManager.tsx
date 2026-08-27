"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

type Employee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
};

type AttendanceRecord = {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  regular_hours: number;
  overtime_hours: number;
  status: string;
  notes: string | null;
};

const statuses = ["present", "late", "absent", "no_show", "partial", "leave", "holiday", "remote", "off"] as const;
const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (value: Date) => value.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function displayName(employee: Employee) {
  return `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`;
}

export default function AttendanceManager() {
  const initial = monthBounds();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<(typeof statuses)[number]>("present");
  const [regularHours, setRegularHours] = useState("8");
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [employeeResult, attendanceResult] = await Promise.all([
      supabase.from("hr_employees").select("id,employee_number,first_name,last_name").in("employment_status", ["active", "on_leave"]).order("last_name"),
      supabase.from("hr_attendance_records").select("id,employee_id,work_date,clock_in,clock_out,break_minutes,regular_hours,overtime_hours,status,notes").gte("work_date", startDate).lte("work_date", endDate).order("work_date", { ascending: false }),
    ]);
    if (employeeResult.error) throw employeeResult.error;
    if (attendanceResult.error) throw attendanceResult.error;
    const nextEmployees = (employeeResult.data ?? []) as Employee[];
    setEmployees(nextEmployees);
    setRecords((attendanceResult.data ?? []) as AttendanceRecord[]);
    if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Attendance could not be loaded."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || !workDate) return;
    setBusy(true);
    setMessage(null);
    const payload = {
      employee_id: employeeId,
      work_date: workDate,
      status,
      regular_hours: Number(regularHours || 0),
      overtime_hours: Number(overtimeHours || 0),
      break_minutes: Number(breakMinutes || 0),
      clock_in: clockIn ? new Date(clockIn).toISOString() : null,
      clock_out: clockOut ? new Date(clockOut).toISOString() : null,
      notes: notes.trim() || null,
    };
    const { error } = await supabase.from("hr_attendance_records").upsert(payload, { onConflict: "employee_id,work_date" });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Attendance record saved.");
    setNotes("");
    setClockIn("");
    setClockOut("");
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this attendance record?")) return;
    const { error } = await supabase.from("hr_attendance_records").delete().eq("id", id);
    if (error) setMessage(error.message);
    else await load();
  }

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const metrics = useMemo(() => {
    const absent = records.filter((row) => row.status === "absent" || row.status === "no_show").length;
    const late = records.filter((row) => row.status === "late").length;
    const overtime = records.reduce((sum, row) => sum + Number(row.overtime_hours || 0), 0);
    const hours = records.reduce((sum, row) => sum + Number(row.regular_hours || 0), 0);
    return { absent, late, overtime, hours };
  }, [records]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Attendance & Absence</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track daily attendance, absences, lateness, regular hours and overtime.</p>
      </div>

      {message && <div className={cardClass + " text-sm text-gray-700 dark:text-gray-300"}>{message}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Regular hours', metrics.hours.toFixed(2)], ['Overtime hours', metrics.overtime.toFixed(2)], ['Late records', metrics.late], ['Absent / no-show', metrics.absent]].map(([label, value]) => (
          <div key={String(label)} className={cardClass}>
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={save} className={cardClass + " space-y-4"}>
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Add / Update Day</h2>
            <p className="mt-1 text-xs text-gray-500">Saving the same employee and date updates the existing day.</p>
          </div>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Employee<select className={inputClass + " mt-1"} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{displayName(employee)}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">Work date<input className={inputClass + " mt-1"} type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required /></label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">Status<select className={inputClass + " mt-1"} value={status} onChange={(e) => setStatus(e.target.value as (typeof statuses)[number])}>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">Regular<input className={inputClass + " mt-1"} type="number" min="0" step="0.25" value={regularHours} onChange={(e) => setRegularHours(e.target.value)} /></label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">Overtime<input className={inputClass + " mt-1"} type="number" min="0" step="0.25" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} /></label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">Break min<input className={inputClass + " mt-1"} type="number" min="0" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">Clock in<input className={inputClass + " mt-1"} type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">Clock out<input className={inputClass + " mt-1"} type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></label>
          </div>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Notes<textarea className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button disabled={busy} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Saving..." : "Save Attendance"}</button>
        </form>

        <div className={cardClass + " overflow-hidden p-0"}>
          <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
            <label className="text-sm text-gray-600 dark:text-gray-300">From<input className={inputClass + " mt-1"} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label className="text-sm text-gray-600 dark:text-gray-300">To<input className={inputClass + " mt-1"} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02]"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Regular</th><th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {records.map((row) => {
                  const employee = employeeMap.get(row.employee_id);
                  return <tr key={row.id}><td className="px-4 py-3">{row.work_date}</td><td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{employee ? displayName(employee) : row.employee_id}</td><td className="px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td><td className="px-4 py-3 text-right">{Number(row.regular_hours).toFixed(2)}</td><td className="px-4 py-3 text-right">{Number(row.overtime_hours).toFixed(2)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void remove(row.id)} className="text-xs font-medium text-error-600 hover:underline">Delete</button></td></tr>;
                })}
                {records.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No attendance records in this range.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
