"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  cancelPaymentSchedule,
  createPaymentSchedule,
  getPaymentScheduleReferenceData,
  getPaymentSchedulesPage,
  updatePaymentSchedule,
  type PaymentScheduleDisplayStatus,
  type PaymentScheduleListItem,
  type PaymentScheduleReferenceData,
  type PaymentScheduleStatus,
} from "@/lib/finance/paymentSchedule";

const statusOptions = [
  { value: "planned", label: "Planned" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

function todayValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

function scheduleColor(status: PaymentScheduleDisplayStatus) {
  if (status === "settled") return "success" as const;
  if (status === "cancelled" || status === "overdue") return "error" as const;
  return "warning" as const;
}

export default function FinancePaymentScheduleManager() {
  const [referenceData, setReferenceData] = useState<PaymentScheduleReferenceData | null>(null);
  const [rows, setRows] = useState<PaymentScheduleListItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayValue());
  const [plannedAmount, setPlannedAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const profileResult = await getCurrentProfile();
      const [refs, nextRows] = await Promise.all([
        getPaymentScheduleReferenceData(),
        getPaymentSchedulesPage({
          limit: pageSize,
          offset: nextOffset,
          vendorId: vendorFilter || null,
          status: (statusFilter || null) as PaymentScheduleStatus | "overdue" | null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          search: search || null,
        }),
      ]);
      setReferenceData(refs);
      setRows(nextRows);
      setCanManage(hasPermission(profileResult.profile?.roles, "finance.manage"));
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0).catch((error) => setMessage({
      variant: "error",
      text: error instanceof Error ? error.message : "Payment Schedule could not be loaded.",
    }));
    // Initial route load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const billOptions = useMemo(
    () => (referenceData?.bills ?? []).map((bill) => ({
      value: bill.id,
      label: `${bill.vendor_name} · ${bill.invoice_number} · ${money(bill.unscheduled_amount, bill.currency_code)} unscheduled`,
    })),
    [referenceData],
  );
  const vendorOptions = useMemo(
    () => (referenceData?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.name}` })),
    [referenceData],
  );
  const methodOptions = useMemo(
    () => (referenceData?.payment_methods ?? []).map((method) => ({ value: method.id, label: method.name })),
    [referenceData],
  );
  const selectedBill = useMemo(
    () => referenceData?.bills.find((bill) => bill.id === invoiceId) ?? null,
    [invoiceId, referenceData],
  );
  const accountOptions = useMemo(
    () => (referenceData?.accounts ?? [])
      .filter((account) => !selectedBill || account.currency_code === selectedBill.currency_code)
      .map((account) => ({ value: account.id, label: `${account.name} · ${account.currency_code}` })),
    [referenceData, selectedBill],
  );
  const totalCount = Number(rows[0]?.total_count ?? 0);

  function chooseBill(value: string) {
    setInvoiceId(value);
    const bill = referenceData?.bills.find((item) => item.id === value);
    if (!bill) return;
    setPlannedAmount(bill.unscheduled_amount > 0 ? String(bill.unscheduled_amount) : "");
    setSourceAccountId("");
  }

  function resetForm() {
    setEditingId(null);
    setInvoiceId("");
    setScheduledDate(todayValue());
    setPlannedAmount("");
    setPaymentMethodId("");
    setSourceAccountId("");
    setNotes("");
    setCancelReason("");
  }

  function editRow(row: PaymentScheduleListItem) {
    setEditingId(row.id);
    setInvoiceId(row.invoice_id);
    setScheduledDate(row.scheduled_payment_date);
    setPlannedAmount(String(row.planned_amount));
    setPaymentMethodId(row.payment_method_id ?? "");
    setSourceAccountId(row.source_account_id ?? "");
    setNotes(row.notes ?? "");
    setCancelReason("");
    setMessage(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    const amount = Number(plannedAmount);
    if (!selectedBill) {
      setMessage({ variant: "error", text: "An open Vendor Bill is required." });
      return;
    }
    if (!scheduledDate || !Number.isFinite(amount) || amount <= 0) {
      setMessage({ variant: "error", text: "Scheduled date and a positive Planned amount are required." });
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updatePaymentSchedule(editingId, {
          scheduledPaymentDate: scheduledDate,
          plannedAmount: amount,
          paymentMethodId: paymentMethodId || null,
          sourceAccountId: sourceAccountId || null,
          notes,
        });
        setMessage({ variant: "success", text: "Payment Schedule updated. Due date and actual payment history were not changed." });
      } else {
        await createPaymentSchedule({
          vendorId: selectedBill.vendor_id,
          invoiceId: selectedBill.id,
          scheduledPaymentDate: scheduledDate,
          plannedAmount: amount,
          currencyCode: selectedBill.currency_code,
          paymentMethodId: paymentMethodId || null,
          sourceAccountId: sourceAccountId || null,
          notes,
        });
        setMessage({ variant: "success", text: "Payment Schedule created. No Finance transaction was posted." });
      }
      resetForm();
      await load(0);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Payment Schedule could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function cancelSelected() {
    if (!canManage || busy || !editingId) return;
    if (!cancelReason.trim()) {
      setMessage({ variant: "error", text: "Cancel reason is required." });
      return;
    }
    setBusy(true);
    try {
      await cancelPaymentSchedule(editingId, cancelReason);
      setMessage({ variant: "success", text: "Payment Schedule cancelled. Vendor Bill and payment ledger remain unchanged." });
      resetForm();
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Payment Schedule could not be cancelled." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Payment Schedule" : "Payment Schedule error"} message={message.text} /> : null}
      {!canManage && !loading ? <Alert variant="info" title="Read-only Finance access" message="Your role can review Vendor Bill due dates, scheduled dates, outstanding balances and planned payments but cannot change schedules." /> : null}

      {canManage ? (
        <ComponentCard title={editingId ? "Edit Planned Payment" : "Plan Vendor Payment"} desc="Due date is the bill obligation. Scheduled date is when Finance plans to pay. Posting and clearing remain separate Vendor Payment actions.">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2"><Label htmlFor="schedule-bill">Vendor Bill</Label><Select id="schedule-bill" options={billOptions} value={invoiceId} onChange={chooseBill} placeholder="Select open Vendor Bill" disabled={Boolean(editingId)} required /></div>
              <div><Label htmlFor="schedule-date">Scheduled date</Label><Input id="schedule-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required /></div>
              <div><Label htmlFor="schedule-amount">Planned amount</Label><Input id="schedule-amount" type="number" min="0.0001" step="0.0001" value={plannedAmount} onChange={(event) => setPlannedAmount(event.target.value)} required /></div>
              <div><Label htmlFor="schedule-method">Payment Method</Label><Select id="schedule-method" options={methodOptions} value={paymentMethodId} onChange={setPaymentMethodId} placeholder="Optional method" allowEmpty /></div>
              <div><Label htmlFor="schedule-account">Source account</Label><Select id="schedule-account" options={accountOptions} value={sourceAccountId} onChange={setSourceAccountId} placeholder="Optional account" allowEmpty /></div>
              {selectedBill ? <><div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Due date</span><div className="font-medium">{selectedBill.due_date || "Not set"}</div></div><div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Outstanding / Unscheduled</span><div className="font-medium">{money(selectedBill.outstanding_amount, selectedBill.currency_code)} / {money(selectedBill.unscheduled_amount, selectedBill.currency_code)}</div></div></> : null}
            </div>
            <div><Label htmlFor="schedule-notes">Notes</Label><TextArea id="schedule-notes" value={notes} onChange={setNotes} rows={2} /></div>
            {editingId ? <div><Label htmlFor="schedule-cancel-reason">Cancel reason</Label><Input id="schedule-cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Required only when cancelling" /></div> : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>{editingId ? "Save Planned Payment" : "Create Planned Payment"}</Button>
              {editingId ? <><Button type="button" variant="outline" disabled={busy} onClick={resetForm}>Cancel Edit</Button><Button type="button" variant="danger" disabled={busy} onClick={() => void cancelSelected()}>Cancel Planned Payment</Button></> : null}
            </div>
          </form>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Payment Schedule" desc="Planned rows never replace Vendor Bill payment allocations or Finance transactions. Outstanding is actual AP balance; Unscheduled is the part not covered by active plans.">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div><Label htmlFor="schedule-filter-vendor">Vendor</Label><Select id="schedule-filter-vendor" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors" allowEmpty /></div>
            <div><Label htmlFor="schedule-filter-status">Status</Label><Select id="schedule-filter-status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" allowEmpty /></div>
            <div><Label htmlFor="schedule-date-from">Scheduled from</Label><Input id="schedule-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div><Label htmlFor="schedule-date-to">Scheduled to</Label><Input id="schedule-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
            <div><Label htmlFor="schedule-search">Search</Label><Input id="schedule-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, bill, notes" /></div>
          </div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || busy} onClick={() => void load(0)}>Apply Filters</Button><Button variant="ghost" disabled={loading || busy} onClick={() => void load(offset)}>Retry / Refresh</Button></div>

          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Vendor / Bill</TableCell><TableCell isHeader variant="admin">Due date</TableCell><TableCell isHeader variant="admin">Scheduled date</TableCell><TableCell isHeader variant="admin" className="text-right">Planned</TableCell><TableCell isHeader variant="admin" className="text-right">Outstanding</TableCell><TableCell isHeader variant="admin" className="text-right">Unscheduled</TableCell><TableCell isHeader variant="admin">Payment Method / Source account</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Action</TableCell></TableRow></TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={9}>Loading Payment Schedule…</TableStateRow> : rows.length === 0 ? <TableStateRow colSpan={9}>No planned Vendor payments match the current filters.</TableStateRow> : rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell variant="admin"><span className="font-medium">{row.vendor_name}</span><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.invoice_number}</div></TableCell>
                    <TableCell variant="admin">{row.due_date || "—"}</TableCell>
                    <TableCell variant="admin" className="font-medium">{row.scheduled_payment_date}</TableCell>
                    <TableCell variant="admin" className="text-right font-medium">{money(row.planned_amount, row.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(row.outstanding_amount, row.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(row.scheduled_remaining_amount, row.currency_code)}</TableCell>
                    <TableCell variant="admin"><div>{row.payment_method_name || "Method not planned"}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.source_account_name || "Account not planned"}</div></TableCell>
                    <TableCell variant="admin"><Badge color={scheduleColor(row.display_status)}>{row.display_status}</Badge></TableCell>
                    <TableCell variant="admin">{canManage && row.status === "planned" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => editRow(row)}>Edit</Button> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Showing {rows.length} of {totalCount} scheduled payments</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button><Button size="sm" variant="outline" disabled={loading || offset + rows.length >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button></div></div>
        </div>
      </ComponentCard>
    </div>
  );
}
