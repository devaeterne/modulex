"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import ProjectFinancialSummary from "@/components/customers/ProjectFinancialSummary";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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
  allocateProjectPayment,
  createProjectPaymentRequirement,
  loadProjectPaymentLedger,
  recordProjectPayment,
  reverseProjectPayment,
  type ProjectPaymentLedger,
} from "@/lib/customers/project-payments";
import {
  loadProjectPaymentStatus,
  type ProjectCollectionState,
  type ProjectPaymentStatus,
} from "@/lib/customers/project-payment-status";

type Props = {
  projectId: string;
  canManageProjectPayments: boolean;
  canViewCostMargin: boolean;
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

export default function ProjectFinanceTab({ projectId, canManageProjectPayments, canViewCostMargin }: Props) {
  const [ledger, setLedger] = useState<ProjectPaymentLedger | null>(null);
  const [status, setStatus] = useState<ProjectPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [requirementName, setRequirementName] = useState("");
  const [requirementAmount, setRequirementAmount] = useState("");
  const [requirementCurrency, setRequirementCurrency] = useState("USD");
  const [requirementDueDate, setRequirementDueDate] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [paymentDate, setPaymentDate] = useState(todayInput());
  const [paymentReference, setPaymentReference] = useState("");

  const [allocationPaymentId, setAllocationPaymentId] = useState("");
  const [allocationRequirementId, setAllocationRequirementId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");

  const [reversePaymentId, setReversePaymentId] = useState("");
  const [reverseAmount, setReverseAmount] = useState("");
  const [reverseReason, setReverseReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (canManageProjectPayments) {
        const nextLedger = await loadProjectPaymentLedger(projectId);
        setLedger(nextLedger);
        setStatus(null);
        const defaultCurrency = nextLedger.currencies[0]?.currencyCode;
        if (defaultCurrency) {
          setRequirementCurrency((current) => current || defaultCurrency);
          setPaymentCurrency((current) => current || defaultCurrency);
        }
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
  }, [canManageProjectPayments, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const paymentOptions = useMemo(
    () => (ledger?.transactions ?? [])
      .filter((transaction) => transaction.transactionType === "payment" && transaction.status === "posted" && transaction.unallocated > 0)
      .map((transaction) => ({
        value: transaction.id,
        label: `${displayDate(transaction.transactionDate)} — ${money(transaction.unallocated, transaction.currencyCode)} available`,
      })),
    [ledger]
  );

  const requirementOptions = useMemo(
    () => (ledger?.requirements ?? [])
      .filter((requirement) => !["paid", "cancelled"].includes(requirement.status) && requirement.remaining > 0)
      .map((requirement) => ({
        value: requirement.id,
        label: `${requirement.name} — ${money(requirement.remaining, requirement.currencyCode)} remaining`,
      })),
    [ledger]
  );

  const reversibleOptions = useMemo(
    () => (ledger?.transactions ?? [])
      .filter((transaction) => transaction.transactionType === "payment" && transaction.status === "posted")
      .map((transaction) => ({
        value: transaction.id,
        label: `${displayDate(transaction.transactionDate)} — ${money(transaction.amount, transaction.currencyCode)}`,
      })),
    [ledger]
  );

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

      <ComponentCard
        title="Customer Receivables"
        desc="Payment plan and actual customer cash are separate from invoice issuance. Currency totals are never silently converted."
      >
        {loading && !ledger ? <p className="text-sm" role="status">Loading Project payment ledger…</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {(ledger?.currencies ?? []).map((summary) => (
            <div key={summary.currencyCode} className="contents">
              <Metric label={`${summary.currencyCode} Expected`} value={money(summary.expected, summary.currencyCode)} />
              <Metric label="Received" value={money(summary.received, summary.currencyCode)} />
              <Metric label="Remaining" value={money(summary.remaining, summary.currencyCode)} />
              <Metric label="Overdue" value={money(summary.overdue, summary.currencyCode)} />
              <Metric label="Unallocated Credit" value={money(summary.unallocatedCredit, summary.currencyCode)} />
            </div>
          ))}
          {!loading && (ledger?.currencies.length ?? 0) === 0 ? (
            <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>No customer payment plan or payment transaction has been recorded yet.</p>
          ) : null}
        </div>
      </ComponentCard>

      <ComponentCard title="Payment Plan" desc="Order totals are a reference; milestones are not locked 1:1 to Orders.">
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Milestone</TableCell>
                <TableCell isHeader variant="admin">Due</TableCell>
                <TableCell isHeader variant="admin">Expected</TableCell>
                <TableCell isHeader variant="admin">Received</TableCell>
                <TableCell isHeader variant="admin">Remaining</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {(ledger?.requirements.length ?? 0) === 0 ? <TableStateRow colSpan={6}>No payment milestones have been defined yet.</TableStateRow> : null}
              {(ledger?.requirements ?? []).map((requirement) => (
                <TableRow key={requirement.id}>
                  <TableCell variant="admin">{requirement.name}</TableCell>
                  <TableCell variant="admin">{displayDate(requirement.dueDate)}</TableCell>
                  <TableCell variant="admin">{money(requirement.amount, requirement.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(requirement.received, requirement.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(requirement.remaining, requirement.currencyCode)}</TableCell>
                  <TableCell variant="admin"><Badge color={collectionBadge(requirement.status)}>{statusLabel(requirement.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><Label htmlFor="requirement-name">Milestone</Label><Input id="requirement-name" value={requirementName} onChange={(event) => setRequirementName(event.target.value)} /></div>
          <div><Label htmlFor="requirement-amount">Expected amount</Label><Input id="requirement-amount" type="number" min="0" step="0.01" value={requirementAmount} onChange={(event) => setRequirementAmount(event.target.value)} /></div>
          <div><Label htmlFor="requirement-currency">Currency</Label><Input id="requirement-currency" value={requirementCurrency} maxLength={3} onChange={(event) => setRequirementCurrency(event.target.value.toUpperCase())} /></div>
          <div><Label htmlFor="requirement-due">Due date</Label><Input id="requirement-due" type="date" value={requirementDueDate} onChange={(event) => setRequirementDueDate(event.target.value)} /></div>
        </div>
        <div className="flex justify-end">
          <Button disabled={saving || !requirementName.trim() || Number(requirementAmount) <= 0} onClick={() => void runAction(async () => {
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
          }, "Payment milestone added.")}>Add Requirement</Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Customer Payments" desc="Actual cash received. Payments may be recorded before an Invoice exists.">
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Type</TableCell>
                <TableCell isHeader variant="admin">Reference</TableCell>
                <TableCell isHeader variant="admin">Amount</TableCell>
                <TableCell isHeader variant="admin">Allocated</TableCell>
                <TableCell isHeader variant="admin">Unallocated</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {(ledger?.transactions.length ?? 0) === 0 ? <TableStateRow colSpan={6}>No customer payment transaction has been recorded yet.</TableStateRow> : null}
              {(ledger?.transactions ?? []).map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell variant="admin">{displayDate(transaction.transactionDate)}</TableCell>
                  <TableCell variant="admin">{statusLabel(transaction.transactionType)}</TableCell>
                  <TableCell variant="admin">{transaction.referenceNo || "—"}</TableCell>
                  <TableCell variant="admin">{money(transaction.amount, transaction.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(transaction.allocated, transaction.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(transaction.unallocated, transaction.currencyCode)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><Label htmlFor="payment-amount">Payment amount</Label><Input id="payment-amount" type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></div>
          <div><Label htmlFor="payment-currency">Currency</Label><Input id="payment-currency" value={paymentCurrency} maxLength={3} onChange={(event) => setPaymentCurrency(event.target.value.toUpperCase())} /></div>
          <div><Label htmlFor="payment-date">Transaction date</Label><Input id="payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div>
          <div><Label htmlFor="payment-reference">Reference</Label><Input id="payment-reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></div>
        </div>
        <div className="flex justify-end">
          <Button disabled={saving || Number(paymentAmount) <= 0 || paymentCurrency.length !== 3} onClick={() => void runAction(async () => {
            await recordProjectPayment({
              projectId,
              amount: Number(paymentAmount),
              currencyCode: paymentCurrency,
              transactionDate: paymentDate,
              referenceNo: paymentReference || null,
            });
            setPaymentAmount("");
            setPaymentReference("");
          }, "Customer payment recorded.")}>Record Payment</Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Allocate Payment" desc="Apply available Project customer credit to one expected milestone explicitly.">
        <div className="grid gap-4 md:grid-cols-3">
          <div><Label htmlFor="allocation-payment">Payment</Label><Select id="allocation-payment" options={paymentOptions} value={allocationPaymentId} onChange={setAllocationPaymentId} placeholder="Select payment" allowEmpty /></div>
          <div><Label htmlFor="allocation-requirement">Milestone</Label><Select id="allocation-requirement" options={requirementOptions} value={allocationRequirementId} onChange={setAllocationRequirementId} placeholder="Select milestone" allowEmpty /></div>
          <div><Label htmlFor="allocation-amount">Amount</Label><Input id="allocation-amount" type="number" min="0" step="0.01" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} /></div>
        </div>
        <div className="flex justify-end">
          <Button disabled={saving || !allocationPaymentId || !allocationRequirementId || Number(allocationAmount) <= 0} onClick={() => void runAction(async () => {
            await allocateProjectPayment({ paymentId: allocationPaymentId, requirementId: allocationRequirementId, amount: Number(allocationAmount) });
            setAllocationAmount("");
          }, "Payment allocation recorded.")}>Allocate Payment</Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Reverse Payment" desc="Posted cash is corrected through an append-safe reversal rather than destructive edits.">
        <div className="grid gap-4 md:grid-cols-3">
          <div><Label htmlFor="reverse-payment">Payment</Label><Select id="reverse-payment" options={reversibleOptions} value={reversePaymentId} onChange={setReversePaymentId} placeholder="Select payment" allowEmpty /></div>
          <div><Label htmlFor="reverse-amount">Reversal amount</Label><Input id="reverse-amount" type="number" min="0" step="0.01" value={reverseAmount} onChange={(event) => setReverseAmount(event.target.value)} /></div>
          <div><Label htmlFor="reverse-reason">Reason</Label><Input id="reverse-reason" value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" disabled={saving || !reversePaymentId || Number(reverseAmount) <= 0 || !reverseReason.trim()} onClick={() => void runAction(async () => {
            await reverseProjectPayment({ paymentId: reversePaymentId, amount: Number(reverseAmount), reason: reverseReason });
            setReverseAmount("");
            setReverseReason("");
          }, "Payment reversal recorded.")}>Reverse Payment</Button>
        </div>
      </ComponentCard>

      {canViewCostMargin ? <ProjectFinancialSummary projectId={projectId} /> : null}
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
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
