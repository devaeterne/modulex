"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import FileInput from "@/components/form/input/FileInput";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  calculateCustomVendorCabinetSellPrice,
  loadActiveCustomVendorCabinetVendors,
  validateCustomVendorCabinetPdf,
  type ActiveOrderVendor,
  type CustomVendorCabinetDraft,
} from "@/lib/customers/custom-vendor-cabinet";

type Props = {
  isOpen: boolean;
  currencyCode: string;
  onClose: () => void;
  onSubmit: (value: CustomVendorCabinetDraft) => void;
};

export default function CustomVendorCabinetLineModal({ isOpen, currencyCode, onClose, onSubmit }: Props) {
  const [vendors, setVendors] = useState<ActiveOrderVendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [lineName, setLineName] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setVendorId("");
    setLineName("");
    setTotalCost("");
    setMarkupPercent("");
    setFile(null);
    setError(null);
    setFileInputKey((value) => value + 1);
    setLoading(true);
    loadActiveCustomVendorCabinetVendors()
      .then((rows) => {
        if (active) setVendors(rows);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Active vendors could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isOpen]);

  const selectedVendor = useMemo(() => vendors.find((vendor) => vendor.id === vendorId) ?? null, [vendorId, vendors]);
  const sellPrice = useMemo(() => {
    const cost = Number(totalCost);
    const markup = Number(markupPercent);
    if (!totalCost.trim() || !markupPercent.trim() || !Number.isFinite(cost) || !Number.isFinite(markup) || cost < 0 || markup < 0 || markup > 1000) return null;
    return calculateCustomVendorCabinetSellPrice(cost, markup);
  }, [markupPercent, totalCost]);

  function submit() {
    setError(null);
    try {
      const normalizedLineName = lineName.trim();
      const cost = Number(totalCost);
      const markup = Number(markupPercent);
      if (!selectedVendor) throw new Error("Vendor is required.");
      if (!normalizedLineName) throw new Error("Line Name is required.");
      if (normalizedLineName.length > 160) throw new Error("Line Name must be 160 characters or fewer.");
      if (!totalCost.trim() || !Number.isFinite(cost) || cost < 0) throw new Error("Total Cost must be zero or greater.");
      if (!markupPercent.trim() || !Number.isFinite(markup) || markup < 0 || markup > 1000) throw new Error("Markup % must be between 0 and 1000.");
      if (!file) throw new Error("Vendor PDF is required.");
      validateCustomVendorCabinetPdf(file);
      onSubmit({
        vendorId: selectedVendor.id,
        vendorName: selectedVendor.display_name || selectedVendor.legal_name,
        lineName: normalizedLineName,
        totalCost: cost,
        markupPercent: markup,
        sellPrice: calculateCustomVendorCabinetSellPrice(cost, markup),
        file,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vendor Cabinet line is invalid.");
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 w-full max-w-2xl p-6" ariaLabel="Vendor Cabinet line">
      <div className="space-y-5">
        <div>
          <h3 className={`text-base font-medium ${ADMIN_TEXT_STYLES.strong}`}>Vendor Cabinet</h3>
          <FormHint>Create one productless Order line from a vendor quote. Cost and markup stay internal; the customer sees only the calculated sell price.</FormHint>
        </div>

        {error ? <Alert variant="error" title="Vendor Cabinet line" message={error} /> : null}

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <Label htmlFor="vendor-cabinet-vendor">Vendor</Label>
            <Link className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`} href="/finance/vendors">Manage Vendors</Link>
          </div>
          <Select
            id="vendor-cabinet-vendor"
            value={vendorId}
            onChange={setVendorId}
            options={vendors.map((vendor) => ({ value: vendor.id, label: `${vendor.display_name || vendor.legal_name} · ${vendor.code}` }))}
            placeholder={loading ? "Loading active vendors…" : "Select vendor"}
            disabled={loading}
          />
          {!loading && vendors.length === 0 ? <FormHint>No active vendors are available. Create or activate one in Vendor Management.</FormHint> : null}
        </div>

        <div>
          <Label htmlFor="vendor-cabinet-line-name">Line Name</Label>
          <Input id="vendor-cabinet-line-name" value={lineName} onChange={(event) => setLineName(event.target.value)} maxLength={160} placeholder="Crystal Cabinet" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="vendor-cabinet-total-cost">Total Cost ({currencyCode || "USD"})</Label>
            <Input id="vendor-cabinet-total-cost" inputMode="decimal" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label htmlFor="vendor-cabinet-markup">Markup %</Label>
            <Input id="vendor-cabinet-markup" inputMode="decimal" value={markupPercent} onChange={(event) => setMarkupPercent(event.target.value)} placeholder="70" />
          </div>
        </div>

        <div>
          <Label htmlFor="vendor-cabinet-pdf">Vendor PDF</Label>
          <FileInput
            key={fileInputKey}
            id="vendor-cabinet-pdf"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setFile(nextFile);
              setError(null);
            }}
          />
          <FormHint>Private Order evidence · PDF only · max 25 MiB.</FormHint>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <span className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>Sell Price</span>
            <FormHint>{sellPrice === null ? "Enter Total Cost and Markup %." : new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode || "USD" }).format(sellPrice)}</FormHint>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={loading}>Add Vendor Cabinet</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
