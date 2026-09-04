"use client";

import { useState } from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  cancelProjectProcurementCommitment,
  confirmProjectProcurementCommitment,
  createProjectProcurementCommitment,
  resolveProjectProcurementVendor,
  type ProjectProcurementCommitment,
  type ProjectProcurementRequirement,
} from "@/lib/customers/project-procurement";

type Props = {
  requirement: ProjectProcurementRequirement;
  canManage: boolean;
  onChanged: () => Promise<void>;
};

export default function ProjectProcurementOrderActions({ requirement, canManage, onChanged }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorCode, setVendorCode] = useState(requirement.vendorCode ?? "");
  const [vendorName, setVendorName] = useState(requirement.vendorName ?? "");
  const [orderOpen, setOrderOpen] = useState(false);
  const [poNo, setPoNo] = useState("");
  const [quantity, setQuantity] = useState(String(requirement.openQuantity ?? ""));
  const [unitCost, setUnitCost] = useState(requirement.expectedUnitCost === null ? "" : String(requirement.expectedUnitCost));
  const [currency, setCurrency] = useState(requirement.expectedCostCurrency ?? "USD");
  const [cancelTarget, setCancelTarget] = useState<ProjectProcurementCommitment | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  if (!canManage) return null;

  const canSetVendor = requirement.isCurrent && requirement.commitments.length === 0;
  const canCreateOrder = requirement.isCurrent
    && requirement.vendorCode !== null
    && requirement.requiredQuantity !== null
    && (requirement.openQuantity ?? 0) > 0;

  function openOrderModal() {
    setQuantity(String(requirement.openQuantity ?? ""));
    setUnitCost(requirement.expectedUnitCost === null ? "" : String(requirement.expectedUnitCost));
    setCurrency(requirement.expectedCostCurrency ?? "USD");
    setPoNo("");
    setError(null);
    setOrderOpen(true);
  }

  async function saveVendor() {
    setSaving(true);
    setError(null);
    try {
      await resolveProjectProcurementVendor({ requirementId: requirement.id, vendorCode, vendorName });
      setVendorOpen(false);
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Vendor could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function createOrder() {
    setSaving(true);
    setError(null);
    try {
      await createProjectProcurementCommitment({
        requirementId: requirement.id,
        orderedQuantity: Number(quantity),
        agreedUnitCost: Number(unitCost),
        currencyCode: currency,
        vendorOrderNo: poNo,
      });
      setOrderOpen(false);
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Vendor order could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCommitment(commitment: ProjectProcurementCommitment) {
    setSaving(true);
    setError(null);
    try {
      await confirmProjectProcurementCommitment(commitment.id);
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Vendor order could not be confirmed.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelCommitment() {
    if (!cancelTarget) return;
    setSaving(true);
    setError(null);
    try {
      await cancelProjectProcurementCommitment({ commitmentId: cancelTarget.id, reason: cancelReason });
      setCancelTarget(null);
      setCancelReason("");
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Vendor order could not be cancelled.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="error" title="Procurement action failed" message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {canSetVendor ? (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => setVendorOpen(true)}>
            {requirement.vendorCode ? "Change Vendor" : "Set Vendor"}
          </Button>
        ) : null}
        {canCreateOrder ? <Button size="sm" disabled={saving} onClick={openOrderModal}>Create Order</Button> : null}
        {requirement.commitments.map((commitment) => (
          <div key={commitment.id} className="flex flex-wrap gap-2">
            {commitment.status === "ordered" ? (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => void confirmCommitment(commitment)}>Confirm</Button>
            ) : null}
            {commitment.status !== "cancelled" ? (
              <Button size="sm" variant="danger" disabled={saving} onClick={() => { setCancelTarget(commitment); setCancelReason(""); }}>Cancel</Button>
            ) : null}
          </div>
        ))}
      </div>

      <Modal isOpen={vendorOpen} onClose={() => !saving && setVendorOpen(false)} ariaLabel="Set procurement vendor" className="relative w-full max-w-xl p-6">
        <div className="space-y-5">
          <div className="pr-12">
            <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Set Vendor</h3>
            <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Resolve the vendor before a purchase is placed. Once a vendor order exists, vendor identity is historical and cannot be rewritten.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor={`procurement-vendor-code-${requirement.id}`}>Vendor Code</Label><Input id={`procurement-vendor-code-${requirement.id}`} value={vendorCode} onChange={(event) => setVendorCode(event.target.value)} /></div>
            <div><Label htmlFor={`procurement-vendor-name-${requirement.id}`}>Vendor Name</Label><Input id={`procurement-vendor-name-${requirement.id}`} value={vendorName} onChange={(event) => setVendorName(event.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={saving} onClick={() => setVendorOpen(false)}>Cancel</Button>
            <Button disabled={saving || !vendorCode.trim() || !vendorName.trim()} onClick={() => void saveVendor()}>{saving ? "Saving…" : "Save Vendor"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={orderOpen} onClose={() => !saving && setOrderOpen(false)} ariaLabel="Create vendor order" className="relative w-full max-w-2xl p-6">
        <div className="space-y-5">
          <div className="pr-12">
            <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Create Vendor Order</h3>
            <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Record the real vendor commitment. Later Customer Order revisions will not silently rewrite this purchase.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor={`procurement-po-${requirement.id}`}>PO / Vendor Order No</Label><Input id={`procurement-po-${requirement.id}`} value={poNo} onChange={(event) => setPoNo(event.target.value)} /></div>
            <div><Label htmlFor={`procurement-qty-${requirement.id}`}>Quantity</Label><Input id={`procurement-qty-${requirement.id}`} type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
            <div><Label htmlFor={`procurement-cost-${requirement.id}`}>Agreed Unit Cost</Label><Input id={`procurement-cost-${requirement.id}`} type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></div>
            <div><Label htmlFor={`procurement-currency-${requirement.id}`}>Currency</Label><Input id={`procurement-currency-${requirement.id}`} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={saving} onClick={() => setOrderOpen(false)}>Cancel</Button>
            <Button disabled={saving || !poNo.trim() || Number(quantity) <= 0 || Number(unitCost) < 0 || currency.trim().length !== 3} onClick={() => void createOrder()}>{saving ? "Creating…" : "Create Order"}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(cancelTarget)} onClose={() => !saving && setCancelTarget(null)} ariaLabel="Cancel vendor order" className="relative w-full max-w-xl p-6">
        <div className="space-y-5">
          <div className="pr-12">
            <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Cancel Vendor Order</h3>
            <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Cancellation preserves the vendor-order history and releases the quantity back to the open Project requirement.</p>
          </div>
          <div><Label htmlFor={`procurement-cancel-reason-${requirement.id}`}>Cancellation Reason</Label><Input id={`procurement-cancel-reason-${requirement.id}`} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={saving} onClick={() => setCancelTarget(null)}>Back</Button>
            <Button variant="danger" disabled={saving || !cancelReason.trim()} onClick={() => void cancelCommitment()}>{saving ? "Cancelling…" : "Cancel Order"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
