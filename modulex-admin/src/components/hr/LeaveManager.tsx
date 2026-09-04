"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
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

type Notice = {
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
};

type StatusColor = "primary" | "success" | "error" | "warning" | "info" | "light";

const PRIMARY_LEAVE_CODES = ["PTO", "SICK", "UNPAID"] as const;
const BALANCE_PAGE_SIZE = 10;

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

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatStatus(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function requestStatusColor(status: string): StatusColor {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "pending":
      return "warning";
    case "cancelled":
      return "light";
    default:
      return "info";
  }
}

function BalanceSummary({ item }: { item?: BalanceItem }) {
  if (!item) return <span>—</span>;

  const usedHours = Number(item.balance.used_hours || 0);

  return (
    <div className="min-w-24">
      <p className={`${ADMIN_TEXT_STYLES.strong} font-semibold`}>
        {formatHours(available(item.balance))}
      </p>
      {usedHours > 0 ? (
        <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>
          {formatHours(usedHours)} used
        </p>
      ) : null}
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
  const [requestOpen, setRequestOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");

  const [typeCode, setTypeCode] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typeHours, setTypeHours] = useState("0");
  const [typePaid, setTypePaid] = useState(true);

  function showError(title: string, message: string, error: unknown) {
    console.error(title, error);
    setNotice({ variant: "error", title, message });
  }

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

    if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    if (!leaveTypeId) {
      const firstActiveType = nextTypes.find((type) => type.is_active);
      if (firstActiveType) setLeaveTypeId(firstActiveType.id);
    }
  }

  useEffect(() => {
    void load(currentYear).catch((error) =>
      showError(
        "Leave data unavailable",
        "Leave requests and balances could not be loaded. Try refreshing the page.",
        error,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      const { error } = await supabase.from("hr_leave_requests").insert({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        requested_hours: Number(hours),
        employee_note: note.trim() || null,
      });
      if (error) throw error;

      setNote("");
      setRequestOpen(false);
      setNotice({
        variant: "success",
        title: "Request created",
        message: "The leave request is ready for review.",
      });
      await load(balanceYear);
    } catch (error) {
      showError(
        "Request not created",
        "The leave request could not be saved. Check the form and try again.",
        error,
      );
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    id: string,
    status: "approved" | "rejected" | "cancelled",
  ) {
    const decision =
      status === "approved"
        ? window.prompt("Approval note (optional)")
        : window.prompt("Decision note (optional)");

    setNotice(null);
    try {
      const { error } = await supabase.rpc("set_hr_leave_request_status", {
        p_request_id: id,
        p_status: status,
        p_decision_note: decision || null,
      });
      if (error) throw error;

      setNotice({
        variant: "success",
        title: `Request ${status}`,
        message: "The request status and leave balance data were refreshed.",
      });
      await load(balanceYear);
    } catch (error) {
      showError(
        "Request status not updated",
        "The request could not be updated. Please try again.",
        error,
      );
    }
  }

  async function initializeBalances(year: number) {
    setBusy(true);
    setNotice(null);

    try {
      const { data, error } = await supabase.rpc("initialize_hr_leave_balances", {
        p_year: year,
      });
      if (error) throw error;

      setNotice({
        variant: "success",
        title: `${year} balances initialized`,
        message: `${Number(data ?? 0)} balance record(s) were created.`,
      });
      await load(year);
    } catch (error) {
      showError(
        "Balances not initialized",
        `Annual balances for ${year} could not be initialized. Please try again.`,
        error,
      );
    } finally {
      setBusy(false);
    }
  }

  async function createLeaveType(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      const { error } = await supabase.from("hr_leave_types").insert({
        code: typeCode.trim().toUpperCase(),
        name: typeName.trim(),
        paid: typePaid,
        default_annual_hours: Number(typeHours || 0),
      });
      if (error) throw error;

      setTypeCode("");
      setTypeName("");
      setTypeHours("0");
      setNotice({
        variant: "success",
        title: "Leave type added",
        message: "The leave policy is now available for requests and annual balances.",
      });
      await load(balanceYear);
    } catch (error) {
      showError(
        "Leave type not added",
        "The leave type could not be saved. Check the code and try again.",
        error,
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeBalanceYear(year: number) {
    if (year === balanceYear) return;

    setBalanceYear(year);
    setBalancePage(1);
    setExpandedEmployeeId(null);
    setLoadingBalances(true);
    setNotice(null);

    try {
      await load(year);
    } catch (error) {
      showError(
        "Balances unavailable",
        `Balances for ${year} could not be loaded. Please try again.`,
        error,
      );
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

  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: employeeName(employee),
  }));
  const leaveTypeOptions = leaveTypes
    .filter((type) => type.is_active)
    .map((type) => ({
      value: type.id,
      label: `${type.name} · ${type.paid ? "Paid" : "Unpaid"}`,
    }));
  const yearOptions = balanceYears.map((year) => ({
    value: String(year),
    label: String(year),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>
            Manage leave requests, approvals and annual employee balances from one workspace.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            Leave settings
          </Button>
          <Button onClick={() => setRequestOpen(true)}>New Leave Request</Button>
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.variant} title={notice.title} message={notice.message} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Pending requests" value={pending} tone={pending > 0 ? "warning" : "neutral"} />
        <StatTile label="Approved upcoming" value={approved} tone={approved > 0 ? "success" : "neutral"} />
        <StatTile label={`${balanceYear} used hours`} value={formatHours(used)} />
      </div>

      <ComponentCard
        title="Requests"
        desc="Review pending leave and keep upcoming approved absences visible."
        className="min-w-0"
      >
        <div className="max-h-[360px] overflow-y-auto">
          <TableViewport>
            <Table variant="admin" minWidth="standard">
              <TableHeader variant="admin" className="sticky top-0 z-10">
                <TableRow>
                  <TableCell isHeader variant="admin">Employee</TableCell>
                  <TableCell isHeader variant="admin">Leave</TableCell>
                  <TableCell isHeader variant="admin">Dates</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Hours</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell variant="admin">
                      <span className={`${ADMIN_TEXT_STYLES.strong} font-medium`}>
                        {employeeMap.get(request.employee_id)
                          ? employeeName(employeeMap.get(request.employee_id)!)
                          : request.employee_id}
                      </span>
                    </TableCell>
                    <TableCell variant="admin">
                      {typeMap.get(request.leave_type_id)?.name ?? request.leave_type_id}
                    </TableCell>
                    <TableCell variant="admin">
                      {formatDate(request.start_date)} → {formatDate(request.end_date)}
                    </TableCell>
                    <TableCell variant="admin" className="text-right">
                      {formatHours(Number(request.requested_hours))}
                    </TableCell>
                    <TableCell variant="admin">
                      <Badge color={requestStatusColor(request.status)} size="sm">
                        {formatStatus(request.status)}
                      </Badge>
                    </TableCell>
                    <TableCell variant="admin" className="text-right">
                      {request.status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void decide(request.id, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void decide(request.id, "rejected")}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 ? (
                  <TableStateRow colSpan={6}>No leave requests yet.</TableStateRow>
                ) : null}
              </TableBody>
            </Table>
          </TableViewport>
        </div>
      </ComponentCard>

      <ComponentCard
        title={`${balanceYear} Balances`}
        desc="One row per employee. Open a row for entitlement, carryover and adjustment details."
        className="min-w-0"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px] lg:max-w-xl">
            <div>
              <Label htmlFor="leave-balance-search">Search employee</Label>
              <Input
                id="leave-balance-search"
                type="search"
                value={balanceSearch}
                onChange={(event) => updateBalanceSearch(event.target.value)}
                placeholder="Name or employee number"
                ariaLabel="Search leave balances by employee"
              />
            </div>
            <div>
              <Label htmlFor="leave-balance-year">Year</Label>
              <Select
                id="leave-balance-year"
                options={yearOptions}
                value={String(balanceYear)}
                onChange={(value) => void changeBalanceYear(Number(value))}
                ariaLabel="Balance year"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void initializeBalances(balanceYear)}
            disabled={busy || loadingBalances}
          >
            Initialize {balanceYear}
          </Button>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Employee</TableCell>
                <TableCell isHeader variant="admin">PTO</TableCell>
                <TableCell isHeader variant="admin">Sick</TableCell>
                <TableCell isHeader variant="admin">Unpaid</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Pending</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Details</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loadingBalances ? (
                <TableStateRow colSpan={6}>Loading balances…</TableStateRow>
              ) : null}

              {!loadingBalances &&
                pagedBalanceRows.map((row) => {
                  const expanded = expandedEmployeeId === row.employee.id;

                  return (
                    <Fragment key={row.employee.id}>
                      <TableRow className="align-top">
                        <TableCell variant="admin">
                          <p className={`${ADMIN_TEXT_STYLES.strong} font-medium`}>
                            {row.employee.first_name} {row.employee.last_name}
                          </p>
                          <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>
                            {row.employee.employee_number}
                          </p>
                        </TableCell>
                        {PRIMARY_LEAVE_CODES.map((code) => (
                          <TableCell key={code} variant="admin">
                            <BalanceSummary item={row.byCode[code]} />
                          </TableCell>
                        ))}
                        <TableCell variant="admin" className="text-right font-medium">
                          {row.pendingHours > 0 ? formatHours(row.pendingHours) : "—"}
                        </TableCell>
                        <TableCell variant="admin" className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "Collapse" : "Expand"} ${employeeName(row.employee)} balances`}
                            onClick={() =>
                              setExpandedEmployeeId(expanded ? null : row.employee.id)
                            }
                          >
                            {expanded ? "Hide" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={6} variant="admin">
                            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                              {row.balances.map((item) => (
                                <ComponentCard
                                  key={item.balance.id}
                                  title={item.leaveType?.name ?? "Leave"}
                                  desc={`${item.leaveType?.code ?? "Custom"} · ${
                                    item.leaveType?.paid ? "Paid" : "Unpaid"
                                  }`}
                                >
                                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
                                    <div>
                                      <dt className={ADMIN_TEXT_STYLES.muted}>Entitled</dt>
                                      <dd className="mt-1 font-medium">
                                        {formatHours(Number(item.balance.entitled_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className={ADMIN_TEXT_STYLES.muted}>Carried</dt>
                                      <dd className="mt-1 font-medium">
                                        {formatHours(Number(item.balance.carried_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className={ADMIN_TEXT_STYLES.muted}>Adjusted</dt>
                                      <dd className="mt-1 font-medium">
                                        {formatHours(Number(item.balance.adjusted_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className={ADMIN_TEXT_STYLES.muted}>Used</dt>
                                      <dd className="mt-1 font-medium">
                                        {formatHours(Number(item.balance.used_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className={ADMIN_TEXT_STYLES.muted}>Pending</dt>
                                      <dd className="mt-1 font-medium">
                                        {formatHours(Number(item.balance.pending_hours))}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className={ADMIN_TEXT_STYLES.muted}>Available</dt>
                                      <dd className="mt-1 font-semibold">
                                        {formatHours(available(item.balance))}
                                      </dd>
                                    </div>
                                  </dl>
                                </ComponentCard>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}

              {!loadingBalances && filteredBalanceRows.length === 0 ? (
                <TableStateRow colSpan={6}>
                  {balanceSearch
                    ? "No employees match this search."
                    : `No ${balanceYear} balances yet. Initialize this year when you are ready.`}
                </TableStateRow>
              ) : null}
            </TableBody>
          </Table>
        </TableViewport>

        {filteredBalanceRows.length > 0 ? (
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className={ADMIN_TEXT_STYLES.muted}>
              Showing {pageStart + 1}-
              {Math.min(pageStart + BALANCE_PAGE_SIZE, filteredBalanceRows.length)} of{" "}
              {filteredBalanceRows.length} employees
            </span>
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safeBalancePage <= 1}
                onClick={() => {
                  setBalancePage((page) => Math.max(1, page - 1));
                  setExpandedEmployeeId(null);
                }}
              >
                Previous
              </Button>
              <span className="min-w-16 text-center text-xs">
                {safeBalancePage} / {totalBalancePages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={safeBalancePage >= totalBalancePages}
                onClick={() => {
                  setBalancePage((page) => Math.min(totalBalancePages, page + 1));
                  setExpandedEmployeeId(null);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </ComponentCard>

      <Modal
        isOpen={requestOpen}
        onClose={() => setRequestOpen(false)}
        className="w-full max-w-xl p-6 sm:p-8"
        ariaLabelledBy="new-leave-request-title"
      >
        <div className="pr-12">
          <h2 id="new-leave-request-title" className={`${ADMIN_TEXT_STYLES.strong} text-xl font-semibold`}>
            New Leave Request
          </h2>
          <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>
            Record a leave request for an employee and send it into the approval workflow.
          </p>
        </div>

        <form onSubmit={submitRequest} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="leave-request-employee">Employee</Label>
            <Select
              id="leave-request-employee"
              options={employeeOptions}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Select employee"
              required
            />
          </div>

          <div>
            <Label htmlFor="leave-request-type">Leave type</Label>
            <Select
              id="leave-request-type"
              options={leaveTypeOptions}
              value={leaveTypeId}
              onChange={setLeaveTypeId}
              placeholder="Select leave type"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="leave-request-from">From</Label>
              <Input
                id="leave-request-from"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="leave-request-to">To</Label>
              <Input
                id="leave-request-to"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="leave-request-hours">Hours</Label>
            <Input
              id="leave-request-hours"
              type="number"
              min="0.25"
              step="0.25"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="leave-request-note">Note</Label>
            <TextArea
              id="leave-request-note"
              rows={4}
              value={note}
              onChange={setNote}
              placeholder="Optional context for the approver"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create Request
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        className="w-full max-w-2xl p-6 sm:p-8"
        ariaLabelledBy="leave-settings-title"
      >
        <div className="pr-12">
          <h2 id="leave-settings-title" className={`${ADMIN_TEXT_STYLES.strong} text-xl font-semibold`}>
            Leave settings
          </h2>
          <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>
            Configure leave types without keeping policy administration in the daily request workflow.
          </p>
        </div>

        <form onSubmit={createLeaveType} className="mt-6 space-y-4">
          <div>
            <h3 className={`${ADMIN_TEXT_STYLES.strong} font-semibold`}>Leave types</h3>
            <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-xs`}>
              PTO, sick, unpaid and company-specific policies.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="leave-type-code">Code</Label>
              <Input
                id="leave-type-code"
                placeholder="PTO"
                value={typeCode}
                onChange={(event) => setTypeCode(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="leave-type-name">Name</Label>
              <Input
                id="leave-type-name"
                placeholder="Paid Time Off"
                value={typeName}
                onChange={(event) => setTypeName(event.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="leave-type-hours">Annual hours</Label>
            <Input
              id="leave-type-hours"
              type="number"
              min="0"
              step="0.25"
              value={typeHours}
              onChange={(event) => setTypeHours(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Checkbox
              id="leave-type-paid"
              checked={typePaid}
              onChange={setTypePaid}
              label="Paid leave"
            />
            <Button type="submit" size="sm" disabled={busy}>
              Add Leave Type
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <TableViewport>
            <Table variant="admin">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Type</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Annual default</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Status</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {leaveTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell variant="admin">
                      <p className={`${ADMIN_TEXT_STYLES.strong} font-medium`}>
                        {type.code} · {type.name}
                      </p>
                      <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>
                        {type.paid ? "Paid" : "Unpaid"}
                      </p>
                    </TableCell>
                    <TableCell variant="admin" className="text-right">
                      {formatHours(Number(type.default_annual_hours))}
                    </TableCell>
                    <TableCell variant="admin" className="text-right">
                      <Badge color={type.is_active ? "success" : "light"} size="sm">
                        {type.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {leaveTypes.length === 0 ? (
                  <TableStateRow colSpan={3}>No leave types configured.</TableStateRow>
                ) : null}
              </TableBody>
            </Table>
          </TableViewport>
        </div>
      </Modal>
    </div>
  );
}
