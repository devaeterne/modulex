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
import { getVendorsPage, type VendorListItem } from "@/lib/finance/vendors";
import {
  allocateVendorPayment,
  createVendorBillDraft,
  deleteVendorBillDraft,
  getVendorBillDetail,
  getVendorBillsPage,
  openVendorBill,
  setVendorBillLines,
  updateVendorBillDraft,
  voidVendorBill,
  type VendorBillDetail,
  type VendorBillDocumentStatus,
  type VendorBillDraftInput,
  type VendorBillLineInput,
  type VendorBillListItem,
  type VendorBillPaymentStatus,
} from "@/lib/finance/vendorBills";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

function paymentColor(status: VendorBillPaymentStatus) {
  if (status === "paid") return "success" as const;
  if (status === "partially_paid") return "warning" as const;
  if (status === "void") return "error" as const;
  if (status === "draft") return "light" as const;
  return "info" as const;
}

const emptyLine: VendorBillLineInput = {
  description: "",
  amount: 0,
  projectId: null,
  orderId: null,
  purchaseOrderReference: null,
};

export default function FinanceVendorBillsManager() {
  const [bills, setBills] = useState<VendorBillListItem[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [detail, setDetail] = useState<VendorBillDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localDate());
  const [dueDate, setDueDate] = useState(localDate());
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [lineDrafts, setLineDrafts] = useState<VendorBillLineInput[]>([]);
  const [lineDescription, setLineDescription] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [lineProjectId, setLineProjectId] = useState("");
  const [lineOrderId, setLineOrderId] = useState("");
  const [linePo, setLinePo] = useState("");

  const [manualFxRate, setManualFxRate] = useState("");
  const [manualFxSource, setManualFxSource] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [paymentTransactionId, setPaymentTransactionId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dueBefore, setDueBefore] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const profileResult = await getCurrentProfile();
      const [nextBills, nextVendors] = await Promise.all([
        getVendorBillsPage({
          limit: pageSize,
          offset: nextOffset,
          vendorId: vendorFilter || null,
          status: (statusFilter || null) as VendorBillDocumentStatus | VendorBillPaymentStatus | null,
          search: search || null,
          dueBefore: dueBefore || null,
          projectId: projectFilter || null,
          orderId: orderFilter || null,
          currencyCode: currencyFilter || null,
        }),
        getVendorsPage({ limit: 200 }),
      ]);
      setCanManage(hasPermission(profileResult.profile?.roles, "finance.manage"));
      setBills(nextBills);
      setVendors(nextVendors);
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const next = await getVendorBillDetail(id);
      setSelectedId(id);
      setDetail(next);
      setLineDrafts((next.lines ?? []).map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unit_amount,
        amount: Number(line.amount),
        projectId: line.project_id,
        orderId: line.order_id,
        procurementCommitmentId: line.procurement_commitment_id,
        purchaseOrderReference: line.purchase_order_reference,
        notes: line.notes,
      })));
    } finally {
      setDetailLoading(false);
    }
  }

  async function refresh() {
    await load(offset);
    if (selectedId) await loadDetail(selectedId);
  }

  useEffect(() => {
    void load(0).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bills could not be loaded." }));
    // Initial route load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendorOptions = useMemo(
    () => vendors
      .filter((vendor) => vendor.status !== "inactive")
      .map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.display_name}` })),
    [vendors],
  );
  const totalCount = Number(bills[0]?.total_count ?? 0);

  function resetDraft() {
    setEditingId(null);
    setVendorId("");
    setInvoiceNumber("");
    setInvoiceDate(localDate());
    setDueDate(localDate());
    setAmount("");
    setCurrencyCode("USD");
    setPurchaseOrderReference("");
    setReferenceNo("");
    setNotes("");
    setLineDrafts([]);
  }

  function beginEdit(bill: VendorBillListItem) {
    if (bill.status !== "draft") return;
    setEditingId(bill.id);
    setVendorId(bill.vendor_id);
    setInvoiceNumber(bill.invoice_number);
    setInvoiceDate(bill.invoice_date);
    setDueDate(bill.due_date ?? bill.invoice_date);
    setAmount(String(bill.total_amount));
    setCurrencyCode(bill.currency_code);
    setPurchaseOrderReference(bill.purchase_order_reference ?? "");
    setReferenceNo(String((detail?.invoice.reference_no as string | null | undefined) ?? ""));
    setNotes(String((detail?.invoice.notes as string | null | undefined) ?? ""));
    void loadDetail(bill.id);
  }

  function draftInput(): VendorBillDraftInput | null {
    const numericAmount = Number(amount);
    if (!vendorId || !invoiceNumber.trim() || !invoiceDate || !dueDate) {
      setMessage({ variant: "error", text: "Vendor, bill number, bill date and due date are required." });
      return null;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ variant: "error", text: "Vendor Bill total must be greater than zero." });
      return null;
    }
    if (currencyCode.trim().length !== 3) {
      setMessage({ variant: "error", text: "Vendor Bill currency must be a 3-letter code." });
      return null;
    }
    return {
      vendorId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      totalAmount: numericAmount,
      currencyCode,
      purchaseOrderReference,
      referenceNo,
      notes,
    };
  }

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    const input = draftInput();
    if (!input) return;
    setBusy(true);
    try {
      const id = editingId ? await updateVendorBillDraft(editingId, input) : await createVendorBillDraft(input);
      if (lineDrafts.length) await setVendorBillLines(id, lineDrafts);
      setMessage({ variant: "success", text: editingId ? "Vendor Bill draft updated." : "Vendor Bill draft created." });
      resetDraft();
      await load(0);
      await loadDetail(id);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill draft could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  function addLine() {
    const numericAmount = Number(lineAmount);
    if (!lineDescription.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ variant: "error", text: "Bill line description and positive amount are required." });
      return;
    }
    setLineDrafts((current) => [...current, {
      ...emptyLine,
      description: lineDescription.trim(),
      amount: numericAmount,
      projectId: lineProjectId || null,
      orderId: lineOrderId || null,
      purchaseOrderReference: linePo || null,
    }]);
    setLineDescription("");
    setLineAmount("");
    setLineProjectId("");
    setLineOrderId("");
    setLinePo("");
  }

  async function openBill(bill: VendorBillListItem) {
    if (!canManage || busy || bill.status !== "draft") return;
    const rate = manualFxRate.trim() ? Number(manualFxRate) : null;
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || !manualFxSource.trim())) {
      setMessage({ variant: "error", text: "Manual FX requires a positive rate and source." });
      return;
    }
    setBusy(true);
    try {
      await openVendorBill(bill.id, rate, manualFxSource);
      setMessage({ variant: "success", text: "Vendor Bill opened. AP balance is now active." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill could not be opened." });
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft(bill: VendorBillListItem) {
    if (!canManage || busy || bill.status !== "draft") return;
    setBusy(true);
    try {
      await deleteVendorBillDraft(bill.id);
      if (selectedId === bill.id) { setSelectedId(null); setDetail(null); }
      setMessage({ variant: "success", text: "Vendor Bill draft deleted." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill draft could not be deleted." });
    } finally {
      setBusy(false);
    }
  }

  async function voidBill() {
    if (!canManage || busy || !selectedId || detail?.invoice.status !== "open") return;
    if (!voidReason.trim()) {
      setMessage({ variant: "error", text: "Void reason is required." });
      return;
    }
    setBusy(true);
    try {
      await voidVendorBill(selectedId, voidReason);
      setVoidReason("");
      setMessage({ variant: "success", text: "Vendor Bill voided." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill could not be voided." });
    } finally {
      setBusy(false);
    }
  }

  async function allocatePayment() {
    if (!canManage || busy || !selectedId) return;
    const numericAmount = Number(paymentAmount);
    if (!paymentTransactionId.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ variant: "error", text: "Posted Vendor Payment transaction ID and positive allocation amount are required." });
      return;
    }
    setBusy(true);
    try {
      await allocateVendorPayment(selectedId, paymentTransactionId, numericAmount);
      setPaymentTransactionId("");
      setPaymentAmount("");
      setMessage({ variant: "success", text: "Vendor Payment allocated. Outstanding balance recalculated from allocation history." });
      await refresh();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Payment allocation failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Vendor Bills" : "Vendor Bills error"} message={message.text} /> : null}
      {!canManage && !loading ? <Alert variant="info" title="Read-only Finance access" message="Your role can review Vendor Bills, due dates, Project/Order attribution and Payment history but cannot mutate AP." /> : null}

      {canManage ? (
        <ComponentCard title={editingId ? "Edit Vendor Bill Draft" : "New Vendor Bill Draft"} desc="Vendor Bill is the AP source document. Actual cash movement remains in Finance Transactions.">
          <form onSubmit={submitDraft} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="bill-vendor">Vendor</Label><Select id="bill-vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select canonical Vendor" required disabled={Boolean(editingId)} /></div>
              <div><Label htmlFor="bill-number">Bill number</Label><Input id="bill-number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></div>
              <div><Label htmlFor="bill-date">Bill date</Label><Input id="bill-date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required /></div>
              <div><Label htmlFor="bill-due">Due date</Label><Input id="bill-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></div>
              <div><Label htmlFor="bill-total">Total</Label><Input id="bill-total" type="number" min="0.0001" step="0.0001" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
              <div><Label htmlFor="bill-currency">Currency</Label><Input id="bill-currency" maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required /></div>
              <div><Label htmlFor="bill-po">PO / Vendor Order</Label><Input id="bill-po" value={purchaseOrderReference} onChange={(event) => setPurchaseOrderReference(event.target.value)} /></div>
              <div><Label htmlFor="bill-reference">Reference</Label><Input id="bill-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></div>
            </div>
            <div><Label htmlFor="bill-notes">Notes</Label><TextArea id="bill-notes" value={notes} onChange={setNotes} rows={2} /></div>

            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div><Label htmlFor="bill-line-description">Line description</Label><Input id="bill-line-description" value={lineDescription} onChange={(event) => setLineDescription(event.target.value)} /></div>
                <div><Label htmlFor="bill-line-amount">Line amount</Label><Input id="bill-line-amount" type="number" min="0.0001" step="0.0001" value={lineAmount} onChange={(event) => setLineAmount(event.target.value)} /></div>
                <div><Label htmlFor="bill-line-project">Project ID</Label><Input id="bill-line-project" value={lineProjectId} onChange={(event) => setLineProjectId(event.target.value)} placeholder="Optional Project" /></div>
                <div><Label htmlFor="bill-line-order">Order ID</Label><Input id="bill-line-order" value={lineOrderId} onChange={(event) => setLineOrderId(event.target.value)} placeholder="Optional Order" /></div>
                <div><Label htmlFor="bill-line-po">PO</Label><Input id="bill-line-po" value={linePo} onChange={(event) => setLinePo(event.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={addLine}>Add Bill Line</Button>
                <span className={`self-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>{lineDrafts.length} line(s) · {money(lineDrafts.reduce((sum, line) => sum + Number(line.amount || 0), 0), currencyCode)}</span>
              </div>
              {lineDrafts.length ? (
                <TableViewport><Table variant="admin" minWidth="medium"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Line</TableCell><TableCell isHeader variant="admin">Project / Order / PO</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin">Action</TableCell></TableRow></TableHeader><TableBody variant="admin">{lineDrafts.map((line, index) => <TableRow key={`${line.description}-${index}`}><TableCell variant="admin">{line.description}</TableCell><TableCell variant="admin">{line.projectId || "—"} / {line.orderId || "—"} / {line.purchaseOrderReference || "—"}</TableCell><TableCell variant="admin" className="text-right">{money(line.amount, currencyCode)}</TableCell><TableCell variant="admin"><Button type="button" size="sm" variant="danger" onClick={() => setLineDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></TableCell></TableRow>)}</TableBody></Table></TableViewport>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{editingId ? "Update Draft" : "Create Draft"}</Button>{editingId ? <Button type="button" variant="outline" disabled={busy} onClick={resetDraft}>Cancel Edit</Button> : null}</div>
          </form>
        </ComponentCard>
      ) : null}

      {canManage ? (
        <ComponentCard title="AP Lifecycle Inputs" desc="Opening snapshots FX. Payment allocation accepts only an existing posted vendor_payment Finance transaction; payment creation/check lifecycle belongs to F3C.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div><Label htmlFor="bill-fx-rate">Manual FX rate</Label><Input id="bill-fx-rate" type="number" min="0.0000000001" step="0.0000000001" value={manualFxRate} onChange={(event) => setManualFxRate(event.target.value)} /></div>
            <div><Label htmlFor="bill-fx-source">Manual FX source</Label><Input id="bill-fx-source" value={manualFxSource} onChange={(event) => setManualFxSource(event.target.value)} /></div>
            <div><Label htmlFor="bill-payment-id">Vendor Payment transaction ID</Label><Input id="bill-payment-id" value={paymentTransactionId} onChange={(event) => setPaymentTransactionId(event.target.value)} /></div>
            <div><Label htmlFor="bill-payment-amount">Payment allocation</Label><Input id="bill-payment-amount" type="number" min="0.0001" step="0.0001" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></div>
            <div><Label htmlFor="bill-void-reason">Void reason</Label><Input id="bill-void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" disabled={busy || !selectedId || detail?.invoice.status !== "open"} onClick={() => void allocatePayment()}>Allocate Payment</Button><Button variant="danger" disabled={busy || !selectedId || detail?.invoice.status !== "open"} onClick={() => void voidBill()}>Void Selected Bill</Button></div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Vendor Bills" desc="AP source documents across all years. Outstanding is derived from bill total minus valid Finance Payment allocations.">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><Label htmlFor="bill-filter-vendor">Vendor</Label><Select id="bill-filter-vendor" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors" allowEmpty /></div>
            <div><Label htmlFor="bill-filter-status">Status</Label><Select id="bill-filter-status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" allowEmpty /></div>
            <div><Label htmlFor="bill-filter-due">Due before</Label><Input id="bill-filter-due" type="date" value={dueBefore} onChange={(event) => setDueBefore(event.target.value)} /></div>
            <div><Label htmlFor="bill-filter-search">Search</Label><Input id="bill-filter-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, bill, reference" /></div>
            <div><Label htmlFor="bill-filter-project">Project ID</Label><Input id="bill-filter-project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} /></div>
            <div><Label htmlFor="bill-filter-order">Order ID</Label><Input id="bill-filter-order" value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)} /></div>
            <div><Label htmlFor="bill-filter-currency">Currency</Label><Input id="bill-filter-currency" maxLength={3} value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value.toUpperCase())} /></div>
          </div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || busy} onClick={() => void load(0).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill filters failed." }))}>Apply Filters</Button><Button variant="ghost" disabled={loading || busy} onClick={() => void load(offset).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bills could not be refreshed." }))}>Retry / Refresh</Button></div>

          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Vendor / Bill</TableCell><TableCell isHeader variant="admin">Bill Date</TableCell><TableCell isHeader variant="admin">Due</TableCell><TableCell isHeader variant="admin" className="text-right">Total</TableCell><TableCell isHeader variant="admin" className="text-right">Outstanding</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Project / Order</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={8}>Loading Vendor Bills…</TableStateRow> : bills.length === 0 ? <TableStateRow colSpan={8}>No Vendor Bills match the current filters.</TableStateRow> : bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell variant="admin"><span className="font-medium">{bill.vendor_name_snapshot}</span><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{bill.invoice_number}{bill.purchase_order_reference ? ` · PO ${bill.purchase_order_reference}` : ""}</div></TableCell>
                    <TableCell variant="admin">{bill.invoice_date}</TableCell><TableCell variant="admin">{bill.due_date || "—"}</TableCell>
                    <TableCell variant="admin" className="text-right font-medium">{money(bill.total_amount, bill.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right font-medium">{money(bill.outstanding_amount, bill.currency_code)}</TableCell>
                    <TableCell variant="admin"><Badge color={paymentColor(bill.payment_status)}>{bill.payment_status.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell variant="admin">{bill.project_count} Project · {bill.order_count} Order</TableCell>
                    <TableCell variant="admin"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={detailLoading} onClick={() => void loadDetail(bill.id)}>View</Button>{canManage && bill.status === "draft" ? <><Button size="sm" variant="outline" disabled={busy} onClick={() => beginEdit(bill)}>Edit</Button><Button size="sm" disabled={busy} onClick={() => void openBill(bill)}>Open</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => void removeDraft(bill)}>Delete</Button></> : null}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Showing {bills.length} of {totalCount} Vendor Bills</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button><Button variant="outline" size="sm" disabled={loading || offset + bills.length >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button></div></div>
        </div>
      </ComponentCard>

      {detail ? (
        <ComponentCard title={`Bill ${String(detail.invoice.invoice_number ?? "")}`} desc="Source lines, Procurement attribution and Finance Payment allocation history stay separate but reconcile on this bill.">
          {detailLoading ? <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading bill detail…</div> : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Vendor</span><div className="font-medium">{detail.vendor?.display_name ?? String(detail.invoice.vendor_name_snapshot ?? "—")}</div></div>
                <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Due</span><div className="font-medium">{String(detail.invoice.due_date ?? "—")}</div></div>
                <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Outstanding</span><div className="font-medium">{money(Number(detail.invoice.outstanding_amount ?? 0), String(detail.invoice.currency_code ?? "USD"))}</div></div>
                <div><span className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Base snapshot</span><div className="font-medium">{detail.invoice.base_amount ? money(Number(detail.invoice.base_amount), String(detail.invoice.base_currency_code ?? "USD")) : "Draft"}</div></div>
              </div>
              <TableViewport><Table variant="admin" minWidth="medium"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Bill Line</TableCell><TableCell isHeader variant="admin">Project</TableCell><TableCell isHeader variant="admin">Order</TableCell><TableCell isHeader variant="admin">PO</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell></TableRow></TableHeader><TableBody variant="admin">{detail.lines.length === 0 ? <TableStateRow colSpan={5}>No manual bill lines. Procurement allocations may still provide source attribution.</TableStateRow> : detail.lines.map((line) => <TableRow key={line.id}><TableCell variant="admin">{line.description}</TableCell><TableCell variant="admin">{line.project_id || "—"}</TableCell><TableCell variant="admin">{line.order_id || "—"}</TableCell><TableCell variant="admin">{line.purchase_order_reference || "—"}</TableCell><TableCell variant="admin" className="text-right">{money(Number(line.amount), String(detail.invoice.currency_code ?? "USD"))}</TableCell></TableRow>)}</TableBody></Table></TableViewport>
              <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Procurement source allocations: {detail.procurement_allocations.length} · Payment allocations: {detail.payment_allocations.length}. Payment status is derived; there is no editable running balance.</div>
            </div>
          )}
        </ComponentCard>
      ) : null}
    </div>
  );
}
