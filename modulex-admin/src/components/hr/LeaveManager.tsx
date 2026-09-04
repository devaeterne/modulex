"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { supabase } from "@/lib/supabase/client";

type Employee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
};

type LeaveType = {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  default_annual_hours: number;
  is_active: boolean;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  requested_hours: number;
  status: string;
  employee_note: string | null;
  decision_note: string | null;
  created_at: string;
};

type LeaveBalance = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  balance_year: number;
  entitled_hours: number;
  carried_hours: number;
  adjusted_hours: number;
  used_hours: number;
  pending_hours: number;
};

type BalanceItem = {
  balance: LeaveBalance;
  leaveType?: LeaveType;
};

type BalanceRow = {
  employee: Employee;
  balances: BalanceItem[];
  byCode: Record<string, BalanceItem | undefined>;
  pendingHours: number;
};

const PRIMARY_LEAVE_CODES = ["PTO", "SICK", "UNPAID"] as const;
const BALANCE_PAGE_SIZE = 10;

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const cardClass =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";
const secondaryButtonClass =
  "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.04]";

function employeeName(row: Employee) {
  return `${row.employee_number} · ${row.first_name} ${row.last_name}`;
}

function available(balance: LeaveBalance) {
  return (
    Number(balance.entitled_hours) +
    Number(balance.carried_hours) +
    Number(balance.adjusted_hours) -
    Number(balance.used_hours) -
    Number(balance.pending_hours)
  );
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}h`;
}

function BalanceSummary({ item }: { item?: BalanceItem }) {
  if (!item) {
    return <span className="text-gray-400">—</span>;
  }

  return (
    <div className="min-w-28">
      <p className="font-semibold text-gray-800 dark:text-white/90">
        {formatHours(available(item.balance))}
        <span className="ml-1 font-normal text-gray-500">available</span>
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        {formatHours(Number(item.balance.used_hours))} used
      </p>
    </div>
  );
}

export default function LeaveManager() {
  const currentYear = new Date().getFullYear();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceYears, setBalanceYears] = useState<number[]>([currentYear]);
  const [balanceYear, setBalanceYear] = useState(currentYear);
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [typeCode, setTypeCode] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typeHours, setTypeHours] = useState("0");
  const [typePaid, setTypePaid] = useState(true);

  async function load(targetYear: number) {
    const [employeeResult, typeResult, requestResult, balanceResult, yearResult] =
      await Promise.all([
        supabase
          .from("hr_employees")
          .select("id,employee_number,first_name,last_name")
          .in("employment_status", ["active", "on_leave"])
          .order("last_name"),
        supabase
          .from("hr_leave_types")
          .select("id,code,name,paid,default_annual_hours,is_active")
          .order("sort_order"),
        supabase
          .from("hr_leave_requests")
          .select(
            "id,employee_id,leave_type_id,start_date,end_date,requested_hours,status,employee_note,decision_note,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("hr_leave_balances")
          .select(
            "id,employee_id,leave_type_id,balance_year,entitled_hours,carried_hours,adjusted_hours,used_hours,pending_hours",
          )
          .eq("balance_year", targetYear),
        supabase
          .from("hr_leave_balances")
          .select("balance_year")
          .order("balance_year", { ascending: false })
          .limit(2000),
      ]);

    for (const result of [
      employeeResult,
      typeResult,
      requestResult,
      balanceResult,
      yearResult,
    ]) {
      if (result.error) throw result.error;
    }

    const nextEmployees = (employeeResult.data ?? []) as Employee[];
    const nextTypes = (typeResult.data ?? []) as LeaveType[];
    const discoveredYears = ((yearResult.data ?? []) as { balance_year: number }[])
      .map((row) => Number(row.balance_year))
      .filter(Number.isFinite);
    const nextYears = Array.from(
      new Set([
        currentYear + 1,
        currentYear,
        currentYear - 1,
        targetYear,
        ...discoveredYears,
      ]),
    ).sort((a, b) => b - a);

    setEmployees(nextEmployees);
    setLeaveTypes(nextTypes);
    setRequests((requestResult.data ?? []) as LeaveRequest[]);
    setBalances((balanceResult.data ?? []) as LeaveBalance[]);
    setBalanceYears(nextYears);

    if (!employeeId && nextEmployees[0]) {
      setEmployeeId(nextEmployees[0].id);
    }
    if (!leaveTypeId) {
      const firstActiveType = nextTypes.find((type) => type.is_active);
      if (firstActiveType) setLeaveTypeId(firstActiveType.id);
    }
  }

  useEffect(() => {
    void load(currentYear).catch((error) =>
      setMessage(error instanceof Error ? error.message : "Leave data could not be loaded."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.from("hr_leave_requests").insert({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      requested_hours: Number(hours),
      employee_note: note.trim() || null,
    });

    setBusy(false);
    if (error) return setMessage(error.message);

    setMessage("Leave request created.");
    setNote("");
    await load(balanceYear);
  }

  async function decide(
    id: string,
    status: "approved" | "rejected" | "cancelled",
  ) {
    const decision =
      status === "approved"
        ? window.prompt("Approval note (optional)")
        : window.prompt("Decision note (optional)");

    const { error } = await supabase.rpc("set_hr_leave_request_status", {
      p_request_id: id,
      p_status: status,
      p_decision_note: decision || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Request ${status}.`);
      await load(balanceYear);
    }
  }

  async function initializeBalances(year: number) {
    setBusy(true);
    const { data, error } = await supabase.rpc("initialize_hr_leave_balances", {
      p_year: year,
    });
    setBusy(false);

    if (error) return setMessage(error.message);

    setMessage(`${Number(data ?? 0)} leave balance record(s) initialized for ${year}.`);
    await load(year);
  }

  async function createLeaveType(event: FormEvent) {
    event.preventDefault();

    const { error } = await supabase.from("hr_leave_types").insert({
      code: typeCode.trim().toUpperCase(),
      name: typeName.trim(),
      paid: typePaid,
      default_annual_hours: Number(typeHours || 0),
    });

    if (error) return setMessage(error.message);

    setTypeCode("");
    setTypeName("");
    setTypeHours("0");
    setMessage("Leave type created.");
    await load(balanceYear);
  }

  async function changeBalanceYear(year: number) {
    if (year === balanceYear) return;

    setBalanceYear(year);
    setBalancePage(1);
    setExpandedEmployeeId(null);
    setLoadingBalances(true);
    setMessage(null);

    try {
      await load(year);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Leave balances could not be loaded.");
    } finally {
      setLoadingBalances(false);
    }
  }

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const typeMap = useMemo(
    () => new Map(leaveTypes.map((type) => [type.id, type])),
    [leaveTypes],
  );
  const typeOrderMap = useMemo(
    () => new Map(leaveTypes.map((type, index) => [type.id, index])),
    [leaveTypes],
  );

  const pending = requests.filter((request) => request.status === "pending").length;
  const approved = requests.filter(
    (request) =>
      request.status === "approved" && new Date(request.end_date) >= new Date(),
  ).length;
  const used = balances.reduce(
    (sum, balance) => sum + Number(balance.used_hours || 0),
    0,
  );

  const balanceRows = useMemo(() => {
    const balancesByEmployee = new Map<string, LeaveBalance[]>();

    for (const balance of balances) {
      const employeeBalances = balancesByEmployee.get(balance.employee_id) ?? [];
      employeeBalances.push(balance);
      balancesByEmployee.set(balance.employee_id, employeeBalances);
    }

    return employees
      .map<BalanceRow | null>((employee) => {
        const employeeBalances = balancesByEmployee.get(employee.id) ?? [];
        if (employeeBalances.length === 0) return null;

        const items = employeeBalances
          .map((balance) => ({
            balance,
            leaveType: typeMap.get(balance.leave_type_id),
          }))
          .sort(
            (a, b) =>
              (typeOrderMap.get(a.balance.leave_type_id) ?? Number.MAX_SAFE_INTEGER) -
              (typeOrderMap.get(b.balance.leave_type_id) ?? Number.MAX_SAFE_INTEGER),
          );

        const byCode: Record<string, BalanceItem | undefined> = {};
        for (const item of items) {
          const code = item.leaveType?.code?.toUpperCase();
          if (code) byCode[code] = item;
        }

        return {
          employee,
          balances: items,
          byCode,
          pendingHours: items.reduce(
            (sum, item) => sum + Number(item.balance.pending_hours || 0),
            0,
          ),
        };
      })
      .filter((row): row is BalanceRow => row !== null);
  }, [balances, employees, typeMap, typeOrderMap]);

  const filteredBalanceRows = useMemo(() => {
    const query = balanceSearch.trim().toLowerCase();
    if (!query) return balanceRows;

    return balanceRows.filter((row) =>
      employeeName(row.employee).toLowerCase().includes(query),
    );
  }, [balanceRows, balanceSearch]);

  const totalBalancePages = Math.max(
    1,
    Math.ceil(filteredBalanceRows.length / BALANCE_PAGE_SIZE),
  );
  const safeBalancePage = Math.min(balancePage, totalBalancePages);
  const pageStart = (safeBalancePage - 1) * BALANCE_PAGE_SIZE;
  const pagedBalanceRows = filteredBalanceRows.slice(
    pageStart,
    pageStart + BALANCE_PAGE_SIZE,
  );

  function updateBalanceSearch(value: string) {
    setBalanceSearch(value);
    setBalancePage(1);
    setExpandedEmployeeId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Leave & PTO
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage leave policies, annual balances, requests and approvals.
        </p>
      </div>

      {message ? (
        <div className={`${cardClass} text-sm text-gray-700 dark:text-gray-300`}>
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Pending requests", pending],
          ["Approved upcoming", approved],
          [`${balanceYear} used hours`, formatHours(used)],
        ].map(([label, value]) => (
          <div key={String(label)} className={cardClass}>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={submitRequest} className={`${cardClass} space-y-4`}>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">
            New Leave Request
          </h2>

          <label className="block text-sm text-gray-600 dark:text-gray-300">
            Employee
            <select
              className={`${inputClass} mt-1`}
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              required
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeName(employee)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-gray-600 dark:text-gray-300">
            Leave type
            <select
              className={`${inputClass} mt-1`}
              value={leaveTypeId}
              onChange={(event) => setLeaveTypeId(event.target.value)}
              required
            >
              {leaveTypes
                .filter((type) => type.is_active)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.paid ? " · Paid" : " · Unpaid"}
                  </option>
                ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              From
              <input
                type="date"
                className={`${inputClass} mt-1`}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              To
              <input
                type="date"
                className={`${inputClass} mt-1`}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <label className="block text-sm text-gray-600 dark:text-gray-300">
            Hours
            <input
              type="number"
              min="0.25"
              step="0.25"
              className={`${inputClass} mt-1`}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </label>

          <label className="block text-sm text-gray-600 dark:text-gray-300">
            Note
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <button
            disabled={busy}
            className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Create Request
          </button>
        </form>

        <div className={`${cardClass} min-w-0 overflow-hidden p-0`}>
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">
              Requests
            </h2>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Leave</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                      {employeeMap.get(request.employee_id)
                        ? employeeName(employeeMap.get(request.employee_id)!)
                        : request.employee_id}
                    </td>
                    <td className="px-4 py-3">
                      {typeMap.get(request.leave_type_id)?.name ?? request.leave_type_id}
                    </td>
                    <td className="px-4 py-3">
                      {request.start_date} → {request.end_date}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatHours(Number(request.requested_hours))}
                    </td>
                    <td className="px-4 py-3 capitalize">{request.status}</td>
                    <td className="px-4 py-3 text-right">
                      {request.status === "pending" ? (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => void decide(request.id, "approved")}
                            className="text-xs font-medium text-success-600"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(request.id, "rejected")}
                            className="text-xs font-medium text-error-600"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No leave requests.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden p-0`}>
        <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-white/90">
                {balanceYear} Balances
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                One row per employee. Open a row for entitlement and adjustment details.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <input
                type="search"
                value={balanceSearch}
                onChange={(event) => updateBalanceSearch(event.target.value)}
                placeholder="Search employee"
                aria-label="Search leave balances by employee"
                className={`${inputClass} sm:w-56`}
              />
              <select
                value={balanceYear}
                onChange={(event) => void changeBalanceYear(Number(event.target.value))}
                aria-label="Balance year"
                className={`${inputClass} sm:w-28`}
              >
                {balanceYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void initializeBalances(balanceYear)}
                disabled={busy || loadingBalances}
                className={secondaryButtonClass}
              >
                Initialize {balanceYear}
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className={secondaryButtonClass}
              >
                Leave settings
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[920px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">PTO</th>
                <th className="px-4 py-3">Sick</th>
                <th className="px-4 py-3">Unpaid</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="w-12 px-4 py-3">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loadingBalances ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    Loading balances…
                  </td>
                </tr>
              ) : null}

              {!loadingBalances &&
                pagedBalanceRows.map((row) => {
                  const expanded = expandedEmployeeId === row.employee.id;

                  return (
                    <Fragment key={row.employee.id}>
                      <tr className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {row.employee.first_name} {row.employee.last_name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {row.employee.employee_number}
                          </p>
                        </td>
                        {PRIMARY_LEAVE_CODES.map((code) => (
                          <td key={code} className="px-4 py-4">
                            <BalanceSummary item={row.byCode[code]} />
                          </td>
                        ))}
                        <td className="px-4 py-4 text-right font-medium text-gray-700 dark:text-gray-300">
                          {formatHours(row.pendingHours)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "Collapse" : "Expand"} ${employeeName(row.employee)} balances`}
                            onClick={() =>
                              setExpandedEmployeeId(expanded ? null : row.employee.id)
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
                          >
                            <span
                              aria-hidden="true"
                              className={`text-base transition-transform ${expanded ? "rotate-180" : ""}`}
                            >
                              ⌄
                            </span>
                          </button>
                        </td>
                      </tr>

                      {expanded ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="bg-gray-50/70 px-4 py-4 dark:bg-white/[0.02]"
                          >
                            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                              {row.balances.map((item) => (
                                <div
                                  key={item.balance.id}
                                  className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="font-medium text-gray-800 dark:text-white/90">
                                        {item.leaveType?.name ?? "Leave"}
                                      </p>
                                      <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">
                                        {item.leaveType?.code ?? "Custom"}
                                      </p>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                                      {formatHours(available(item.balance))} available
                                    </p>
                                  </div>
                                  <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 text-xs">
                                    <div>
                                      <dt className="text-gray-500">Entitled</dt>
                                      <dd className="mt-1 font-medium text-gray-700 dark:text-gray-300">
                                        {formatHours(Number(item.balance.entitled_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-gray-500">Carried</dt>
                                      <dd className="mt-1 font-medium text-gray-700 dark:text-gray-300">
                                        {formatHours(Number(item.balance.carried_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-gray-500">Adjusted</dt>
                                      <dd className="mt-1 font-medium text-gray-700 dark:text-gray-300">
                                        {formatHours(Number(item.balance.adjusted_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-gray-500">Used</dt>
                                      <dd className="mt-1 font-medium text-gray-700 dark:text-gray-300">
                                        {formatHours(Number(item.balance.used_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-gray-500">Pending</dt>
                                      <dd className="mt-1 font-medium text-gray-700 dark:text-gray-300">
                                        {formatHours(Number(item.balance.pending_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-gray-500">Available</dt>
                                      <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                                        {formatHours(available(item.balance))}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}

              {!loadingBalances && filteredBalanceRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {balanceSearch ? "No employees match this search." : `No ${balanceYear} balances yet.`}
                    </p>
                    {!balanceSearch ? (
                      <p className="mt-1 text-sm text-gray-500">
                        Initialize the selected year when you are ready to create annual balances.
                      </p>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {filteredBalanceRows.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {pageStart + 1}-
              {Math.min(pageStart + BALANCE_PAGE_SIZE, filteredBalanceRows.length)} of{" "}
              {filteredBalanceRows.length} employees
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeBalancePage <= 1}
                onClick={() => {
                  setBalancePage((page) => Math.max(1, page - 1));
                  setExpandedEmployeeId(null);
                }}
                className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
              >
                Previous
              </button>
              <span className="min-w-16 text-center text-xs">
                {safeBalancePage} / {totalBalancePages}
              </span>
              <button
                type="button"
                disabled={safeBalancePage >= totalBalancePages}
                onClick={() => {
                  setBalancePage((page) => Math.min(totalBalancePages, page + 1));
                  setExpandedEmployeeId(null);
                }}
                className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        className="relative w-full max-w-2xl p-6 sm:p-7"
        ariaLabelledBy="leave-settings-title"
      >
        <div className="pr-12">
          <h2
            id="leave-settings-title"
            className="text-xl font-semibold text-gray-800 dark:text-white/90"
          >
            Leave settings
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Configure leave types without keeping policy administration in the daily
            request workflow.
          </p>
        </div>

        <form onSubmit={createLeaveType} className="mt-6 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90">
              Leave types
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              PTO, sick, unpaid and company-specific policies.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={inputClass}
              placeholder="Code"
              value={typeCode}
              onChange={(event) => setTypeCode(event.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="Name"
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              required
            />
          </div>

          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.25"
            placeholder="Annual hours"
            value={typeHours}
            onChange={(event) => setTypeHours(event.target.value)}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={typePaid}
                onChange={(event) => setTypePaid(event.target.checked)}
              />
              Paid leave
            </label>
            <button
              disabled={busy}
              className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Add Leave Type
            </button>
          </div>
        </form>

        <div className="mt-6 max-h-72 space-y-2 overflow-y-auto border-t border-gray-200 pt-4 dark:border-gray-800">
          {leaveTypes.map((type) => (
            <div
              key={type.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2.5 text-sm dark:bg-white/[0.03]"
            >
              <div>
                <p className="font-medium text-gray-800 dark:text-white/90">
                  {type.code} · {type.name}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {type.paid ? "Paid" : "Unpaid"} ·{" "}
                  {formatHours(Number(type.default_annual_hours))} annual default
                </p>
              </div>
              <span className="text-xs text-gray-500">
                {type.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
