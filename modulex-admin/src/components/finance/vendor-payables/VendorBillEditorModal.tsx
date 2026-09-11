"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import DateInput from "@/components/form/DateInput";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import {
  createVendorBillDraft,
  getVendorBillDetail,
  setVendorBillLines,
  updateVendorBillDraft,
  type VendorBillLineInput,
  type VendorBillListItem,
} from "@/lib/finance/vendorBills";
import type { VendorListItem } from "@/lib/finance/vendors";

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function VendorBillEditorModal({
  isOpen,
  vendors,
  editingBill,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  vendors: VendorListItem[];
  editingBill: VendorBillListItem | null;
  onClose: () => void;
  onSaved: (invoiceId: string) => Promise<void> | void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localDate());
  const [dueDate, setDueDate] = useState(localDate());
  const [totalAmount, setTotalAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [purchaseOrderReference, setPurchaseOrderReference] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<VendorBillLineInput[]>([]);
  const [lineDescription, setLineDescription] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [lineProjectId, setLineProjectId] = useState("");
  const [lineOrderId, setLineOrderId] = useState("");
  const [linePo, setLinePo] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const vendorOptions = useMemo(
    () => vendors.filter((vendor) => vendor.status !== "inactive").map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.display_name}` })),
    [vendors],
  );

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    if (!editingBill) {
      setVendorId("");
      setInvoiceNumber("");
      setInvoiceDate(localDate());
      setDueDate(localDate());
      setTotalAmount("");
      setCurrencyCode("USD");
      setPurchaseOrderReference("");
      setReferenceNo("");
      setNotes("");
      setLines([]);
      return;
    }

    setVendorId(editingBill.vendor_id);
    setInvoiceNumber(editingBill.invoice_number);
    setInvoiceDate(editingBill.invoice_date);
    setDueDate(editingBill.due_date ?? editingBill.invoice_date);
    setTotalAmount(String(editingBill.total_amount));
    setCurrencyCode(editingBill.currency_code);
    setPurchaseOrderReference(editingBill.purchase_order_reference ?? "");
    setLoading(true);
    void getVendorBillDetail(editingBill.id)
      .then((detail) => {
        setReferenceNo(String((detail.invoice.reference_no as string | null | undefined) ?? ""));
        setNotes(String((detail.invoice.notes as string | null | undefined) ?? ""));
        setLines(detail.lines.map((line) => ({
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
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Vendor Bill detail could not be loaded."))
      .finally(() => setLoading(false));
  }, [editingBill, isOpen]);

  function addLine() {
    const amount = Number(lineAmount);
    if (!lineDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Bill line description and positive amount are required.");
      return;
    }
    setLines((current) => [...current, {
      description: lineDescription.trim(),
      amount,
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const amount = Number(totalAmount);
    if (!vendorId || !invoiceNumber.trim() || !invoiceDate || !dueDate) {
      setMessage("Vendor, Bill number, Bill date and Due date are required.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Vendor Bill total must be greater than zero.");
      return;
    }
    if (currencyCode.trim().length !== 3) {
      setMessage("Currency must be a 3-letter code.");
      return;
    }
    const lineTotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    if (lines.length && Math.abs(lineTotal - amount) > 0.0001) {
      setMessage("Bill line total must equal the Vendor Bill total before saving.");
      return;
    }

    setBusy(true);
    try {
      const input = {
        vendorId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        totalAmount: amount,
        currencyCode,
        purchaseOrderReference,
        referenceNo,
        notes,
      };
      const invoiceId = editingBill
        ? await updateVendorBillDraft(editingBill.id, input)
        : await createVendorBillDraft(input);
      await setVendorBillLines(invoiceId, lines);
      await onSaved(invoiceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vendor Bill draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => !busy && onClose()} className="relative w-full max-w-6xl p-6 lg:p-8" ariaLabel={editingBill ? "Edit Vendor Bill" : "Add Vendor Bill"}>
      <form onSubmit={submit} className="space-y-6">
        <div><h3 className="text-xl font-semibold">{editingBill ? "Edit Vendor Bill Draft" : "+ Add Vendor Bill"}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Vendor Bill is the AP source document. Order allocations are configured after the Draft is saved.</p></div>
        {message ? <Alert variant="error" title="Vendor Bill" message={message} /> : null}
        {loading ? <div className="py-8 text-center">Loading Vendor Bill…</div> : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="bill-editor-vendor">Vendor</Label><Select id="bill-editor-vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select canonical Vendor" required disabled={Boolean(editingBill)} /></div>
              <div><Label htmlFor="bill-editor-number">Bill number</Label><Input id="bill-editor-number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></div>
              <div><Label htmlFor="bill-editor-date">Bill date</Label><DateInput id="bill-editor-date" value={invoiceDate} onChange={setInvoiceDate} required /></div>
              <div><Label htmlFor="bill-editor-due">Due date</Label><DateInput id="bill-editor-due" value={dueDate} onChange={setDueDate} required /></div>
              <div><Label htmlFor="bill-editor-total">Total</Label><Input id="bill-editor-total" type="number" min="0.0001" step="0.0001" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} required /></div>
              <div><Label htmlFor="bill-editor-currency">Currency</Label><Input id="bill-editor-currency" value={currencyCode} maxLength={3} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required /></div>
              <div><Label htmlFor="bill-editor-po">PO / Vendor Order</Label><Input id="bill-editor-po" value={purchaseOrderReference} onChange={(event) => setPurchaseOrderReference(event.target.value)} /></div>
              <div><Label htmlFor="bill-editor-reference">Reference</Label><Input id="bill-editor-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></div>
            </div>
            <div><Label htmlFor="bill-editor-notes">Notes</Label><TextArea id="bill-editor-notes" value={notes} onChange={setNotes} rows={2} /></div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div><h4 className="font-semibold">Bill lines</h4><p className="text-xs text-gray-500 dark:text-gray-400">A line may later be allocated across multiple Vendor Cabinet Orders. Project/Order fields here remain optional descriptive attribution.</p></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="xl:col-span-2"><Label htmlFor="bill-line-description">Description</Label><Input id="bill-line-description" value={lineDescription} onChange={(event) => setLineDescription(event.target.value)} /></div>
                <div><Label htmlFor="bill-line-amount">Amount</Label><Input id="bill-line-amount" type="number" min="0.0001" step="0.0001" value={lineAmount} onChange={(event) => setLineAmount(event.target.value)} /></div>
                <div><Label htmlFor="bill-line-project">Project ID</Label><Input id="bill-line-project" value={lineProjectId} onChange={(event) => setLineProjectId(event.target.value)} /></div>
                <div><Label htmlFor="bill-line-order">Order ID</Label><Input id="bill-line-order" value={lineOrderId} onChange={(event) => setLineOrderId(event.target.value)} /></div>
                <div className="md:col-span-2"><Label htmlFor="bill-line-po">Line PO</Label><Input id="bill-line-po" value={linePo} onChange={(event) => setLinePo(event.target.value)} /></div>
                <div className="flex items-end"><Button type="button" variant="outline" onClick={addLine}>Add line</Button></div>
              </div>
              <TableViewport>
                <Table variant="admin" minWidth="compact"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Description</TableCell><TableCell isHeader variant="admin">Project / Order</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin">Action</TableCell></TableRow></TableHeader><TableBody variant="admin">
                  {lines.length === 0 ? <TableStateRow colSpan={4}>No Bill lines yet.</TableStateRow> : lines.map((line, index) => <TableRow key={`${line.description}-${index}`}><TableCell variant="admin">{line.description}</TableCell><TableCell variant="admin">{line.projectId || "—"}<div className="text-xs text-gray-500">{line.orderId || "—"}</div></TableCell><TableCell variant="admin" className="text-right">{Number(line.amount).toFixed(2)}</TableCell><TableCell variant="admin"><Button size="sm" variant="ghost" type="button" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button></TableCell></TableRow>)}
                </TableBody></Table>
              </TableViewport>
            </div>
          </>
        )}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || loading}>{busy ? "Saving…" : editingBill ? "Save Draft" : "Create Vendor Bill Draft"}</Button></div>
      </form>
    </Modal>
  );
}
