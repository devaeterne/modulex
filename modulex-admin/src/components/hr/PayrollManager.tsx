"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

type Period = { id: string; period_code: string; period_start: string; period_end: string; pay_date: string; status: string; notes: string | null };
type Run = { id: string; payroll_period_id: string; run_number: number; status: string; calculated_at: string | null; approved_at: string | null; paid_at: string | null; notes: string | null };
type Item = { id: string; payroll_run_id: string; employee_id: string; regular_hours: number; overtime_hours: number; base_pay: number; overtime_pay: number; bonus_pay: number; commission_pay: number; other_earnings: number; reimbursements: number; gross_pay: number; pre_tax_deductions: number; taxable_wages: number; federal_income_tax: number; state_income_tax: number; local_income_tax: number; social_security_tax: number; medicare_tax: number; post_tax_deductions: number; advance_repayment: number; net_pay: number; employer_payroll_taxes: number; employer_benefit_cost: number; total_employer_cost: number; tax_calculation_source: string };
type Employee = { employee_id: string; employee_number: string; full_name: string; employment_status: string; employment_type: string; department_name: string | null; position_title: string | null };
type FinanceSettlement = { payroll_item_id: string; paid_amount: number; remaining_amount: number; payment_status: "unpaid" | "partial" | "paid"; latest_payment_at: string | null };

const input = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const card = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const n = (value: number | string | null | undefined) => Number(value ?? 0);

function paymentStatusClass(status: FinanceSettlement["payment_status"]) {
  if (status === "paid") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300";
  if (status === "partial") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";
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
  const [message, setMessage] = useState<string | null>(null);
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
    const [p, r, e] = await Promise.all([
      supabase.from("hr_payroll_periods").select("id,period_code,period_start,period_end,pay_date,status,notes").order("period_start", { ascending: false }),
      supabase.from("hr_payroll_runs").select("id,payroll_period_id,run_number,status,calculated_at,approved_at,paid_at,notes").order("created_at", { ascending: false }),
      supabase.rpc("get_hr_payroll_employee_directory"),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    if (e.error) throw e.error;
    const ps = (p.data ?? []) as Period[];
    const rs = (r.data ?? []) as Run[];
    setPeriods(ps);
    setRuns(rs);
    setEmployees((e.data ?? []) as Employee[]);
    if (!periodId && ps[0]) setPeriodId(ps[0].id);
    const initialRun = runId ? rs.find((item) => item.id === runId) : rs[0];
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
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Payroll could not be loaded."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadItems(runId).catch((error) => setMessage(error instanceof Error ? error.message : "Payroll items could not be loaded."));
  }, [runId]);

  useEffect(() => {
    if (periodId) {
      const first = runs.find((run) => run.payroll_period_id === periodId);
      if (first) setRunId(first.id);
      else setRunId("");
    }
  }, [periodId, runs]);

  async function createPeriod(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("hr_payroll_periods").insert({ period_code: code.trim().toUpperCase(), period_start: start, period_end: end, pay_date: payDate, status: "open" });
    if (error) return setMessage(error.message);
    setCode("");
    setStart("");
    setEnd("");
    setPayDate("");
    setMessage("Payroll period created.");
    await load();
  }

  async function createRun() {
    if (!periodId) return;
    const existing = runs.filter((run) => run.payroll_period_id === periodId);
    const next = Math.max(0, ...existing.map((run) => run.run_number)) + 1;
    const { data, error } = await supabase.from("hr_payroll_runs").insert({ payroll_period_id: periodId, run_number: next, status: "draft" }).select("id").single();
    if (error) return setMessage(error.message);
    setMessage(`Payroll run ${next} created.`);
    await load();
    if (data?.id) setRunId(data.id);
  }

  async function prepare() {
    if (!runId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("prepare_hr_payroll_run", { p_run_id: runId });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage(`${Number(data ?? 0)} employee payroll item(s) prepared. Enter/verify taxes before approval.`);
    await load();
    await loadItems(runId);
  }

  async function approveRun() {
    if (!runId || !window.confirm("Approve this payroll calculation? Actual payment is recorded separately in Finance.")) return;
    const { error } = await supabase.rpc("set_hr_payroll_run_status", { p_run_id: runId, p_status: "approved" });
    if (error) return setMessage(error.message);
    setMessage("Payroll approved. Record actual employee payments in Finance; settlement below updates from posted Finance transactions.");
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
    if (error) return setMessage(error.message);
    setEditing(null);
    setMessage("Tax values saved and net pay recalculated.");
    await loadItems(runId);
  }

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.employee_id, employee])), [employees]);
  const settlementMap = useMemo(() => new Map(settlements.map((settlement) => [settlement.payroll_item_id, settlement])), [settlements]);
  const selectedRun = runs.find((run) => run.id === runId);
  const selectedPeriod = periods.find((period) => period.id === periodId);
  const totals = useMemo(() => items.reduce((acc, item) => ({
    gross: acc.gross + n(item.gross_pay),
    tax: acc.tax + n(item.federal_income_tax) + n(item.state_income_tax) + n(item.local_income_tax) + n(item.social_security_tax) + n(item.medicare_tax),
    net: acc.net + n(item.net_pay),
    cost: acc.cost + n(item.total_employer_cost),
  }), { gross: 0, tax: 0, net: 0, cost: 0 }), [items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Payroll</h1>
        <p className="mt-1 text-sm text-gray-500">Prepare payroll from compensation, attendance, bonus/commission, deductions, benefits and advances.</p>
      </div>
      <div className="rounded-2xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300"><b>Tax engine status:</b> manual verification required. Federal/state/local withholding tables are not hard-coded yet. Do not approve payroll until tax values are verified.</div>
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"><b>Payment source of truth:</b> Payroll approval does not move cash. Finance Paid, Remaining and payment status below are derived from posted Finance employee payments.</div>
      {message && <div className={card + " text-sm"}>{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={createPeriod} className={card + " space-y-3"}>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">New Payroll Period</h2>
          <input className={input} placeholder="Period code, e.g. 2026-BW-18" value={code} onChange={(event) => setCode(event.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Start<input className={input + " mt-1"} type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
            <label className="text-xs text-gray-500">End<input className={input + " mt-1"} type="date" value={end} onChange={(event) => setEnd(event.target.value)} required /></label>
          </div>
          <label className="text-xs text-gray-500">Pay date<input className={input + " mt-1"} type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} required /></label>
          <button className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white">Create Period</button>
        </form>

        <div className={card}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-gray-600">Payroll period<select className={input + " mt-1"} value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">Select period</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.period_code} · {period.period_start} → {period.period_end} · Pay {period.pay_date}</option>)}</select></label>
            <label className="text-sm text-gray-600">Run<select className={input + " mt-1"} value={runId} onChange={(event) => setRunId(event.target.value)}><option value="">Select run</option>{runs.filter((run) => !periodId || run.payroll_period_id === periodId).map((run) => <option key={run.id} value={run.id}>Run {run.run_number} · {run.status}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void createRun()} disabled={!periodId} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-gray-700 disabled:opacity-50">New Run</button>
            <button onClick={() => void prepare()} disabled={!runId || busy || selectedRun?.status === "approved" || selectedRun?.status === "paid"} className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Preparing..." : "Prepare / Recalculate"}</button>
            <button onClick={() => void approveRun()} disabled={selectedRun?.status !== "calculated"} className="h-9 rounded-lg border border-success-300 px-3 text-sm font-medium text-success-700 disabled:opacity-40">Approve</button>
          </div>
          {selectedPeriod && <p className="mt-3 text-xs text-gray-500">{selectedPeriod.period_code} · {selectedPeriod.status} · Pay date {selectedPeriod.pay_date}</p>}
          {selectedRun?.status === "paid" && <p className="mt-2 text-xs text-warning-600">Legacy run status is paid. New payment truth is derived from Finance settlement below.</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Gross pay", money.format(totals.gross)], ["Employee taxes", money.format(totals.tax)], ["Net pay", money.format(totals.net)], ["Employer cost", money.format(totals.cost)]].map(([label, value]) => <div key={label} className={card}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}
      </div>

      <div className={card + " overflow-hidden p-0"}>
        <div className="overflow-x-auto">
          <table className="min-w-[1300px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02]"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Pre-tax</th><th className="px-4 py-3 text-right">Taxes</th><th className="px-4 py-3 text-right">Post-tax</th><th className="px-4 py-3 text-right">Advance</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Finance Paid</th><th className="px-4 py-3 text-right">Remaining</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>{items.map((item) => {
              const employee = employeeMap.get(item.employee_id);
              const tax = n(item.federal_income_tax) + n(item.state_income_tax) + n(item.local_income_tax) + n(item.social_security_tax) + n(item.medicare_tax);
              const settlement = settlementMap.get(item.id) ?? { payroll_item_id: item.id, paid_amount: 0, remaining_amount: n(item.net_pay), payment_status: "unpaid" as const, latest_payment_at: null };
              return <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-3"><b>{employee?.full_name || item.employee_id}</b><p className="text-xs text-gray-500">{employee?.employee_number}</p></td>
                <td className="px-4 py-3 text-right">{n(item.regular_hours).toFixed(2)} + {n(item.overtime_hours).toFixed(2)} OT</td>
                <td className="px-4 py-3 text-right">{money.format(n(item.gross_pay))}</td>
                <td className="px-4 py-3 text-right">{money.format(n(item.pre_tax_deductions))}</td>
                <td className="px-4 py-3 text-right">{money.format(tax)}</td>
                <td className="px-4 py-3 text-right">{money.format(n(item.post_tax_deductions))}</td>
                <td className="px-4 py-3 text-right">{money.format(n(item.advance_repayment))}</td>
                <td className="px-4 py-3 text-right font-semibold">{money.format(n(item.net_pay))}</td>
                <td className="px-4 py-3 text-right font-medium text-success-700 dark:text-success-300">{money.format(n(settlement.paid_amount))}</td>
                <td className="px-4 py-3 text-right font-medium">{money.format(n(settlement.remaining_amount))}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${paymentStatusClass(settlement.payment_status)}`}>{settlement.payment_status}</span>{settlement.latest_payment_at ? <p className="mt-1 text-xs text-gray-500">{new Date(settlement.latest_payment_at).toLocaleDateString()}</p> : null}</td>
                <td className="px-4 py-3 text-right"><button disabled={selectedRun?.status === "approved" || selectedRun?.status === "paid"} onClick={() => beginTaxEdit(item)} className="text-xs font-medium text-brand-600 disabled:opacity-40">Taxes</button></td>
              </tr>;
            })}{items.length === 0 && <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-500">Create/select a run and click Prepare.</td></tr>}</tbody>
          </table>
        </div>
      </div>

      {editing && <form onSubmit={saveTaxes} className={card + " space-y-4"}>
        <div className="flex justify-between"><div><h2 className="font-semibold text-gray-800 dark:text-white/90">Manual Tax Entry</h2><p className="text-xs text-gray-500">{employeeMap.get(editing.employee_id)?.full_name}</p></div><button type="button" onClick={() => setEditing(null)} className="text-sm text-gray-500">Close</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-gray-500">Federal income tax<input className={input + " mt-1"} type="number" min="0" step="0.01" value={fed} onChange={(event) => setFed(event.target.value)} /></label>
          <label className="text-xs text-gray-500">State income tax<input className={input + " mt-1"} type="number" min="0" step="0.01" value={state} onChange={(event) => setState(event.target.value)} /></label>
          <label className="text-xs text-gray-500">Local income tax<input className={input + " mt-1"} type="number" min="0" step="0.01" value={local} onChange={(event) => setLocal(event.target.value)} /></label>
          <label className="text-xs text-gray-500">Social Security<input className={input + " mt-1"} type="number" min="0" step="0.01" value={ss} onChange={(event) => setSs(event.target.value)} /></label>
          <label className="text-xs text-gray-500">Medicare<input className={input + " mt-1"} type="number" min="0" step="0.01" value={medicare} onChange={(event) => setMedicare(event.target.value)} /></label>
          <label className="text-xs text-gray-500">Employer payroll taxes<input className={input + " mt-1"} type="number" min="0" step="0.01" value={employerTax} onChange={(event) => setEmployerTax(event.target.value)} /></label>
        </div>
        <div className="flex gap-2"><button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white">Save Taxes</button><button type="button" onClick={() => setEditing(null)} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-gray-700">Cancel</button></div>
      </form>}
    </div>
  );
}
