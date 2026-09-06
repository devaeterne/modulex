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
  clearVendorPaymentInstrument,
  createVendorPaymentDraft,
  deleteVendorPaymentDraft,
  getVendorPaymentDetail,
  getVendorPaymentReferenceData,
  getVendorPaymentsPage,
  postVendorPayment,
  returnVendorPaymentInstrument,
  reverseVendorPayment,
  voidVendorPaymentInstrument,
  type PaymentInstrumentStatus,
  type VendorPaymentDetail,
  type VendorPaymentListItem,
  type VendorPaymentReferenceData,
  type VendorPaymentStatus,
} from "@/lib/finance/vendorPayments";

const paymentStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "voided", label: "Voided" },
];

const instrumentStatusOptions = [
  { value: "issued", label: "Issued" },
  { value: "cleared", label: "Cleared" },
  { value: "voided", label: "Voided" },
  { value: "returned", label: "Returned" },
];

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

function paymentColor(status: VendorPaymentStatus) {
  if (status === "posted") return "success" as const;
  if (status === "voided") return "error" as const;
  return "warning" as const;
}

function instrumentColor(status: PaymentInstrumentStatus | null) {
  if (status === "cleared") return "success" as const;
  if (status === "voided" || status === "returned") return "error" as const;
  if (status === "issued") return "warning" as const;
  return "light" as const;
}

export default function FinanceVendorPaymentsManager() {
  const [referenceData, setReferenceData] = useState<VendorPaymentReferenceData | null>(null);
  const [payments, setPayments] = useState<VendorPaymentListItem[]>([]);
  const [detail, setDetail] = useState<VendorPaymentDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [transactionAt, setTransactionAt] = useState(localDateTimeValue());
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [allocationInvoiceId, setAllocationInvoiceId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(localDateTimeValue());
  const [instrumentReference, setInstrumentReference] = useState("");
  const [instrumentNotes, setInstrumentNotes] = useState("");
  const [manualFxRate, setManualFxRate] = useState("");
  const [manualFxSource, setManualFxSource] = useState("");
  const [actionAt, setActionAt] = useState(localDateTimeValue());
  const [actionReason, setActionReason] = useState("");

  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [instrumentFilter, setInstrumentFilter] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const profileResult = await getCurrentProfile();
      const [refs, nextPayments] = await Promise.all([
        getVendorPaymentReferenceData(),
        getVendorPaymentsPage({
          limit: pageSize,
          offset: nextOffset,
          vendorId: vendorFilter || null,
          status: (statusFilter || null) as VendorPaymentStatus | null,
          paymentMethodId: methodFilter || null,
          instrumentStatus: (instrumentFilter || null) as PaymentInstrumentStatus | null,
          search: search || null,
        }),
      ]);
      setReferenceData(refs);
      setPayments(nextPayments);
      setCanManage(hasPermission(profileResult.profile?.roles, "finance.manage"));
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      setSelectedId(id);
      setDetail(await getVendorPaymentDetail(id));
    } finally {
      setDetailLoading(false);
    }
  }

  async function refresh() {
    await load(offset);
    if (selectedId) await loadDetail(selectedId);
  }

  useEffect(() => {
    void load(0).catch((error) => setMessage({
      variant: "error",
      text: error instanceof Error ? error.message : "Vendor Payments could not be loaded.",
    }));
    // Initial route load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendorOptions = useMemo(
    () => (referenceData?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.name}` })),
    [referenceData],
  );
  const methodOptions = useMemo(
    () => (referenceData?.payment_methods ?? []).map((method) => ({ value: method.id, label: method.name })),
    [referenceData],
  );
  const accountOptions = useMemo(
    () => (referenceData?.accounts ?? []).map((account) => ({ value: account.id, label: `${account.name} · ${account.currency_code}` })),
    [referenceData],
  );
  const totalCount = Number(payments[0]?.total_count ?? 0);
  const selectedMethodKey = String(detail?.payment_method?.system_key ?? "");
  const selectedInstrumentStatus = (detail?.instrument?.status ?? null) as PaymentInstrumentStatus | null;

  function chooseSource(value: string) {
    setSourceAccountId(value);
    const account = referenceData?.accounts.find((item) => item.id === value);
    if (account) setCurrencyCode(account.currency_code);
  }

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    const numericAmount = Number(amount);
    if (!vendorId || !sourceAccountId || !paymentMethodId) {
      setMessage({ variant: "error", text: "Vendor, source account and Payment Method are required." });
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ variant: "error", text: "Vendor Payment amount must be greater than zero." });
      return;
    }
    setBusy(true);
    try {
      const id = await createVendorPaymentDraft({
        vendorId,
        sourceAccountId,
        paymentMethodId,
        amount: numericAmount,
        currencyCode,
        transactionAt: new Date(transactionAt).toISOString(),
        referenceNo,
        notes,
      });
      setAmount("");
      setReferenceNo("");
      setNotes("");
      setMessage({ variant: "success", text: "Vendor Payment draft created." });
      await load(0);
      await loadDetail(id);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Payment draft could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function postSelected() {
    if (!canManage || busy || !selectedId || detail?.transaction.status !== "draft") return;
    const allocation = allocationAmount.trim() ? Number(allocationAmount) : null;
    if ((allocationInvoiceId && allocation === null) || (!allocationInvoiceId && allocation !== null)) {
      setMessage({ variant: "error", text: "Bill allocation requires both Bill ID and allocation amount." });
      return;
    }
    if (allocation !== null && (!Number.isFinite(allocation) || allocation <= 0)) {
      setMessage({ variant: "error", text: "Bill allocation amount must be greater than zero." });
      return;
    }
    const rate = manualFxRate.trim() ? Number(manualFxRate) : null;
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || !manualFxSource.trim())) {
      setMessage({ variant: "error", text: "Manual FX requires a positive rate and source." });
      return;
    }
    if (selectedMethodKey === "check" && (!checkNumber.trim() || !issuedAt)) {
      setMessage({ variant: "error", text: "Check number and issued time are required for Check payments." });
      return;
    }
    setBusy(true);
    try {
      await postVendorPayment({
        transactionId: selectedId,
        billAllocations: allocationInvoiceId && allocation !== null ? [{ invoice_id: allocationInvoiceId, amount: allocation }] : [],
        checkNumber: selectedMethodKey === "check" ? checkNumber : null,
        issuedAt: selectedMethodKey === "check" ? new Date(issuedAt).toISOString() : null,
        instrumentReference,
        instrumentNotes,
        manualFxRate: rate,
        manualFxSource,
      });
      setAllocationInvoiceId("");
      setAllocationAmount("");
      setCheckNumber("");
      setMessage({ variant: "success", text: "Vendor Payment posted. Allocated and Unapplied balances were reconciled." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Payment could not be posted." });
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!canManage || busy || !selectedId || detail?.transaction.status !== "draft") return;
    setBusy(true);
    try {
      await deleteVendorPaymentDraft(selectedId);
      setSelectedId(null);
      setDetail(null);
      setMessage({ variant: "success", text: "Vendor Payment draft deleted." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Payment draft could not be deleted." });
    } finally {
      setBusy(false);
    }
  }

  async function clearCheck() {
    if (!canManage || busy || !selectedId || selectedInstrumentStatus !== "issued") return;
    setBusy(true);
    try {
      await clearVendorPaymentInstrument(selectedId, new Date(actionAt).toISOString());
      setMessage({ variant: "success", text: "Check marked cleared. Posted money movement was not changed." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Check could not be cleared." });
    } finally {
      setBusy(false);
    }
  }

  async function voidCheck() {
    if (!canManage || busy || !selectedId || selectedInstrumentStatus !== "issued") return;
    if (!actionReason.trim()) {
      setMessage({ variant: "error", text: "Void reason is required." });
      return;
    }
    setBusy(true);
    try {
      await voidVendorPaymentInstrument(selectedId, new Date(actionAt).toISOString(), actionReason);
      setActionReason("");
      setMessage({ variant: "success", text: "Check voided and Finance/AP reversal created." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Check could not be voided." });
    } finally {
      setBusy(false);
    }
  }

  async function returnCheck() {
    if (!canManage || busy || !selectedId || !["issued", "cleared"].includes(selectedInstrumentStatus ?? "")) return;
    if (!actionReason.trim()) {
      setMessage({ variant: "error", text: "Return reason is required." });
      return;
    }
    setBusy(true);
    try {
      await returnVendorPaymentInstrument(selectedId, new Date(actionAt).toISOString(), actionReason);
      setActionReason("");
      setMessage({ variant: "success", text: "Check returned and Finance/AP reversal created." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Check could not be returned." });
    } finally {
      setBusy(false);
    }
  }

  async function reverseSelected() {
    if (!canManage || busy || !selectedId || detail?.transaction.status !== "posted" || detail.instrument) return;
    if (!actionReason.trim()) {
      setMessage({ variant: "error", text: "Reversal reason is required." });
      return;
    }
    setBusy(true);
    try {
      await reverseVendorPayment(selectedId, actionReason);
      setActionReason("");
      setMessage({ variant: "success", text: "Vendor Payment reversed and bill allocations reconciled." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Payment could not be reversed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Vendor Payments" : "Vendor Payments error"} message={message.text} /> : null}
      {!canManage && !loading ? <Alert variant="info" title="Read-only Finance access" message="Your role can review Vendor Payments, Check lifecycle, Allocated and Unapplied balances but cannot mutate Finance." /> : null}

      {canManage ? (
        <ComponentCard title="New Vendor Payment Draft" desc="Vendor Payment reuses the Finance ledger. Payment Method and canonical Vendor are required before posting.">
          <form onSubmit={submitDraft} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="vendor-payment-vendor">Vendor</Label><Select id="vendor-payment-vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select Vendor" required /></div>
              <div><Label htmlFor="vendor-payment-account">Source account</Label><Select id="vendor-payment-account" options={accountOptions} value={sourceAccountId} onChange={chooseSource} placeholder="Select account" required /></div>
              <div><Label htmlFor="vendor-payment-method">Payment Method</Label><Select id="vendor-payment-method" options={methodOptions} value={paymentMethodId} onChange={setPaymentMethodId} placeholder="Select method" required /></div>
              <div><Label htmlFor="vendor-payment-amount">Amount</Label><Input id="vendor-payment-amount" type="number" min="0.0001" step="0.0001" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
              <div><Label htmlFor="vendor-payment-currency">Currency</Label><Input id="vendor-payment-currency" maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required /></div>
              <div><Label htmlFor="vendor-payment-at">Transaction time</Label><Input id="vendor-payment-at" type="datetime-local" value={transactionAt} onChange={(event) => setTransactionAt(event.target.value)} required /></div>
              <div><Label htmlFor="vendor-payment-reference">Reference</Label><Input id="vendor-payment-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></div>
            </div>
            <div><Label htmlFor="vendor-payment-notes">Notes</Label><TextArea id="vendor-payment-notes" value={notes} onChange={setNotes} rows={2} /></div>
            <Button type="submit" disabled={busy}>Create Vendor Payment Draft</Button>
          </form>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Vendor Payments" desc="Posted is not the same as cleared. Check clearing is tracked separately from Finance posting.">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div><Label htmlFor="vendor-payment-filter-vendor">Vendor</Label><Select id="vendor-payment-filter-vendor" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors" allowEmpty /></div>
            <div><Label htmlFor="vendor-payment-filter-status">Payment status</Label><Select id="vendor-payment-filter-status" options={paymentStatusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" allowEmpty /></div>
            <div><Label htmlFor="vendor-payment-filter-method">Payment Method</Label><Select id="vendor-payment-filter-method" options={methodOptions} value={methodFilter} onChange={setMethodFilter} placeholder="All methods" allowEmpty /></div>
            <div><Label htmlFor="vendor-payment-filter-instrument">Check status</Label><Select id="vendor-payment-filter-instrument" options={instrumentStatusOptions} value={instrumentFilter} onChange={setInstrumentFilter} placeholder="All Check statuses" allowEmpty /></div>
            <div><Label htmlFor="vendor-payment-search">Search</Label><Input id="vendor-payment-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, reference, Check" /></div>
          </div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || busy} onClick={() => void load(0)}>Apply Filters</Button><Button variant="ghost" disabled={loading || busy} onClick={() => void load(offset)}>Retry / Refresh</Button></div>
          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Vendor / Reference</TableCell><TableCell isHeader variant="admin">Payment Method</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin" className="text-right">Allocated</TableCell><TableCell isHeader variant="admin" className="text-right">Unapplied</TableCell><TableCell isHeader variant="admin">Payment</TableCell><TableCell isHeader variant="admin">Check</TableCell><TableCell isHeader variant="admin">Action</TableCell></TableRow></TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={8}>Loading Vendor Payments…</TableStateRow> : payments.length === 0 ? <TableStateRow colSpan={8}>No Vendor Payments match the current filters.</TableStateRow> : payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell variant="admin"><span className="font-medium">{payment.vendor_name || payment.vendor_code || "Vendor"}</span><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{payment.reference_no || payment.id}</div></TableCell>
                    <TableCell variant="admin">{payment.payment_method_name || "—"}</TableCell>
                    <TableCell variant="admin" className="text-right font-medium">{money(payment.amount, payment.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(payment.allocated_amount, payment.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(payment.unapplied_amount, payment.currency_code)}</TableCell>
                    <TableCell variant="admin"><Badge color={paymentColor(payment.status)}>{payment.status}</Badge></TableCell>
                    <TableCell variant="admin">{payment.instrument_number ? <div className="space-y-1"><span>{payment.instrument_number}</span><div><Badge color={instrumentColor(payment.instrument_status)}>{payment.instrument_status || "—"}</Badge></div></div> : "—"}</TableCell>
                    <TableCell variant="admin"><Button size="sm" variant="outline" disabled={detailLoading} onClick={() => void loadDetail(payment.id)}>View</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Showing {payments.length} of {totalCount} Vendor Payments</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button><Button size="sm" variant="outline" disabled={loading || offset + payments.length >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button></div></div>
        </div>
      </ComponentCard>

      {detail ? (
        <ComponentCard title="Vendor Payment Detail" desc="Bill allocation, Check lifecycle and Finance reversal stay separately auditable while reconciling to one Finance movement.">
          {detailLoading ? <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading Vendor Payment detail…</div> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Vendor</span><div className="font-medium">{String(detail.vendor?.display_name ?? detail.vendor?.code ?? "—")}</div></div>
              <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Payment Method</span><div className="font-medium">{String(detail.payment_method?.name ?? "—")}</div></div>
              <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Allocated</span><div className="font-medium">{money(Number(detail.transaction.allocated_amount || 0), String(detail.transaction.currency_code || "USD"))}</div></div>
              <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Unapplied</span><div className="font-medium">{money(Number(detail.transaction.unapplied_amount || 0), String(detail.transaction.currency_code || "USD"))}</div></div>
            </div>
          )}
        </ComponentCard>
      ) : null}

      {canManage && detail?.transaction.status === "draft" ? (
        <ComponentCard title="Post Selected Vendor Payment" desc="Allocate to an open Vendor Bill if applicable. Check payments create an issued instrument; they are not cleared automatically.">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="vendor-payment-bill-id">Bill ID</Label><Input id="vendor-payment-bill-id" value={allocationInvoiceId} onChange={(event) => setAllocationInvoiceId(event.target.value)} placeholder="Optional open Vendor Bill" /></div>
              <div><Label htmlFor="vendor-payment-allocation">Allocation amount</Label><Input id="vendor-payment-allocation" type="number" min="0.0001" step="0.0001" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} /></div>
              {selectedMethodKey === "check" ? <><div><Label htmlFor="vendor-payment-check">Check number</Label><Input id="vendor-payment-check" value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} required /></div><div><Label htmlFor="vendor-payment-issued">Issued at</Label><Input id="vendor-payment-issued" type="datetime-local" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} required /></div></> : null}
              <div><Label htmlFor="vendor-payment-fx-rate">Manual FX rate</Label><Input id="vendor-payment-fx-rate" type="number" min="0.0000000001" step="0.0000000001" value={manualFxRate} onChange={(event) => setManualFxRate(event.target.value)} /></div>
              <div><Label htmlFor="vendor-payment-fx-source">Manual FX source</Label><Input id="vendor-payment-fx-source" value={manualFxSource} onChange={(event) => setManualFxSource(event.target.value)} /></div>
              {selectedMethodKey === "check" ? <><div><Label htmlFor="vendor-payment-instrument-reference">Check reference</Label><Input id="vendor-payment-instrument-reference" value={instrumentReference} onChange={(event) => setInstrumentReference(event.target.value)} /></div><div><Label htmlFor="vendor-payment-instrument-notes">Check notes</Label><Input id="vendor-payment-instrument-notes" value={instrumentNotes} onChange={(event) => setInstrumentNotes(event.target.value)} /></div></> : null}
            </div>
            <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void postSelected()}>Post Vendor Payment</Button><Button variant="danger" disabled={busy} onClick={() => void removeDraft()}>Delete Draft</Button></div>
          </div>
        </ComponentCard>
      ) : null}

      {canManage && detail?.transaction.status === "posted" && !detail.reversal ? (
        <ComponentCard title="Vendor Payment / Check Lifecycle" desc="Clear changes only Check lifecycle. Void, Return and non-Check Reversal create compensating Finance history and reverse AP allocations.">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="vendor-payment-action-at">Lifecycle time</Label><Input id="vendor-payment-action-at" type="datetime-local" value={actionAt} onChange={(event) => setActionAt(event.target.value)} /></div>
              <div><Label htmlFor="vendor-payment-action-reason">Void / Return / Reversal reason</Label><Input id="vendor-payment-action-reason" value={actionReason} onChange={(event) => setActionReason(event.target.value)} /></div>
            </div>
            <div className="flex flex-wrap gap-3">
              {selectedInstrumentStatus === "issued" ? <><Button variant="outline" disabled={busy} onClick={() => void clearCheck()}>Clear Check</Button><Button variant="danger" disabled={busy} onClick={() => void voidCheck()}>Void Check</Button></> : null}
              {["issued", "cleared"].includes(selectedInstrumentStatus ?? "") ? <Button variant="danger" disabled={busy} onClick={() => void returnCheck()}>Return Check</Button> : null}
              {!detail.instrument ? <Button variant="danger" disabled={busy} onClick={() => void reverseSelected()}>Reverse Vendor Payment</Button> : null}
            </div>
          </div>
        </ComponentCard>
      ) : null}

      {detail ? (
        <ComponentCard title="Bill Allocation History" desc="Allocated entries reuse the F3B Vendor Bill payment-allocation ledger. No second settlement table is created.">
          <TableViewport>
            <Table variant="admin" minWidth="medium">
              <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Bill allocation</TableCell><TableCell isHeader variant="admin">Bill date</TableCell><TableCell isHeader variant="admin">Due</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell></TableRow></TableHeader>
              <TableBody variant="admin">
                {detail.bill_allocations.length === 0 ? <TableStateRow colSpan={4}>No bill allocation. This Vendor Payment is currently Unapplied.</TableStateRow> : detail.bill_allocations.map((allocation, index) => (
                  <TableRow key={String(allocation.id ?? index)}><TableCell variant="admin">{String(allocation.invoice_number ?? allocation.invoice_id ?? "—")}</TableCell><TableCell variant="admin">{String(allocation.invoice_date ?? "—")}</TableCell><TableCell variant="admin">{String(allocation.due_date ?? "—")}</TableCell><TableCell variant="admin" className="text-right">{money(Number(allocation.amount_delta ?? 0), String(detail.transaction.currency_code || "USD"))}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>
      ) : null}
    </div>
  );
}
