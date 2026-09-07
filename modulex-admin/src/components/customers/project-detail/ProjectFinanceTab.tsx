"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import ProjectFinancialSummary from "@/components/customers/ProjectFinancialSummary";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_SURFACE_CARD, ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
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
  createProjectPaymentRequirement,
  deleteProjectPaymentRequirement,
  loadProjectPaymentLedger,
  recordAndAllocateProjectPayment,
  type ProjectPaymentCurrencySummary,
  type ProjectPaymentLedger,
  type ProjectPaymentRequirement,
} from "@/lib/customers/project-payments";
import {
  loadProjectPaymentStatus,
  type ProjectCollectionState,
  type ProjectPaymentStatus,
} from "@/lib/customers/project-payment-status";
import { formatTimestampDate } from "@/lib/dates/usDate";
import DateInput from "@/components/form/DateInput";

type OrderTotalReference = {
  currencyCode: string;
  amount: number;
};

type Props = {
  projectId: string;
  canManageProjectPayments: boolean;
  canViewCostMargin: boolean;
  orderTotals: OrderTotalReference[];
};

type BadgeColor = "success" | "warning" | "error" | "info" | "light";

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectionBadge(state: ProjectCollectionState | string): BadgeColor {
  if (state === "received" || state === "paid") return "success";
  if (state === "partially_received" || state === "partially_paid") return "warning";
  if (state === "overdue") return "error";
  if (state === "cancelled") return "light";
  return "info";
}

function money(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function emptyCurrencySummary(currencyCode: string): ProjectPaymentCurrencySummary {
  return {
    currencyCode,
    expected: 0,
    received: 0,
    allocated: 0,
    unallocatedCredit: 0,
    remaining: 0,
    overdue: 0,
  };
}

export default function ProjectFinanceTab({ projectId, canManageProjectPayments, canViewCostMargin, orderTotals }: Props) {
  const [ledger, setLedger] = useState<ProjectPaymentLedger | null>(null);
  const [status, setStatus] = useState<ProjectPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showAddPlan, setShowAddPlan] = useState(false);
  const [requirementName, setRequirementName] = useState("");
  const [requirementAmount, setRequirementAmount] = useState("");
  const [requirementCurrency, setRequirementCurrency] = useState(orderTotals[0]?.currencyCode ?? "USD");
  const [requirementDueDate, setRequirementDueDate] = useState("");
  const [quickAmounts, setQuickAmounts] = useState<Record<string, string>>({});
  const [deletingRequirement, setDeletingRequirement] = useState<ProjectPaymentRequirement | null>(null);
  const [showProfitability, setShowProfitability] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (canManageProjectPayments) {
        const nextLedger = await loadProjectPaymentLedger(projectId);
        setLedger(nextLedger);
        setStatus(null);
        const defaultCurrency = nextLedger.currencies[0]?.currencyCode ?? orderTotals[0]?.currencyCode;
        if (defaultCurrency) setRequirementCurrency(defaultCurrency);
      } else {
        const nextStatus = await loadProjectPaymentStatus(projectId);
        setStatus(nextStatus);
        setLedger(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project payment information could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canManageProjectPayments, orderTotals, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const commercialSummaries = useMemo(() => {
    const ledgerByCurrency = new Map((ledger?.currencies ?? []).map((summary) => [summary.currencyCode, summary]));
    const orderByCurrency = new Map(orderTotals.map((total) => [total.currencyCode, total.amount]));
    const currencies = new Set([...ledgerByCurrency.keys(), ...orderByCurrency.keys()]);

    return Array.from(currencies).sort().map((currencyCode) => {
      const summary = ledgerByCurrency.get(currencyCode) ?? emptyCurrencySummary(currencyCode);
      const orderValue = orderByCurrency.get(currencyCode) ?? 0;
      const balance = Math.max(orderValue - summary.received, 0);
      return { summary, orderValue, balance };
    });
  }, [ledger, orderTotals]);

  function quickAmount(requirement: ProjectPaymentRequirement) {
    return quickAmounts[requirement.id] ?? String(requirement.remaining);
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project payment action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentReceived(requirement: ProjectPaymentRequirement) {
    const amount = Number(quickAmount(requirement));
    if (!Number.isFinite(amount) || amount <= 0 || amount > requirement.remaining) return;

    await runAction(async () => {
      await recordAndAllocateProjectPayment({
        requirementId: requirement.id,
        amount,
        transactionDate: todayInput(),
      });
      setQuickAmounts((current) => {
        const next = { ...current };
        delete next[requirement.id];
        return next;
      });
    }, `${money(amount, requirement.currencyCode)} payment received and applied to ${requirement.name}.`);
  }

  async function handleCreatePlan() {
    await runAction(async () => {
      await createProjectPaymentRequirement({
        projectId,
        name: requirementName,
        amount: Number(requirementAmount),
        currencyCode: requirementCurrency,
        dueDate: requirementDueDate || null,
      });
      setRequirementName("");
      setRequirementAmount("");
      setRequirementDueDate("");
      setShowAddPlan(false);
    }, "Payment Plan added.");
  }

  async function handleDeleteRequirement() {
    if (!deletingRequirement || deletingRequirement.received !== 0) return;
    const planName = deletingRequirement.name;
    await runAction(async () => {
      await deleteProjectPaymentRequirement({ requirementId: deletingRequirement.id });
      setDeletingRequirement(null);
    }, `${planName} was deleted. No posted payment history was changed.`);
  }

  if (!canManageProjectPayments) {
    return (
      <div className="space-y-6">
        {error ? <Alert variant="error" title="Collection status unavailable" message={error} /> : null}
        <ComponentCard
          title="Customer Payment Status"
          desc="Sales view shows collection progress only. Payment amounts, cost, margin and outgoing Project finance are restricted."
        >
          {loading ? <p className="text-sm" role="status">Loading collection status…</p> : null}
          {!loading && status ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-sm font-medium ${ADMIN_TEXT_STYLES.body}`}>Overall</span>
                <Badge color={collectionBadge(status.overallStatus)}>{statusLabel(status.overallStatus)}</Badge>
              </div>
              <TableViewport>
                <Table variant="admin" minWidth="standard">
                  <TableHeader variant="admin">
                    <TableRow>
                      <TableCell isHeader variant="admin">Milestone</TableCell>
                      <TableCell isHeader variant="admin">Due</TableCell>
                      <TableCell isHeader variant="admin">Status</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody variant="admin">
                    {status.requirements.length === 0 ? <TableStateRow colSpan={3}>No payment milestones have been defined yet.</TableStateRow> : null}
                    {status.requirements.map((requirement) => (
                      <TableRow key={requirement.id}>
                        <TableCell variant="admin">{requirement.name}</TableCell>
                        <TableCell variant="admin">{displayDate(requirement.dueDate)}</TableCell>
                        <TableCell variant="admin"><Badge color={collectionBadge(requirement.status)}>{statusLabel(requirement.status)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableViewport>
            </div>
          ) : null}
        </ComponentCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Project payment action failed" message={error} /> : null}
      {message ? <Alert variant="success" title="Project payment updated" message={message} /> : null}

      {loading && !ledger ? <p className="text-sm" role="status">Loading Project payment ledger…</p> : null}

      <div className="space-y-4">
        {commercialSummaries.map(({ summary, orderValue, balance }) => (
          <div key={summary.currencyCode} className="space-y-3">
            {commercialSummaries.length > 1 ? (
              <p className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>{summary.currencyCode}</p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Order Value" value={money(orderValue, summary.currencyCode)} />
              <Metric label="Collected" value={money(summary.received, summary.currencyCode)} />
              <Metric label="Balance" value={money(balance, summary.currencyCode)} />
              <Metric label="Credit" value={money(summary.unallocatedCredit, summary.currencyCode)} />
            </div>
          </div>
        ))}
        {!loading && commercialSummaries.length === 0 ? (
          <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>No active Order value or customer payment has been recorded yet.</p>
        ) : null}
      </div>

      <ComponentCard
        title="Payment Plan"
        desc="Create the collection plan, then record received cash directly from the matching plan row. Plans with posted payment history remain immutable."
        headerAction={<Button size="sm" onClick={() => setShowAddPlan(true)}>Add Plan</Button>}
      >
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Plan</TableCell>
                <TableCell isHeader variant="admin">Expected</TableCell>
                <TableCell isHeader variant="admin">Paid</TableCell>
                <TableCell isHeader variant="admin">Remaining</TableCell>
                <TableCell isHeader variant="admin">Receive Payment</TableCell>
                <TableCell isHeader variant="admin">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {(ledger?.requirements.length ?? 0) === 0 ? <TableStateRow colSpan={6}>No Payment Plan has been created yet.</TableStateRow> : null}
              {(ledger?.requirements ?? []).map((requirement) => {
                const amountValue = quickAmount(requirement);
                const amountNumber = Number(amountValue);
                const canReceive = requirement.remaining > 0
                  && Number.isFinite(amountNumber)
                  && amountNumber > 0
                  && amountNumber <= requirement.remaining;
                return (
                  <TableRow key={requirement.id}>
                    <TableCell variant="admin">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{requirement.name}</span>
                          <Badge color={collectionBadge(requirement.status)}>{statusLabel(requirement.status)}</Badge>
                        </div>
                        <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Due {displayDate(requirement.dueDate)}</p>
                      </div>
                    </TableCell>
                    <TableCell variant="admin">{money(requirement.amount, requirement.currencyCode)}</TableCell>
                    <TableCell variant="admin">{money(requirement.received, requirement.currencyCode)}</TableCell>
                    <TableCell variant="admin">{money(requirement.remaining, requirement.currencyCode)}</TableCell>
                    <TableCell variant="admin">
                      {requirement.remaining > 0 ? (
                        <div className="flex min-w-72 items-center gap-2">
                          <Input
                            id={`plan-payment-${requirement.id}`}
                            aria-label={`Payment received for ${requirement.name}`}
                            type="number"
                            min="0"
                            max={requirement.remaining}
                            step="0.01"
                            value={amountValue}
                            onChange={(event) => setQuickAmounts((current) => ({ ...current, [requirement.id]: event.target.value }))}
                          />
                          <Button size="sm" disabled={saving || !canReceive} onClick={() => void handlePaymentReceived(requirement)}>
                            Payment Received
                          </Button>
                        </div>
                      ) : (
                        <Badge color="success">Paid</Badge>
                      )}
                    </TableCell>
                    <TableCell variant="admin">
                      {requirement.received === 0 ? (
                        <Button size="sm" variant="danger" disabled={saving} onClick={() => setDeletingRequirement(requirement)}>
                          Delete Plan
                        </Button>
                      ) : (
                        <span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Locked by payment history</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <ComponentCard
        title="Payment History"
        desc="Posted payment history is immutable. Use the canonical Finance void/reversal correction flow instead of destructive edits."
      >
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Type</TableCell>
                <TableCell isHeader variant="admin">Amount</TableCell>
                <TableCell isHeader variant="admin">Applied</TableCell>
                <TableCell isHeader variant="admin">Credit</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {(ledger?.transactions.length ?? 0) === 0 ? <TableStateRow colSpan={6}>No customer payment has been recorded yet.</TableStateRow> : null}
              {(ledger?.transactions ?? []).map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell variant="admin">{displayDate(transaction.transactionDate)}</TableCell>
                  <TableCell variant="admin">{statusLabel(transaction.transactionType)}</TableCell>
                  <TableCell variant="admin">{money(transaction.amount, transaction.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(transaction.allocated, transaction.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(transaction.unallocated, transaction.currencyCode)}</TableCell>
                  <TableCell variant="admin">
                    <Badge color={transaction.status === "posted" ? "success" : "light"}>{statusLabel(transaction.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      {canViewCostMargin ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowProfitability((current) => !current)}>
              {showProfitability ? "Hide Project Profitability" : "Show Project Profitability"}
            </Button>
          </div>
          {showProfitability ? <ProjectFinancialSummary projectId={projectId} /> : null}
        </div>
      ) : null}

      <Modal
        isOpen={showAddPlan}
        onClose={() => !saving && setShowAddPlan(false)}
        ariaLabel="Add Payment Plan"
        className="relative w-full max-w-2xl p-6"
      >
        <div className="space-y-5">
          <div className="pr-12">
            <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Add Plan</h3>
            <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Add one expected customer payment milestone. You can record the payment directly from the plan row afterward.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="requirement-name">Plan name</Label><Input id="requirement-name" value={requirementName} onChange={(event) => setRequirementName(event.target.value)} /></div>
            <div><Label htmlFor="requirement-amount">Amount</Label><Input id="requirement-amount" type="number" min="0" step="0.01" value={requirementAmount} onChange={(event) => setRequirementAmount(event.target.value)} /></div>
            <div><Label htmlFor="requirement-currency">Currency</Label><Input id="requirement-currency" value={requirementCurrency} maxLength={3} onChange={(event) => setRequirementCurrency(event.target.value.toUpperCase())} /></div>
            <div><Label htmlFor="requirement-due">Due date</Label><DateInput id="requirement-due" value={requirementDueDate} onChange={(event) => setRequirementDueDate(event)} /></div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" disabled={saving} onClick={() => setShowAddPlan(false)}>Cancel</Button>
            <Button
              disabled={saving || !requirementName.trim() || Number(requirementAmount) <= 0 || requirementCurrency.trim().length !== 3}
              onClick={() => void handleCreatePlan()}
            >
              {saving ? "Adding…" : "Add Plan"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deletingRequirement)}
        onClose={() => !saving && setDeletingRequirement(null)}
        ariaLabel="Delete Payment Plan"
        className="relative w-full max-w-xl p-6"
      >
        <div className="space-y-5">
          <div className="pr-12">
            <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Delete Plan</h3>
            <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Only a plan with no posted payment history can be deleted. Once cash is posted, the plan remains part of the immutable ledger history.</p>
          </div>
          {deletingRequirement ? (
            <Alert
              variant="warning"
              title="Delete Payment Plan"
              message={`${deletingRequirement.name} — ${money(deletingRequirement.amount, deletingRequirement.currencyCode)}. Applied cash: ${money(deletingRequirement.received, deletingRequirement.currencyCode)}.`}
            />
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" disabled={saving} onClick={() => setDeletingRequirement(null)}>Cancel</Button>
            <Button variant="danger" disabled={saving || deletingRequirement?.received !== 0} onClick={() => void handleDeleteRequirement()}>
              {saving ? "Deleting…" : "Delete Plan"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${ADMIN_SURFACE_CARD} p-4`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>{label}</p>
      <p className={`mt-2 text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{value}</p>
    </div>
  );
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  return formatTimestampDate(value);
}
