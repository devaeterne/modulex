"use client";

import { useEffect, useMemo, useState } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_COMPAT_APPEARANCE, ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { formatDateOnly } from "@/lib/dates/usDate";
import {
  allocateVendorPayment,
  getVendorBillDetail,
  openVendorBill,
  voidVendorBill,
  type VendorBillDetail,
} from "@/lib/finance/vendorBills";
import {
  allocateVendorPaymentToOrders,
  getVendorInvoiceCommitmentReferenceData,
  setVendorInvoiceOrderAllocations,
  type VendorInvoiceCommitmentReferenceData,
} from "@/lib/finance/vendorPayables";

const billTabs = ["Overview", "Order Allocations", "Payments", "Audit"] as const;
type BillTab = (typeof billTabs)[number];

type DraftAllocation = { orderItemId: string; amount: number };

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency}`; }
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function VendorBillDetailPanel({ invoiceId, canManage, onChanged }: { invoiceId: string; canManage: boolean; onChanged: () => Promise<void> | void }) {
  const [detail, setDetail] = useState<VendorBillDetail | null>(null);
  const [reference, setReference] = useState<VendorInvoiceCommitmentReferenceData | null>(null);
  const [tab, setTab] = useState<BillTab>("Overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [manualFxRate, setManualFxRate] = useState("");
  const [manualFxSource, setManualFxSource] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [candidateAmount, setCandidateAmount] = useState("");
  const [lineAllocations, setLineAllocations] = useState<DraftAllocation[]>([]);
  const [paymentTransactionId, setPaymentTransactionId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAllocationId, setPaymentAllocationId] = useState("");
  const [settlementOrderItemId, setSettlementOrderItemId] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [nextDetail, nextReference] = await Promise.all([
        getVendorBillDetail(invoiceId),
        getVendorInvoiceCommitmentReferenceData(invoiceId),
      ]);
      setDetail(nextDetail);
      setReference(nextReference);
      setMessage(null);
      const firstLine = nextDetail.lines[0]?.id ?? "";
      setSelectedLineId((current) => current || firstLine);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill detail could not be loaded." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reference || !selectedLineId) { setLineAllocations([]); return; }
    setLineAllocations(reference.allocations
      .filter((allocation) => allocation.invoice_line_id === selectedLineId)
      .map((allocation) => ({ orderItemId: allocation.order_item_id, amount: Number(allocation.amount) })));
  }, [reference, selectedLineId]);

  const lineOptions = useMemo(() => (detail?.lines ?? []).map((line) => ({ value: line.id, label: `Line ${line.line_no} · ${line.description} · ${money(line.amount, detail?.invoice.currency_code ?? "USD")}` })), [detail]);
  const candidateOptions = useMemo(() => (reference?.candidates ?? []).map((candidate) => ({ value: candidate.order_item_id, label: `${candidate.project_number ?? "No Project"} / ${candidate.order_number} · ${candidate.line_description} · ${money(candidate.committed_amount, candidate.currency_code)} committed` })), [reference]);
  const positivePaymentAllocations = useMemo(() => {
    const allocations = detail?.payment_allocations ?? [];
    const reversed = new Set(allocations.map((row) => text(row.reversal_of_allocation_id)).filter(Boolean));
    return allocations.filter((row) => number(row.amount_delta) > 0 && !reversed.has(text(row.id)));
  }, [detail]);
  const paymentAllocationOptions = useMemo(() => positivePaymentAllocations.map((row) => ({ value: text(row.id), label: `${text(row.reference_no) || text(row.finance_transaction_id)} · ${money(number(row.amount_delta), text(row.currency_code) || detail?.invoice.currency_code || "USD")}` })), [positivePaymentAllocations, detail]);
  const selectedPaymentAllocation = useMemo(() => positivePaymentAllocations.find((row) => text(row.id) === paymentAllocationId) ?? null, [positivePaymentAllocations, paymentAllocationId]);
  const settlementCandidates = useMemo(() => {
    if (!reference) return [];
    const allowed = new Set((detail?.order_allocations ?? []).map((allocation) => allocation.order_item_id));
    return reference.candidates.filter((candidate) => allowed.has(candidate.order_item_id));
  }, [detail, reference]);
  const settlementOptions = useMemo(() => settlementCandidates.map((candidate) => ({ value: candidate.order_item_id, label: `${candidate.order_number} · ${candidate.line_description}` })), [settlementCandidates]);

  async function refresh(messageText?: string) {
    await load();
    await onChanged();
    if (messageText) setMessage({ variant: "success", text: messageText });
  }

  async function openBill() {
    if (!detail || !canManage || busy) return;
    const rate = manualFxRate.trim() ? Number(manualFxRate) : null;
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || !manualFxSource.trim())) {
      setMessage({ variant: "error", text: "Manual FX requires a positive rate and source." }); return;
    }
    setBusy(true);
    try { await openVendorBill(invoiceId, rate, manualFxSource); await refresh("Vendor Bill opened. AP balance is active and Order allocation history is frozen."); }
    catch (error) { setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill could not be opened." }); }
    finally { setBusy(false); }
  }

  async function voidBill() {
    if (!detail || !canManage || busy) return;
    if (!voidReason.trim()) { setMessage({ variant: "error", text: "Void reason is required." }); return; }
    setBusy(true);
    try { await voidVendorBill(invoiceId, voidReason); setVoidReason(""); await refresh("Vendor Bill voided. Historical Order attribution remains visible."); }
    catch (error) { setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill could not be voided." }); }
    finally { setBusy(false); }
  }

  function addDraftAllocation() {
    const amount = Number(candidateAmount);
    if (!candidateId || !Number.isFinite(amount) || amount <= 0) { setMessage({ variant: "error", text: "Choose an Order commitment and a positive allocation amount." }); return; }
    setLineAllocations((current) => {
      const without = current.filter((item) => item.orderItemId !== candidateId);
      return [...without, { orderItemId: candidateId, amount }];
    });
    setCandidateId(""); setCandidateAmount("");
  }

  async function saveOrderAllocations() {
    if (!selectedLineId || !canManage || busy) return;
    setBusy(true);
    try {
      await setVendorInvoiceOrderAllocations(invoiceId, selectedLineId, lineAllocations);
      await refresh("Vendor Bill Order allocations saved. Draft allocations do not count as Invoiced until the Bill is Open.");
    } catch (error) { setMessage({ variant: "error", text: error instanceof Error ? error.message : "Order allocations could not be saved." }); }
    finally { setBusy(false); }
  }

  async function allocatePaymentToBill() {
    const amount = Number(paymentAmount);
    if (!canManage || busy || !paymentTransactionId.trim() || !Number.isFinite(amount) || amount <= 0) { setMessage({ variant: "error", text: "Posted Vendor Payment transaction ID and positive allocation amount are required." }); return; }
    setBusy(true);
    try { await allocateVendorPayment(invoiceId, paymentTransactionId, amount); setPaymentTransactionId(""); setPaymentAmount(""); await refresh("Vendor Payment allocated to the Vendor Bill."); }
    catch (error) { setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Payment allocation failed." }); }
    finally { setBusy(false); }
  }

  async function allocatePaymentToOrder() {
    const amount = Number(settlementAmount);
    if (!canManage || busy || !paymentAllocationId || !settlementOrderItemId || !Number.isFinite(amount) || amount <= 0) { setMessage({ variant: "error", text: "Choose a valid Bill payment allocation, Order commitment and positive settlement amount." }); return; }
    setBusy(true);
    try { await allocateVendorPaymentToOrders(paymentAllocationId, [{ orderItemId: settlementOrderItemId, amount }]); setSettlementOrderItemId(""); setSettlementAmount(""); await refresh("Posted Vendor Payment attributed to the selected Order commitment."); }
    catch (error) { setMessage({ variant: "error", text: error instanceof Error ? error.message : "Order settlement allocation failed." }); }
    finally { setBusy(false); }
  }

  if (loading || !detail || !reference) return <div className="py-10 text-center">Loading Vendor Bill detail…</div>;
  const currency = detail.invoice.currency_code;

  return (
    <div className="space-y-5">
      {message ? <Alert variant={message.variant} title="Vendor Bill" message={message.text} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{detail.invoice.invoice_number}</h3><p className={ADMIN_TEXT_STYLES.muted}>{detail.invoice.vendor_name_snapshot} · {money(detail.invoice.total_amount, currency)}</p></div><div className="flex gap-2"><Badge color={detail.invoice.status === "open" ? "success" : detail.invoice.status === "void" ? "error" : "light"}>{detail.invoice.status}</Badge><Badge color={detail.invoice.payment_status === "paid" ? "success" : detail.invoice.payment_status === "partially_paid" ? "warning" : "light"}>{detail.invoice.payment_status}</Badge></div></div>
      <div className={`flex flex-wrap gap-2 border-b pb-3 ${ADMIN_COMPAT_APPEARANCE["border-gray-200"]} ${ADMIN_COMPAT_APPEARANCE["dark:border-gray-800"]}`}>{billTabs.map((name) => <Button key={name} size="sm" variant={tab === name ? "primary" : "ghost"} onClick={() => setTab(name)}>{name}</Button>)}</div>

      {tab === "Overview" ? <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Due</span><div>{detail.invoice.due_date ? formatDateOnly(detail.invoice.due_date) : "Not set"}</div></div><div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Paid</span><div>{money(detail.invoice.paid_amount, currency)}</div></div><div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Outstanding</span><div>{money(detail.invoice.outstanding_amount, currency)}</div></div><div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Order allocations</span><div>{detail.order_allocations?.length ?? 0}</div></div></div>
        {canManage && detail.invoice.status === "draft" ? <div className="grid gap-3 md:grid-cols-3"><div><Label htmlFor="bill-open-fx">Manual FX rate</Label><Input id="bill-open-fx" type="number" min="0" step="0.0000000001" value={manualFxRate} onChange={(event) => setManualFxRate(event.target.value)} placeholder="Only for cross-currency Bill" /></div><div><Label htmlFor="bill-open-fx-source">FX source</Label><Input id="bill-open-fx-source" value={manualFxSource} onChange={(event) => setManualFxSource(event.target.value)} /></div><div className="flex items-end"><Button disabled={busy} onClick={() => void openBill()}>Open Vendor Bill</Button></div></div> : null}
        {canManage && detail.invoice.status === "open" ? <div className="grid gap-3 md:grid-cols-[1fr_auto]"><div><Label htmlFor="bill-void-reason">Void reason</Label><Input id="bill-void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></div><div className="flex items-end"><Button variant="danger" disabled={busy} onClick={() => void voidBill()}>Void Vendor Bill</Button></div></div> : null}
      </div> : null}

      {tab === "Order Allocations" ? <div className="space-y-4">
        <p className={ADMIN_TEXT_STYLES.muted}>Allocate a Vendor Bill line across one or many committed Vendor Cabinet Orders. A Draft Bill allocation is preview attribution; opening the Bill freezes it and makes it count as Invoiced.</p>
        <div><Label htmlFor="bill-allocation-line">Vendor Bill line</Label><Select id="bill-allocation-line" options={lineOptions} value={selectedLineId} onChange={setSelectedLineId} placeholder="Select Bill line" /></div>
        {detail.invoice.status === "draft" && canManage ? <><div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]"><div><Label htmlFor="bill-allocation-candidate">Order commitment</Label><Select id="bill-allocation-candidate" options={candidateOptions} value={candidateId} onChange={setCandidateId} placeholder="Select committed Order" /></div><div><Label htmlFor="bill-allocation-amount">Amount</Label><Input id="bill-allocation-amount" type="number" min="0.0001" step="0.0001" value={candidateAmount} onChange={(event) => setCandidateAmount(event.target.value)} /></div><div className="flex items-end"><Button variant="outline" onClick={addDraftAllocation}>Add allocation</Button></div></div><div className="flex justify-end"><Button disabled={busy || !selectedLineId} onClick={() => void saveOrderAllocations()}>Save Order Allocations</Button></div></> : <Alert variant="info" title="Read-only allocation history" message="Order attribution is immutable after the Vendor Bill is opened. Use the AP correction/void workflow instead of rewriting history." />}
        <TableViewport><Table variant="admin" minWidth="compact"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Project / Order</TableCell><TableCell isHeader variant="admin">Description</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin">Action</TableCell></TableRow></TableHeader><TableBody variant="admin">{lineAllocations.length === 0 ? <TableStateRow colSpan={4}>No Order allocations for this Bill line.</TableStateRow> : lineAllocations.map((allocation) => { const candidate = reference.candidates.find((item) => item.order_item_id === allocation.orderItemId); return <TableRow key={allocation.orderItemId}><TableCell variant="admin">{candidate?.project_number ?? "No Project"}<div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{candidate?.order_number ?? allocation.orderItemId}</div></TableCell><TableCell variant="admin">{candidate?.line_description ?? allocation.orderItemId}</TableCell><TableCell variant="admin" className="text-right">{money(allocation.amount, currency)}</TableCell><TableCell variant="admin">{detail.invoice.status === "draft" && canManage ? <Button size="sm" variant="ghost" onClick={() => setLineAllocations((current) => current.filter((item) => item.orderItemId !== allocation.orderItemId))}>Remove</Button> : "—"}</TableCell></TableRow>; })}</TableBody></Table></TableViewport>
      </div> : null}

      {tab === "Payments" ? <div className="space-y-6">
        {canManage && detail.invoice.status === "open" ? <div className="space-y-3"><h4 className="font-semibold">Allocate Vendor Payment to Bill</h4><div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]"><div><Label htmlFor="bill-payment-transaction">Posted Vendor Payment transaction ID</Label><Input id="bill-payment-transaction" value={paymentTransactionId} onChange={(event) => setPaymentTransactionId(event.target.value)} /></div><div><Label htmlFor="bill-payment-amount">Amount</Label><Input id="bill-payment-amount" type="number" min="0.0001" step="0.0001" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></div><div className="flex items-end"><Button disabled={busy} onClick={() => void allocatePaymentToBill()}>Allocate Payment</Button></div></div></div> : null}
        <div><h4 className="mb-2 font-semibold">Bill Payment Allocations</h4><TableViewport><Table variant="admin" minWidth="compact"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Transaction</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell></TableRow></TableHeader><TableBody variant="admin">{detail.payment_allocations.length === 0 ? <TableStateRow colSpan={3}>No Vendor Payments allocated to this Bill.</TableStateRow> : detail.payment_allocations.map((row, index) => <TableRow key={text(row.id) || String(index)}><TableCell variant="admin">{text(row.reference_no) || text(row.finance_transaction_id)}</TableCell><TableCell variant="admin">{text(row.transaction_status)}</TableCell><TableCell variant="admin" className="text-right">{money(number(row.amount_delta), text(row.currency_code) || currency)}</TableCell></TableRow>)}</TableBody></Table></TableViewport></div>
        {canManage && detail.invoice.status === "open" && positivePaymentAllocations.length ? <div className={`space-y-3 border p-4 ${ADMIN_COMPAT_APPEARANCE["rounded-xl"]} ${ADMIN_COMPAT_APPEARANCE["border-gray-200"]} ${ADMIN_COMPAT_APPEARANCE["dark:border-gray-800"]}`}><h4 className="font-semibold">Attribute Posted Payment to Orders</h4><p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>This never creates another Finance transaction. It only attributes a valid Bill payment to commitments already covered by this Bill.</p><div className="grid gap-3 md:grid-cols-3"><div><Label htmlFor="order-settlement-payment">Bill payment allocation</Label><Select id="order-settlement-payment" options={paymentAllocationOptions} value={paymentAllocationId} onChange={setPaymentAllocationId} placeholder="Select real payment allocation" /></div><div><Label htmlFor="order-settlement-item">Order commitment</Label><Select id="order-settlement-item" options={settlementOptions} value={settlementOrderItemId} onChange={setSettlementOrderItemId} placeholder="Select linked Order" /></div><div><Label htmlFor="order-settlement-amount">Settlement amount</Label><Input id="order-settlement-amount" type="number" min="0.0001" step="0.0001" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} /></div></div><div className="flex justify-end"><Button disabled={busy || !selectedPaymentAllocation} onClick={() => void allocatePaymentToOrder()}>Allocate to Order</Button></div></div> : null}
        <div><h4 className="mb-2 font-semibold">Order Settlement History</h4><TableViewport><Table variant="admin" minWidth="compact"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Order</TableCell><TableCell isHeader variant="admin">Payment allocation</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin">Reason</TableCell></TableRow></TableHeader><TableBody variant="admin">{(detail.order_settlements ?? []).length === 0 ? <TableStateRow colSpan={4}>No Order-level settlement attribution.</TableStateRow> : (detail.order_settlements ?? []).map((row) => <TableRow key={row.id}><TableCell variant="admin">{row.order_number ?? row.order_item_id}</TableCell><TableCell variant="admin">{row.finance_transaction_id ?? row.invoice_payment_allocation_id}</TableCell><TableCell variant="admin" className="text-right">{money(Number(row.amount_delta), row.currency_code)}</TableCell><TableCell variant="admin">{row.reason ?? (row.amount_delta < 0 ? "Reversal" : "—")}</TableCell></TableRow>)}</TableBody></Table></TableViewport></div>
      </div> : null}

      {tab === "Audit" ? <div className="space-y-2">{detail.audit.length === 0 ? <p className={ADMIN_TEXT_STYLES.muted}>No Vendor Bill audit events.</p> : detail.audit.map((row, index) => <div key={text(row.id) || String(index)} className={`border p-3 ${ADMIN_COMPAT_APPEARANCE["rounded-lg"]} ${ADMIN_COMPAT_APPEARANCE["border-gray-200"]} ${ADMIN_COMPAT_APPEARANCE["dark:border-gray-800"]}`}><div className="font-medium">{text(row.action_type) || "Vendor Bill event"}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{text(row.created_at)}</div>{text(row.reason) ? <div className="mt-1 text-sm">{text(row.reason)}</div> : null}</div>)}</div> : null}
    </div>
  );
}
