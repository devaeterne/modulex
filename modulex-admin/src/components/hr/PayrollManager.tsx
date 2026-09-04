"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type Period = {
  id: string;
  period_code: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  notes: string | null;
};

type Run = {
  id: string;
  payroll_period_id: string;
  run_number: number;
  status: string;
  calculated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
};

type Item = {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  base_pay: number;
  overtime_pay: number;
  bonus_pay: number;
  commission_pay: number;
  other_earnings: number;
  reimbursements: number;
  gross_pay: number;
  pre_tax_deductions: number;
  taxable_wages: number;
  federal_income_tax: number;
  state_income_tax: number;
  local_income_tax: number;
  social_security_tax: number;
  medicare_tax: number;
  post_tax_deductions: number;
  advance_repayment: number;
  net_pay: number;
  employer_payroll_taxes: number;
  employer_benefit_cost: number;
  total_employer_cost: number;
  tax_calculation_source: string;
};

type Employee = {
  employee_id: string;
  employee_number: string;
  full_name: string;
  employment_status: string;
  employment_type: string;
  department_name: string | null;
  position_title: string | null;
};

type FinanceSettlement = {
  payroll_item_id: string;
  paid_amount: number;
  remaining_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  latest_payment_at: string | null;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const n = (value: number | string | null | undefined) => Number(value ?? 0);

function paymentStatusColor(status: FinanceSettlement["payment_status"]) {
  if (status === "paid") return "success" as const;
  if (status === "partial") return "warning" as const;
  return "primary" as const;
}

export default function PayrollManager() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [settlements, setSettlements] = useState<FinanceSettlement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [runId, setRunId] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [message, setMessage] = useState<{ variant: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [payDate, setPayDate] = useState("");
  const [fed, setFed] = useState("0");
  const [state, setState] = useState("0");
  const [local, setLocal] = useState("0");
  const [ss, setSs] = useState("0");
  const [medicare, setMedicare] = useState("0");
  const [employerTax, setEmployerTax] = useState("0");

  async function load() {
    const [periodResult, runResult, employeeResult] = await Promise.all([
      supabase.from("hr_payroll_periods").select("id,period_code,period_start,period_end,pay_date,status,notes").order("period_start", { ascending: false }),
      supabase.from("hr_payroll_runs").select("id,payroll_period_id,run_number,status,calculated_at,approved_at,paid_at,notes").order("created_at", { ascending: false }),
      supabase.rpc("get_hr_payroll_employee_directory"),
    ]);
    if (periodResult.error) throw periodResult.error;
    if (runResult.error) throw runResult.error;
    if (employeeResult.error) throw employeeResult.error;

    const nextPeriods = (periodResult.data ?? []) as Period[];
    const nextRuns = (runResult.data ?? []) as Run[];
    setPeriods(nextPeriods);
    setRuns(nextRuns);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    if (!periodId && nextPeriods[0]) setPeriodId(nextPeriods[0].id);
    const initialRun = runId ? nextRuns.find((run) => run.id === runId) : nextRuns[0];
    if (!runId && initialRun) setRunId(initialRun.id);
  }

  async function loadItems(id: string) {
    if (!id) {
      setItems([]);
      setSettlements([]);
      return;
    }
    const [itemResult, settlementResult] = await Promise.all([
      supabase.from("hr_payroll_items").select("*").eq("payroll_run_id", id).order("employee_id"),
      supabase.rpc("get_hr_payroll_finance_settlement", { p_run_id: id }),
    ]);
    if (itemResult.error) throw itemResult.error;
    if (settlementResult.error) throw settlementResult.error;
    setItems((itemResult.data ?? []) as Item[]);
    setSettlements((settlementResult.data ?? []) as FinanceSettlement[]);
  }

  useEffect(() => {
    void load().catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Payroll could not be loaded." }));
    // Initial workspace load only; later reloads are explicit workflow actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadItems(runId).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Payroll items could not be loaded." }));
  }, [runId]);

  useEffect(() => {
    if (!periodId) return;
    const first = runs.find((run) => run.payroll_period_id === periodId);
    setRunId(first?.id ?? "");
  }, [periodId, runs]);

  async function createPeriod(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("hr_payroll_periods").insert({
      period_code: code.trim().toUpperCase(),
      period_start: start,
      period_end: end,
      pay_date: payDate,
      status: "open",
    });
    if (error) {
      setMessage({ variant: "error", text: error.message });
      return;
    }
    setCode("");
    setStart("");
    setEnd("");
    setPayDate("");
    setMessage({ variant: "success", text: "Payroll period created." });
    await load();
  }

  async function createRun() {
    if (!periodId) return;
    const existing = runs.filter((run) => run.payroll_period_id === periodId);
    const next = Math.max(0, ...existing.map((run) => run.run_number)) + 1;
    const { data, error } = await supabase.from("hr_payroll_runs").insert({ payroll_period_id: periodId, run_number: next, status: "draft" }).select("id").single();
    if (error) {
      setMessage({ variant: "error", text: error.message });
      return;
    }
    setMessage({ variant: "success", text: `Payroll run ${next} created.` });
    await load();
    if (data?.id) setRunId(data.id);
  }

  async function prepare() {
    if (!runId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("prepare_hr_payroll_run", { p_run_id: runId });
      if (error) throw error;
      setMessage({ variant: "info", text: `${Number(data ?? 0)} employee payroll item(s) prepared. Enter and verify taxes before approval.` });
      await load();
      await loadItems(runId);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Payroll could not be prepared." });
    } finally {
      setBusy(false);
    }
  }

  async function approveRun() {
    if (!runId || !window.confirm("Approve this payroll calculation? Actual payment is recorded separately in Finance.")) return;
    const { error } = await supabase.rpc("set_hr_payroll_run_status", { p_run_id: runId, p_status: "approved" });
    if (error) {
      setMessage({ variant: "error", text: error.message });
      return;
    }
    setMessage({ variant: "success", text: "Payroll approved. Record actual employee payments in Finance; settlement below updates from posted Finance transactions." });
    await load();
    await loadItems(runId);
  }

  function beginTaxEdit(item: Item) {
    setEditing(item);
    setFed(String(n(item.federal_income_tax)));
    setState(String(n(item.state_income_tax)));
    setLocal(String(n(item.local_income_tax)));
    setSs(String(n(item.social_security_tax)));
    setMedicare(String(n(item.medicare_tax)));
    setEmployerTax(String(n(item.employer_payroll_taxes)));
  }

  async function saveTaxes(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const { error } = await supabase.from("hr_payroll_items").update({
      federal_income_tax: Number(fed || 0),
      state_income_tax: Number(state || 0),
      local_income_tax: Number(local || 0),
      social_security_tax: Number(ss || 0),
      medicare_tax: Number(medicare || 0),
      employer_payroll_taxes: Number(employerTax || 0),
      tax_calculation_source: "manual",
    }).eq("id", editing.id);
    if (error) {
      setMessage({ variant: "error", text: error.message });
      return;
    }
    setEditing(null);
    setMessage({ variant: "success", text: "Tax values saved and net pay recalculated." });
    await loadItems(runId);
  }

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.employee_id, employee])), [employees]);
  const settlementMap = useMemo(() => new Map(settlements.map((settlement) => [settlement.payroll_item_id, settlement])), [settlements]);
  const selectedRun = runs.find((run) => run.id === runId);
  const selectedPeriod = periods.find((period) => period.id === periodId);
  const periodOptions = periods.map((period) => ({ value: period.id, label: `${period.period_code} · ${period.period_start} → ${period.period_end} · Pay ${period.pay_date}` }));
  const runOptions = runs.filter((run) => !periodId || run.payroll_period_id === periodId).map((run) => ({ value: run.id, label: `Run ${run.run_number} · ${run.status}` }));
  const totals = useMemo(() => items.reduce((acc, item) => ({
    gross: acc.gross + n(item.gross_pay),
    tax: acc.tax + n(item.federal_income_tax) + n(item.state_income_tax) + n(item.local_income_tax) + n(item.social_security_tax) + n(item.medicare_tax),
    net: acc.net + n(item.net_pay),
    cost: acc.cost + n(item.total_employer_cost),
  }), { gross: 0, tax: 0, net: 0, cost: 0 }), [items]);

  return (
    <div className="space-y-6">
      <ComponentCard title="Payroll" desc="Prepare payroll from compensation, attendance, bonus/commission, deductions, benefits and advances.">
        <div className="grid gap-4 xl:grid-cols-2">
          <Alert variant="warning" title="Tax engine status" message="Manual verification is required. Federal, state and local withholding tables are not hard-coded yet. Do not approve payroll until tax values are verified." />
          <Alert variant="info" title="Payment source of truth" message="Payroll approval does not move cash. Finance Paid, Remaining and payment status are derived from posted Finance employee payments." />
        </div>
      </ComponentCard>

      {message ? <Alert variant={message.variant} title={message.variant === "error" ? "Payroll error" : "Payroll updated"} message={message.text} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard title="New Payroll Period" desc="Create the HR calculation period. Actual employee payment remains a Finance transaction.">
          <form onSubmit={createPeriod} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Period code"><Input placeholder="2026-BW-18" value={code} onChange={(event) => setCode(event.target.value)} required /></Field></div>
            <Field label="Start"><Input type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></Field>
            <Field label="End"><Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required /></Field>
            <div className="md:col-span-2"><Field label="Pay date"><Input type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} required /></Field></div>
            <div className="md:col-span-2"><Button type="submit">Create Period</Button></div>
          </form>
        </ComponentCard>

        <ComponentCard title="Payroll Run" desc="Prepare and approve payroll calculation. Payment completion is derived from Finance, not a manual paid flag.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Payroll period"><Select options={periodOptions} value={periodId} allowEmpty placeholder="Select period" onChange={setPeriodId} /></Field>
            <Field label="Run"><Select options={runOptions} value={runId} allowEmpty placeholder="Select run" onChange={setRunId} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void createRun()} disabled={!periodId}>New Run</Button>
            <Button onClick={() => void prepare()} disabled={!runId || busy || selectedRun?.status === "approved" || selectedRun?.status === "paid"}>{busy ? "Preparing..." : "Prepare / Recalculate"}</Button>
            <Button variant="outline" onClick={() => void approveRun()} disabled={selectedRun?.status !== "calculated"}>Approve</Button>
          </div>
          {selectedPeriod ? <p className="text-xs">{selectedPeriod.period_code} · {selectedPeriod.status} · Pay date {selectedPeriod.pay_date}</p> : null}
          {selectedRun?.status === "paid" ? <Alert variant="warning" title="Legacy paid status" message="This older run is marked paid in HR. New payment truth is derived from Finance settlement below." /> : null}
        </ComponentCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Gross pay" value={money.format(totals.gross)} />
        <MetricCard title="Employee taxes" value={money.format(totals.tax)} />
        <MetricCard title="Net pay" value={money.format(totals.net)} />
        <MetricCard title="Employer cost" value={money.format(totals.cost)} />
      </div>

      <ComponentCard title="Payroll Items" desc="Finance Paid and Remaining are live read-only settlement projections from posted Finance employee payments.">
        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Employee</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Hours</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Gross</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Pre-tax</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Taxes</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Post-tax</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Advance</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Net</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Finance Paid</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Remaining</TableCell>
                <TableCell isHeader variant="admin">Payment</TableCell>
                <TableCell isHeader variant="admin">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {items.length === 0 ? <TableStateRow colSpan={12}>Create or select a run and click Prepare.</TableStateRow> : items.map((item) => {
                const employee = employeeMap.get(item.employee_id);
                const tax = n(item.federal_income_tax) + n(item.state_income_tax) + n(item.local_income_tax) + n(item.social_security_tax) + n(item.medicare_tax);
                const settlement = settlementMap.get(item.id) ?? {
                  payroll_item_id: item.id,
                  paid_amount: 0,
                  remaining_amount: n(item.net_pay),
                  payment_status: "unpaid" as const,
                  latest_payment_at: null,
                };
                return (
                  <TableRow key={item.id}>
                    <TableCell variant="admin"><div className="font-medium">{employee?.full_name || item.employee_id}</div><div className="text-xs">{employee?.employee_number}</div></TableCell>
                    <TableCell variant="admin" className="text-right">{n(item.regular_hours).toFixed(2)} + {n(item.overtime_hours).toFixed(2)} OT</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(n(item.gross_pay))}</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(n(item.pre_tax_deductions))}</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(tax)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(n(item.post_tax_deductions))}</TableCell>
                    <TableCell variant="admin" className="text-right">{money.format(n(item.advance_repayment))}</TableCell>
                    <TableCell variant="admin" className="text-right font-semibold">{money.format(n(item.net_pay))}</TableCell>
                    <TableCell variant="admin" className="text-right font-semibold">{money.format(n(settlement.paid_amount))}</TableCell>
                    <TableCell variant="admin" className="text-right font-semibold">{money.format(n(settlement.remaining_amount))}</TableCell>
                    <TableCell variant="admin"><Badge color={paymentStatusColor(settlement.payment_status)}>{settlement.payment_status}</Badge>{settlement.latest_payment_at ? <div className="mt-1 text-xs">{new Date(settlement.latest_payment_at).toLocaleDateString()}</div> : null}</TableCell>
                    <TableCell variant="admin"><Button size="sm" variant="outline" disabled={selectedRun?.status === "approved" || selectedRun?.status === "paid"} onClick={() => beginTaxEdit(item)}>Taxes</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      {editing ? (
        <ComponentCard title="Manual Tax Entry" desc={employeeMap.get(editing.employee_id)?.full_name ?? editing.employee_id} headerAction={<Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close</Button>}>
          <form onSubmit={saveTaxes} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Federal income tax"><Input type="number" min="0" step={0.01} value={fed} onChange={(event) => setFed(event.target.value)} /></Field>
              <Field label="State income tax"><Input type="number" min="0" step={0.01} value={state} onChange={(event) => setState(event.target.value)} /></Field>
              <Field label="Local income tax"><Input type="number" min="0" step={0.01} value={local} onChange={(event) => setLocal(event.target.value)} /></Field>
              <Field label="Social Security"><Input type="number" min="0" step={0.01} value={ss} onChange={(event) => setSs(event.target.value)} /></Field>
              <Field label="Medicare"><Input type="number" min="0" step={0.01} value={medicare} onChange={(event) => setMedicare(event.target.value)} /></Field>
              <Field label="Employer payroll taxes"><Input type="number" min="0" step={0.01} value={employerTax} onChange={(event) => setEmployerTax(event.target.value)} /></Field>
            </div>
            <div className="flex gap-2"><Button type="submit">Save Taxes</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
          </form>
        </ComponentCard>
      ) : null}
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return <ComponentCard title={title}><p className="text-xl font-semibold">{value}</p></ComponentCard>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>;
}
