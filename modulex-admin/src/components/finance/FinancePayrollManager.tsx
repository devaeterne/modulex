"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
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
  getFinancePayrollObligations,
  type FinancePayrollObligation,
} from "@/lib/finance/payroll";
import { formatDateOnly } from "@/lib/dates/usDate";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const pageSize = 25;

function paymentColor(status: FinancePayrollObligation["payment_status"]) {
  if (status === "paid") return "success" as const;
  if (status === "partial") return "warning" as const;
  return "primary" as const;
}

export default function FinancePayrollManager() {
  const router = useRouter();
  const [rows, setRows] = useState<FinancePayrollObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await getFinancePayrollObligations());
    } catch {
      setError("Payroll obligations could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus =
        status === "all" ||
        (status === "open"
          ? row.payment_status !== "paid"
          : row.payment_status === status);
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [row.employee_name, row.employee_number, row.period_code]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, search, status]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({
          net: acc.net + Number(row.net_pay || 0),
          paid: acc.paid + Number(row.paid_amount || 0),
          remaining: acc.remaining + Number(row.remaining_amount || 0),
          employerCost: acc.employerCost + Number(row.total_employer_cost || 0),
        }),
        { net: 0, paid: 0, remaining: 0, employerCost: 0 },
      ),
    [filtered],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function pay(row: FinancePayrollObligation) {
    if (row.remaining_amount <= 0) return;
    const params = new URLSearchParams({
      kind: "employee_payment",
      employeeId: row.employee_id,
      payrollItemId: row.payroll_item_id,
      amount: String(row.remaining_amount),
    });
    router.push(`/finance/transactions?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Payroll Settlement"
        desc="Finance settles approved HR payroll obligations. Payroll calculation, taxes and approval remain HR-owned."
      >
        <Alert
          variant="info"
          title="Finance boundary"
          message="This workspace is read-only for HR payroll source records. Cash movement is recorded only through posted Finance employee-payment transactions; no second payroll payment ledger is created here."
        />
      </ComponentCard>

      {error ? (
        <Alert
          variant="error"
          title="Payroll obligations unavailable"
          message={error}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ComponentCard title="Net obligations">
          <p className="text-2xl font-semibold">{loading ? "—" : money.format(totals.net)}</p>
        </ComponentCard>
        <ComponentCard title="Finance paid">
          <p className="text-2xl font-semibold">{loading ? "—" : money.format(totals.paid)}</p>
        </ComponentCard>
        <ComponentCard title="Remaining">
          <p className="text-2xl font-semibold">{loading ? "—" : money.format(totals.remaining)}</p>
        </ComponentCard>
        <ComponentCard title="Employer cost">
          <p className="text-2xl font-semibold">{loading ? "—" : money.format(totals.employerCost)}</p>
        </ComponentCard>
      </div>

      <ComponentCard
        title="Approved Payroll Obligations"
        desc="Only approved HR payroll items are projected here. Payment status is derived from posted Finance transactions."
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
          <div>
            <Label htmlFor="finance-payroll-search">Search</Label>
            <Input
              id="finance-payroll-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Employee, number or payroll period"
            />
          </div>
          <div>
            <Label htmlFor="finance-payroll-status">Payment status</Label>
            <Select
              id="finance-payroll-status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "open", label: "Open (unpaid + partial)" },
                { value: "unpaid", label: "Unpaid" },
                { value: "partial", label: "Partial" },
                { value: "paid", label: "Paid" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Employee</TableCell>
                <TableCell isHeader variant="admin">Period</TableCell>
                <TableCell isHeader variant="admin">Pay date</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Net</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Paid</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Remaining</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? (
                <TableStateRow colSpan={8}>Loading payroll obligations…</TableStateRow>
              ) : pageRows.length === 0 ? (
                <TableStateRow colSpan={8}>No payroll obligations match these filters.</TableStateRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.payroll_item_id}>
                    <TableCell variant="admin">
                      <div className="font-medium">{row.employee_name}</div>
                      <div className="text-xs">{row.employee_number}</div>
                    </TableCell>
                    <TableCell variant="admin">{row.period_code}</TableCell>
                    <TableCell variant="admin">{formatDateOnly(row.pay_date)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(Number(row.net_pay || 0))}</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(Number(row.paid_amount || 0))}</TableCell>
                    <TableCell variant="admin" className="text-right font-semibold">{money.format(Number(row.remaining_amount || 0))}</TableCell>
                    <TableCell variant="admin">
                      <Badge color={paymentColor(row.payment_status)}>{row.payment_status}</Badge>
                    </TableCell>
                    <TableCell variant="admin">
                      <Button
                        size="sm"
                        disabled={row.remaining_amount <= 0}
                        onClick={() => pay(row)}
                      >
                        {row.remaining_amount > 0 ? "Record Payment" : "Settled"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {filtered.length === 0
              ? "0 results"
              : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
