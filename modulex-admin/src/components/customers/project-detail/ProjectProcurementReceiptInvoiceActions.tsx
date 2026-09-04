"use client";

import { useState } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  correctProjectProcurementDelivery,
  recordProjectProcurementDelivery,
  recordProjectProcurementInvoice,
  reverseProjectProcurementInvoiceAllocation,
  type ProjectProcurementCommitment,
  type ProjectProcurementInvoiceLink,
  type ProjectProcurementRequirement,
} from "@/lib/customers/project-procurement";
import {
  loadProjectProcurementDeliveryEvents,
  type ProjectProcurementDeliveryEvent,
} from "@/lib/customers/project-procurement-deliveries";

type Props = {
  requirement: ProjectProcurementRequirement;
  canManageProcurement: boolean;
  canManageInvoices: boolean;
  onChanged: () => Promise<void>;
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectProcurementReceiptInvoiceActions({
  requirement,
  canManageProcurement,
  canManageInvoices,
  onChanged,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [receiptTarget, setReceiptTarget] = useState<ProjectProcurementCommitment | null>(null);
  const [receivedQuantity, setReceivedQuantity] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayInput());
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const [correctionTarget, setCorrectionTarget] = useState<ProjectProcurementCommitment | null>(null);
  const [deliveryEvents, setDeliveryEvents] = useState<ProjectProcurementDeliveryEvent[]>([]);
  const [deliveryEventId, setDeliveryEventId] = useState("");
  const [correctionQuantity, setCorrectionQuantity] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [invoiceTarget, setInvoiceTarget] = useState<ProjectProcurementCommitment | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayInput());
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState("USD");
  const [invoicedQuantity, setInvoicedQuantity] = useState("");
  const [projectInvoiceCost, setProjectInvoiceCost] = useState("");

  const [reverseTarget, setReverseTarget] = useState<ProjectProcurementInvoiceLink | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  if (!canManageProcurement && !canManageInvoices) return null;

  function openReceipt(commitment: ProjectProcurementCommitment) {
    setReceiptTarget(commitment);
    setReceivedQuantity(String(Math.max(commitment.orderedQuantity - commitment.deliveredQuantity, 0)));
    setDeliveryDate(todayInput());
    setDeliveryNotes("");
    setError(null);
  }

  async function openCorrection(commitment: ProjectProcurementCommitment) {
    setSaving(true);
    setError(null);
    try {
      const events = await loadProjectProcurementDeliveryEvents(commitment.id);
      setDeliveryEvents(events);
      setDeliveryEventId(events[0]?.id ?? "");
      setCorrectionQuantity(events[0] ? String(events[0].effectiveQuantity) : "");
      setCorrectionReason("");
      setCorrectionTarget(commitment);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Delivery history could not be loaded.");
    } finally {
      setSaving(false);
    }
  }

  function openInvoice(commitment: ProjectProcurementCommitment) {
    setInvoiceTarget(commitment);
    setInvoiceNumber("");
    setInvoiceDate(todayInput());
    setInvoiceTotal("");
    setInvoiceCurrency(commitment.currencyCode);
    setInvoicedQuantity(String(Math.max(commitment.orderedQuantity - commitment.invoicedQuantity, 0)));
    setProjectInvoiceCost("");
    setError(null);
  }

  async function saveReceipt() {
    if (!receiptTarget) return;
    setSaving(true);
    setError(null);
    try {
      await recordProjectProcurementDelivery({
        commitmentId: receiptTarget.id,
        quantity: Number(receivedQuantity),
        deliveredDate: deliveryDate,
        notes: deliveryNotes,
      });
      setReceiptTarget(null);
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Delivery could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCorrection() {
    if (!correctionTarget || !deliveryEventId) return;
    setSaving(true);
    setError(null);
    try {
      await correctProjectProcurementDelivery({
        deliveryEventId,
        quantity: Number(correctionQuantity),
        reason: correctionReason,
      });
      setCorrectionTarget(null);
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Delivery correction could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoice() {
    if (!invoiceTarget) return;
    setSaving(true);
    setError(null);
    try {
      await recordProjectProcurementInvoice({
        commitmentId: invoiceTarget.id,
        invoiceNumber,
        invoiceDate,
        invoiceTotal: Number(invoiceTotal),
        currencyCode: invoiceCurrency,
        invoicedQuantity: Number(invoicedQuantity),
        projectInvoiceCost: Number(projectInvoiceCost),
      });
      setInvoiceTarget(null);
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Vendor invoice could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function reverseAllocation() {
    if (!reverseTarget) return;
    setSaving(true);
    setError(null);
    try {
      await reverseProjectProcurementInvoiceAllocation({
        allocationId: reverseTarget.allocationId,
        reason: reverseReason,
      });
      setReverseTarget(null);
      setReverseReason("");
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Invoice allocation could not be reversed.");
    } finally {
      setSaving(false);
    }
  }

  const deliveryOptions = deliveryEvents.map((event) => ({
    value: event.id,
    label: `${event.deliveredDate} — ${event.effectiveQuantity} available to correct`,
  }));

  return (
    <div className="space-y-2">
      {error ? <Alert variant="error" title="Receipt / invoice action failed" message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {requirement.commitments.filter((commitment) => commitment.status !== "cancelled").map((commitment) => (
          <div key={commitment.id} className="flex flex-wrap gap-2">
            {canManageProcurement && commitment.deliveredQuantity < commitment.orderedQuantity ? (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => openReceipt(commitment)}>Receive</Button>
            ) : null}
            {canManageProcurement && commitment.deliveredQuantity > 0 ? (
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void openCorrection(commitment)}>Correct Delivery</Button>
            ) : null}
            {canManageInvoices && commitment.invoicedQuantity < commitment.orderedQuantity ? (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => openInvoice(commitment)}>Add Invoice</Button>
            ) : null}
            {canManageInvoices ? commitment.invoices.map((invoice) => (
              <Button key={invoice.allocationId} size="sm" variant="ghost" disabled={saving} onClick={() => { setReverseTarget(invoice); setReverseReason(""); }}>
                Reverse {invoice.invoiceNumber}
              </Button>
            )) : null}
          </div>
        ))}
      </div>

      <Modal isOpen={Boolean(receiptTarget)} onClose={() => !saving && setReceiptTarget(null)} ariaLabel="Record vendor delivery" className="relative w-full max-w-xl p-6">
        <div className="space-y-5">
          <div className="pr-12"><h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Record Delivery</h3><p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Delivery updates Project procurement receipt status only. It does not create warehouse stock.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor={`received-qty-${requirement.id}`}>Received Quantity</Label><Input id={`received-qty-${requirement.id}`} type="number" min="0" step="0.0001" value={receivedQuantity} onChange={(event) => setReceivedQuantity(event.target.value)} /></div>
            <div><Label htmlFor={`delivery-date-${requirement.id}`}>Delivery Date</Label><Input id={`delivery-date-${requirement.id}`} type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
            <div className="md:col-span-2"><Label htmlFor={`delivery-notes-${requirement.id}`}>Notes</Label><Input id={`delivery-notes-${requirement.id}`} value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setReceiptTarget(null)}>Cancel</Button><Button disabled={saving || Number(receivedQuantity) <= 0 || !deliveryDate} onClick={() => void saveReceipt()}>{saving ? "Saving…" : "Record Delivery"}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(correctionTarget)} onClose={() => !saving && setCorrectionTarget(null)} ariaLabel="Correct vendor delivery" className="relative w-full max-w-xl p-6">
        <div className="space-y-5">
          <div className="pr-12"><h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Correct Delivery</h3><p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Corrections append a negative receipt event; the original delivery record remains in history.</p></div>
          {deliveryEvents.length === 0 ? <Alert variant="warning" title="No delivery to correct" message="No effective delivery event remains for this vendor order." /> : null}
          {deliveryEvents.length > 0 ? (
            <div className="space-y-4">
              <div><Label htmlFor={`delivery-event-${requirement.id}`}>Delivery Event</Label><Select id={`delivery-event-${requirement.id}`} options={deliveryOptions} value={deliveryEventId} onChange={(value) => { setDeliveryEventId(value); const selected = deliveryEvents.find((event) => event.id === value); setCorrectionQuantity(selected ? String(selected.effectiveQuantity) : ""); }} /></div>
              <div><Label htmlFor={`correction-qty-${requirement.id}`}>Correction Quantity</Label><Input id={`correction-qty-${requirement.id}`} type="number" min="0" step="0.0001" value={correctionQuantity} onChange={(event) => setCorrectionQuantity(event.target.value)} /></div>
              <div><Label htmlFor={`correction-reason-${requirement.id}`}>Reason</Label><Input id={`correction-reason-${requirement.id}`} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></div>
            </div>
          ) : null}
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setCorrectionTarget(null)}>Cancel</Button><Button disabled={saving || !deliveryEventId || Number(correctionQuantity) <= 0 || !correctionReason.trim()} onClick={() => void saveCorrection()}>{saving ? "Saving…" : "Save Correction"}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(invoiceTarget)} onClose={() => !saving && setInvoiceTarget(null)} ariaLabel="Record vendor invoice" className="relative w-full max-w-2xl p-6">
        <div className="space-y-5">
          <div className="pr-12"><h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Add Vendor Invoice</h3><p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Vendor Invoice Total is the whole vendor invoice. Invoice Cost is only the amount allocated to this Project/product. Payment status stays in Finance.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor={`invoice-no-${requirement.id}`}>Invoice No</Label><Input id={`invoice-no-${requirement.id}`} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></div>
            <div><Label htmlFor={`invoice-date-${requirement.id}`}>Invoice Date</Label><Input id={`invoice-date-${requirement.id}`} type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></div>
            <div><Label htmlFor={`invoice-total-${requirement.id}`}>Vendor Invoice Total</Label><Input id={`invoice-total-${requirement.id}`} type="number" min="0" step="0.01" value={invoiceTotal} onChange={(event) => setInvoiceTotal(event.target.value)} /></div>
            <div><Label htmlFor={`invoice-currency-${requirement.id}`}>Currency</Label><Input id={`invoice-currency-${requirement.id}`} maxLength={3} value={invoiceCurrency} onChange={(event) => setInvoiceCurrency(event.target.value.toUpperCase())} /></div>
            <div><Label htmlFor={`invoiced-qty-${requirement.id}`}>Invoiced Quantity</Label><Input id={`invoiced-qty-${requirement.id}`} type="number" min="0" step="0.0001" value={invoicedQuantity} onChange={(event) => setInvoicedQuantity(event.target.value)} /></div>
            <div><Label htmlFor={`project-invoice-cost-${requirement.id}`}>Invoice Cost for this Project/product</Label><Input id={`project-invoice-cost-${requirement.id}`} type="number" min="0" step="0.01" value={projectInvoiceCost} onChange={(event) => setProjectInvoiceCost(event.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setInvoiceTarget(null)}>Cancel</Button><Button disabled={saving || !invoiceNumber.trim() || !invoiceDate || Number(invoiceTotal) <= 0 || invoiceCurrency.trim().length !== 3 || Number(invoicedQuantity) <= 0 || Number(projectInvoiceCost) <= 0} onClick={() => void saveInvoice()}>{saving ? "Saving…" : "Add Invoice"}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(reverseTarget)} onClose={() => !saving && setReverseTarget(null)} ariaLabel="Reverse vendor invoice allocation" className="relative w-full max-w-xl p-6">
        <div className="space-y-5">
          <div className="pr-12"><h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Reverse Invoice Allocation</h3><p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>The canonical vendor invoice remains. This removes only this Project/product allocation through an append-safe reversal.</p></div>
          <div><Label htmlFor={`invoice-reversal-reason-${requirement.id}`}>Reason</Label><Input id={`invoice-reversal-reason-${requirement.id}`} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setReverseTarget(null)}>Cancel</Button><Button variant="danger" disabled={saving || !reverseReason.trim()} onClick={() => void reverseAllocation()}>{saving ? "Reversing…" : "Reverse Allocation"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
