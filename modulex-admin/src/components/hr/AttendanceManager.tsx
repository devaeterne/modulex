"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Badge from "@/components/ui/badge/Badge";
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
import {
  ADMIN_FIELD_BASE,
  ADMIN_FIELD_STATES,
  ADMIN_SURFACE_CARD,
  ADMIN_TEXT_STYLES,
  type AdminStatusColor,
} from "@/components/ui/theme/adminTheme";
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

type Feedback = {
  tone: "success" | "error";
  text: string;
};

const statuses = ["present", "late", "absent", "no_show", "partial", "leave", "holiday", "remote", "off"] as const;
const inputClass = `${ADMIN_FIELD_BASE} ${ADMIN_FIELD_STATES.default}`;
const textareaClass = `${inputClass} h-auto min-h-24 py-3`;
const cardClass = `${ADMIN_SURFACE_CARD} p-5`;
const labelClass = `block text-sm font-medium ${ADMIN_TEXT_STYLES.body}`;

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

function displayName(employee: Employee) {
  return `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`;
}

function formatWorkDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function getStatusPresentation(value: string): { label: string; color: AdminStatusColor } {
  switch (value) {
    case "present":
      return { label: "Present", color: "success" };
    case "late":
      return { label: "Late", color: "warning" };
    case "absent":
      return { label: "Absent", color: "error" };
    case "no_show":
      return { label: "No-show", color: "error" };
    case "partial":
      return { label: "Partial", color: "info" };
    case "leave":
      return { label: "Leave", color: "primary" };
    case "holiday":
      return { label: "Holiday", color: "info" };
    case "remote":
      return { label: "Remote", color: "primary" };
    case "off":
      return { label: "Off", color: "light" };
    default:
      return {
        label: value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        color: "light",
      };
  }
}

export default function AttendanceManager() {
  const initial = monthBounds();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(formatDateInput(new Date()));
  const [status, setStatus] = useState<(typeof statuses)[number]>("present");
  const [regularHours, setRegularHours] = useState("8");
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [employeeResult, attendanceResult] = await Promise.all([
        supabase
          .from("hr_employees")
          .select("id,employee_number,first_name,last_name")
          .in("employment_status", ["active", "on_leave"])
          .order("last_name"),
        supabase
          .from("hr_attendance_records")
          .select("id,employee_id,work_date,clock_in,clock_out,break_minutes,regular_hours,overtime_hours,status,notes")
          .gte("work_date", startDate)
          .lte("work_date", endDate)
          .order("work_date", { ascending: false }),
      ]);

      if (employeeResult.error) throw employeeResult.error;
      if (attendanceResult.error) throw attendanceResult.error;

      const nextEmployees = (employeeResult.data ?? []) as Employee[];
      setEmployees(nextEmployees);
      setRecords((attendanceResult.data ?? []) as AttendanceRecord[]);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    } catch {
      setLoadError("Attendance records could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || !workDate) return;

    setBusy(true);
    setFeedback(null);

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

    try {
      const { error } = await supabase
        .from("hr_attendance_records")
        .upsert(payload, { onConflict: "employee_id,work_date" });

      if (error) {
        setFeedback({ tone: "error", text: "Attendance could not be saved. Please try again." });
        return;
      }

      setFeedback({ tone: "success", text: "Attendance record saved." });
      setNotes("");
      setClockIn("");
      setClockOut("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    setFeedback(null);

    try {
      const { error } = await supabase.from("hr_attendance_records").delete().eq("id", id);
      if (error) {
        setFeedback({ tone: "error", text: "Attendance record could not be deleted. Please try again." });
        return;
      }

      setDeleteCandidateId(null);
      setFeedback({ tone: "success", text: "Attendance record deleted." });
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  function clearFilters() {
    const bounds = monthBounds();
    setStartDate(bounds.start);
    setEndDate(bounds.end);
    setDeleteCandidateId(null);
  }

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const existingRecord = useMemo(
    () => records.find((row) => row.employee_id === employeeId && row.work_date === workDate),
    [employeeId, records, workDate],
  );

  const metrics = useMemo(() => {
    const absent = records.filter((row) => row.status === "absent" || row.status === "no_show").length;
    const late = records.filter((row) => row.status === "late").length;
    const overtime = records.reduce((sum, row) => sum + Number(row.overtime_hours || 0), 0);
    const hours = records.reduce((sum, row) => sum + Number(row.regular_hours || 0), 0);
    return { absent, late, overtime, hours };
  }, [records]);

  const metricCards = [
    ["Regular hours", metrics.hours.toFixed(2)],
    ["Overtime hours", metrics.overtime.toFixed(2)],
    ["Late records", String(metrics.late)],
    ["Absent / no-show", String(metrics.absent)],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Attendance & Absence</h1>
        <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>
          Track daily attendance, absences, lateness, regular hours and overtime.
        </p>
      </div>

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === "error"
              ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
              : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(([label, value]) => (
          <div key={label} className={cardClass}>
            <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{label}</p>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${ADMIN_TEXT_STYLES.strong}`}>
              {isLoading ? "—" : value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={save} className={`${cardClass} space-y-4`} aria-busy={busy}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Add / Update Day</h2>
              <p className={`mt-1 text-xs leading-5 ${ADMIN_TEXT_STYLES.muted}`}>
                Employee and work date identify the attendance day.
              </p>
            </div>
            {existingRecord ? (
              <Badge color="warning" size="sm">Update existing day</Badge>
            ) : (
              <Badge color="primary" size="sm">New day</Badge>
            )}
          </div>

          <label className={labelClass}>
            Employee
            <select
              className={`${inputClass} mt-1.5`}
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              required
              disabled={busy || employees.length === 0}
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{displayName(employee)}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Work date
              <input
                className={`${inputClass} mt-1.5`}
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label className={labelClass}>
              Status
              <select
                className={`${inputClass} mt-1.5`}
                value={status}
                onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])}
                disabled={busy}
              >
                {statuses.map((item) => (
                  <option key={item} value={item}>{getStatusPresentation(item).label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Regular hours
              <input
                className={`${inputClass} mt-1.5 px-3`}
                type="number"
                min="0"
                step="0.25"
                value={regularHours}
                onChange={(event) => setRegularHours(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={labelClass}>
              Overtime hours
              <input
                className={`${inputClass} mt-1.5 px-3`}
                type="number"
                min="0"
                step="0.25"
                value={overtimeHours}
                onChange={(event) => setOvertimeHours(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={labelClass}>
              Break (min)
              <input
                className={`${inputClass} mt-1.5 px-3`}
                type="number"
                min="0"
                value={breakMinutes}
                onChange={(event) => setBreakMinutes(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <div className="grid gap-3">
            <label className={labelClass}>
              Clock in
              <input
                className={`${inputClass} mt-1.5`}
                type="datetime-local"
                value={clockIn}
                onChange={(event) => setClockIn(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={labelClass}>
              Clock out
              <input
                className={`${inputClass} mt-1.5`}
                type="datetime-local"
                value={clockOut}
                onChange={(event) => setClockOut(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <label className={labelClass}>
            Notes
            <textarea
              className={`${textareaClass} mt-1.5`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              placeholder="Optional note about this attendance day"
            />
          </label>

          <Button
            type="submit"
            className="w-full"
            disabled={busy || employees.length === 0 || !employeeId || !workDate}
          >
            {busy ? "Saving…" : existingRecord ? "Update Attendance" : "Save Attendance"}
          </Button>
        </form>

        <section className={`${ADMIN_SURFACE_CARD} min-w-0`} aria-label="Attendance records">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className={`${labelClass} sm:w-40`}>
                From
                <input
                  className={`${inputClass} mt-1.5`}
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className={`${labelClass} sm:w-40`}>
                To
                <input
                  className={`${inputClass} mt-1.5`}
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className={`whitespace-nowrap text-sm ${ADMIN_TEXT_STYLES.muted}`}>
                {records.length} record{records.length === 1 ? "" : "s"}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>

          <div className="p-4">
            <TableViewport>
              <Table variant="admin" minWidth="medium">
                <TableHeader variant="admin">
                  <TableRow>
                    <TableCell isHeader variant="admin" className="w-36 whitespace-nowrap text-left">Date</TableCell>
                    <TableCell isHeader variant="admin" className="min-w-64 text-left">Employee</TableCell>
                    <TableCell isHeader variant="admin" className="w-36 text-left">Status</TableCell>
                    <TableCell isHeader variant="admin" className="w-28 text-right">Regular</TableCell>
                    <TableCell isHeader variant="admin" className="w-24 text-right">OT</TableCell>
                    <TableCell isHeader variant="admin" className="w-56 text-right">Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody variant="admin" aria-busy={isLoading}>
                  {isLoading ? (
                    <TableStateRow colSpan={6}>Loading attendance records…</TableStateRow>
                  ) : loadError ? (
                    <TableStateRow colSpan={6}>
                      <div className="flex flex-col items-center gap-3">
                        <span>{loadError}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                          Try again
                        </Button>
                      </div>
                    </TableStateRow>
                  ) : records.length === 0 ? (
                    <TableStateRow colSpan={6}>No attendance records in this range.</TableStateRow>
                  ) : (
                    records.map((row) => {
                      const employee = employeeMap.get(row.employee_id);
                      const presentation = getStatusPresentation(row.status);
                      const isConfirmingDelete = deleteCandidateId === row.id;
                      const isDeleting = deletingId === row.id;

                      return (
                        <TableRow key={row.id} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                          <TableCell variant="admin" className="whitespace-nowrap font-medium text-gray-800 dark:text-white/90">
                            {formatWorkDate(row.work_date)}
                          </TableCell>
                          <TableCell variant="admin" className="min-w-64 font-medium text-gray-800 dark:text-white/90">
                            {employee ? displayName(employee) : "Unknown employee"}
                          </TableCell>
                          <TableCell variant="admin">
                            <Badge color={presentation.color} size="sm">{presentation.label}</Badge>
                          </TableCell>
                          <TableCell variant="admin" className="text-right tabular-nums">
                            {Number(row.regular_hours).toFixed(2)}
                          </TableCell>
                          <TableCell variant="admin" className="text-right tabular-nums">
                            {Number(row.overtime_hours).toFixed(2)}
                          </TableCell>
                          <TableCell variant="admin" className="text-right">
                            {isConfirmingDelete ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="min-h-11 px-3 py-2"
                                  onClick={() => setDeleteCandidateId(null)}
                                  disabled={isDeleting}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="danger"
                                  className="min-h-11 px-3 py-2"
                                  onClick={() => void confirmDelete(row.id)}
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? "Deleting…" : "Confirm delete"}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="min-h-11 px-3 py-2 text-error-600 hover:bg-error-50 hover:text-error-700 dark:text-error-400 dark:hover:bg-error-500/10 dark:hover:text-error-300"
                                onClick={() => setDeleteCandidateId(row.id)}
                              >
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableViewport>
          </div>
        </section>
      </div>
    </div>
  );
}
