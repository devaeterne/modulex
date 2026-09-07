"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
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
import { getFinanceAccounts, type FinanceAccount } from "@/lib/finance/core";
import { getApAgingSummary, type ApAgingSummary } from "@/lib/finance/apAging";
import { getArAgingSummary, type ArAgingSummary } from "@/lib/finance/arAging";
import {
  getFinanceAccountMovementsPage,
  getFinanceCashFlowSeries,
  getFinanceProjectActualsPage,
  getFinanceReportingSummary,
  type FinanceAccountMovementRow,
  type FinanceCashFlowPoint,
  type FinanceProjectActualsRow,
  type FinanceReportingSummary,
} from "@/lib/finance/reports";

const PAGE_SIZE = 20;

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function defaultFromDate() {
  const value = new Date();
  value.setMonth(value.getMonth() - 11, 1);
  return dateInput(value);
}

function money(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function signedMoney(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  const formatted = money(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function displayDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p> : null}
    </div>
  );
}

export default function FinanceReportsWorkspace() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [summary, setSummary] = useState<FinanceReportingSummary | null>(null);
  const [arSummary, setArSummary] = useState<ArAgingSummary | null>(null);
  const [apSummary, setApSummary] = useState<ApAgingSummary | null>(null);
  const [cashFlow, setCashFlow] = useState<FinanceCashFlowPoint[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [accountMovements, setAccountMovements] = useState<FinanceAccountMovementRow[]>([]);
  const [accountOffset, setAccountOffset] = useState(0);
  const [projects, setProjects] = useState<FinanceProjectActualsRow[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectOffset, setProjectOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [movementLoading, setMovementLoading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseCurrency = summary?.base_currency_code ?? arSummary?.base_currency_code ?? apSummary?.base_currency_code ?? "USD";

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextAr, nextAp, nextCashFlow, nextAccounts] = await Promise.all([
        getFinanceReportingSummary({ from, to }),
        getArAgingSummary({ asOf: to || null }),
        getApAgingSummary({ asOf: to || null }),
        getFinanceCashFlowSeries({ from, to, grain: "month" }),
        getFinanceAccounts(),
      ]);
      setSummary(nextSummary);
      setArSummary(nextAr);
      setApSummary(nextAp);
      setCashFlow(nextCashFlow);
      setAccounts(nextAccounts);
      setSelectedAccountId((current) => current || nextAccounts.find((account) => account.is_active)?.id || nextAccounts[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Finance reporting could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const loadProjects = useCallback(async () => {
    setProjectLoading(true);
    try {
      const rows = await getFinanceProjectActualsPage({
        from,
        to,
        limit: PAGE_SIZE,
        offset: projectOffset,
        search: projectSearch,
      });
      setProjects(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project Finance actuals could not be loaded.");
    } finally {
      setProjectLoading(false);
    }
  }, [from, projectOffset, projectSearch, to]);

  const loadAccountMovements = useCallback(async () => {
    if (!selectedAccountId) {
      setAccountMovements([]);
      return;
    }
    setMovementLoading(true);
    try {
      const rows = await getFinanceAccountMovementsPage({
        accountId: selectedAccountId,
        from,
        to,
        limit: PAGE_SIZE,
        offset: accountOffset,
      });
      setAccountMovements(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Account movements could not be loaded.");
    } finally {
      setMovementLoading(false);
    }
  }, [accountOffset, from, selectedAccountId, to]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadAccountMovements();
  }, [loadAccountMovements]);

  const accountTotal = accountMovements[0]?.total_count ?? 0;
  const projectTotal = projects[0]?.total_count ?? 0;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const hasUnconverted = Boolean(
    (summary?.unconverted_count ?? 0) > 0
      || (arSummary?.unconverted_invoice_count ?? 0) > 0
      || (apSummary?.unconverted_bill_count ?? 0) > 0,
  );

  const cashFlowTotals = useMemo(() => ({
    events: cashFlow.reduce((sum, point) => sum + Number(point.posted_event_count || 0), 0),
    unconverted: cashFlow.reduce((sum, point) => sum + Number(point.unconverted_count || 0), 0),
  }), [cashFlow]);

  function applyFilters() {
    setAccountOffset(0);
    setProjectOffset(0);
    void loadReport();
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Finance Reports unavailable" message={error} /> : null}
      {hasUnconverted ? (
        <Alert
          variant="warning"
          title="Some base-currency totals are unavailable"
          message="Historical reporting does not invent a current FX rate. Rows without a stored transaction-time/base snapshot remain visible but affected base totals fail closed."
        />
      ) : null}

      <ComponentCard title="Reporting Period" desc="Finance actuals use posted transaction-time snapshots. AR/AP remain canonical source projections as of the selected end date.">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label htmlFor="finance-report-from" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">From</label>
            <input
              id="finance-report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </div>
          <div>
            <label htmlFor="finance-report-to" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">To</label>
            <input
              id="finance-report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </div>
          <Button onClick={applyFilters} disabled={loading}>Refresh Reports</Button>
        </div>
      </ComponentCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Metric label="Operating Income" value={money(summary?.operating_income_base ?? null, baseCurrency)} helper="Posted Customer Receipts, net of Finance reversals" />
        <Metric label="Operating Expense" value={money(summary?.operating_expense_base ?? null, baseCurrency)} helper="Expense, Vendor Payment and Employee Payment actuals" />
        <Metric label="Operating Result" value={money(summary?.operating_result_base ?? null, baseCurrency)} helper="Operating income minus operating expense" />
        <Metric label="Net Cash Change" value={signedMoney(summary?.net_cash_change_base ?? null, baseCurrency)} helper="Company-wide posted account movement; transfers net to zero" />
        <Metric label="Open AR" value={money(arSummary?.open_ar_base_amount ?? null, baseCurrency)} helper={`${arSummary?.open_invoice_count ?? 0} open Invoice(s)`} />
        <Metric label="Open AP" value={money(apSummary?.open_ap_base_amount ?? null, baseCurrency)} helper={`${apSummary?.open_bill_count ?? 0} open Vendor Bill(s)`} />
      </div>

      <ComponentCard
        title="Cash Flow"
        desc={`Monthly Finance Core movement for the selected period. ${cashFlowTotals.events} posted event(s); ${cashFlowTotals.unconverted} unconverted.`}
      >
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Period</TableCell>
                <TableCell isHeader variant="admin">Operating Income</TableCell>
                <TableCell isHeader variant="admin">Operating Expense</TableCell>
                <TableCell isHeader variant="admin">Other In</TableCell>
                <TableCell isHeader variant="admin">Other Out</TableCell>
                <TableCell isHeader variant="admin">Net Cash</TableCell>
                <TableCell isHeader variant="admin">Events</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={7}>Loading cash flow…</TableStateRow> : null}
              {!loading && cashFlow.length === 0 ? <TableStateRow colSpan={7}>No posted Finance movement exists in this period.</TableStateRow> : null}
              {cashFlow.map((point) => (
                <TableRow key={point.period_start}>
                  <TableCell variant="admin">{displayDate(point.period_start)}</TableCell>
                  <TableCell variant="admin">{money(point.operating_income_base, point.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{money(point.operating_expense_base, point.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{money(point.other_cash_inflow_base, point.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{money(point.other_cash_outflow_base, point.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{signedMoney(point.net_cash_change_base, point.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{point.posted_event_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <ComponentCard title="Account Movements" desc="Account-side cash movement from posted Finance transactions. Reversals offset the original; transfers appear on both affected accounts.">
        <div className="mb-4 max-w-md">
          <label htmlFor="finance-report-account" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Finance account</label>
          <select
            id="finance-report-account"
            value={selectedAccountId}
            onChange={(event) => {
              setSelectedAccountId(event.target.value);
              setAccountOffset(0);
            }}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {accounts.length === 0 ? <option value="">No Finance accounts</option> : null}
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency_code}</option>)}
          </select>
        </div>
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Kind</TableCell>
                <TableCell isHeader variant="admin">Reference</TableCell>
                <TableCell isHeader variant="admin">Counter Account</TableCell>
                <TableCell isHeader variant="admin">Account Delta</TableCell>
                <TableCell isHeader variant="admin">Base Delta</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {movementLoading ? <TableStateRow colSpan={6}>Loading account movement…</TableStateRow> : null}
              {!movementLoading && accountMovements.length === 0 ? <TableStateRow colSpan={6}>No posted movement for this account and period.</TableStateRow> : null}
              {accountMovements.map((row) => (
                <TableRow key={row.transaction_id}>
                  <TableCell variant="admin">{displayDate(row.transaction_at)}</TableCell>
                  <TableCell variant="admin">{row.transaction_kind === "reversal" ? `Reversal · ${row.business_kind ?? "transaction"}` : row.business_kind ?? row.transaction_kind}</TableCell>
                  <TableCell variant="admin">{row.reference_no || "—"}</TableCell>
                  <TableCell variant="admin">{row.counter_account_name || "External"}</TableCell>
                  <TableCell variant="admin">{signedMoney(row.account_delta_amount, row.currency_code)}</TableCell>
                  <TableCell variant="admin">{signedMoney(row.account_delta_base, row.base_currency_code || baseCurrency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{selectedAccount ? `${selectedAccount.name}: ` : ""}{accountTotal} movement(s)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={accountOffset === 0 || movementLoading} onClick={() => setAccountOffset((value) => Math.max(value - PAGE_SIZE, 0))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={accountOffset + PAGE_SIZE >= accountTotal || movementLoading} onClick={() => setAccountOffset((value) => value + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </ComponentCard>

      <ComponentCard title="Project Finance Actuals" desc="Only explicit Project/Order Finance allocations are included. No attribution is inferred from Customer, Invoice, Vendor or source-document links.">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label htmlFor="finance-project-search" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Search Projects</label>
            <input
              id="finance-project-search"
              type="search"
              value={projectSearch}
              placeholder="Project number, name or Customer"
              onChange={(event) => setProjectSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setProjectOffset(0);
                  void loadProjects();
                }
              }}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </div>
          <Button onClick={() => { setProjectOffset(0); void loadProjects(); }} disabled={projectLoading}>Search</Button>
        </div>
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Project</TableCell>
                <TableCell isHeader variant="admin">Customer</TableCell>
                <TableCell isHeader variant="admin">Income</TableCell>
                <TableCell isHeader variant="admin">Expense</TableCell>
                <TableCell isHeader variant="admin">Other Cash</TableCell>
                <TableCell isHeader variant="admin">Net Cash</TableCell>
                <TableCell isHeader variant="admin">Transactions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {projectLoading ? <TableStateRow colSpan={7}>Loading Project actuals…</TableStateRow> : null}
              {!projectLoading && projects.length === 0 ? <TableStateRow colSpan={7}>No matching Projects.</TableStateRow> : null}
              {projects.map((project) => (
                <TableRow key={project.project_id}>
                  <TableCell variant="admin">
                    <Link className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400" href={`/projects/${project.project_id}?tab=Finance`}>
                      {project.project_number} · {project.project_name}
                    </Link>
                  </TableCell>
                  <TableCell variant="admin">{project.customer_name || project.customer_code || "—"}</TableCell>
                  <TableCell variant="admin">{money(project.linked_operating_income_base, project.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{money(project.linked_operating_expense_base, project.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{signedMoney(project.linked_other_cash_base, project.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{signedMoney(project.linked_net_cash_base, project.base_currency_code)}</TableCell>
                  <TableCell variant="admin">{project.linked_transaction_count}{project.unconverted_allocation_count > 0 ? ` · ${project.unconverted_allocation_count} unconverted` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{projectTotal} Project(s)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={projectOffset === 0 || projectLoading} onClick={() => setProjectOffset((value) => Math.max(value - PAGE_SIZE, 0))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={projectOffset + PAGE_SIZE >= projectTotal || projectLoading} onClick={() => setProjectOffset((value) => value + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
