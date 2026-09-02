"use client";

import { useEffect, useState } from "react";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";

type ManualServiceLineValue = {
  lineNote: string;
  unitPrice: number;
};

type ManualServiceLineModalProps = {
  isOpen: boolean;
  currencyCode: string;
  initialLineNote?: string | null;
  initialUnitPrice?: string | number | null;
  onClose: () => void;
  onSubmit: (value: ManualServiceLineValue) => void;
};

export default function ManualServiceLineModal({
  isOpen,
  currencyCode,
  initialLineNote,
  initialUnitPrice,
  onClose,
  onSubmit,
}: ManualServiceLineModalProps) {
  const [lineNote, setLineNote] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [lineNoteError, setLineNoteError] = useState<string | null>(null);
  const [unitPriceError, setUnitPriceError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLineNote(initialLineNote ?? "");
    setUnitPrice(initialUnitPrice === null || initialUnitPrice === undefined ? "" : String(initialUnitPrice));
    setLineNoteError(null);
    setUnitPriceError(null);
  }, [initialLineNote, initialUnitPrice, isOpen]);

  function submit() {
    const normalizedNote = lineNote.trim();
    const normalizedPrice = unitPrice.trim();
    const parsedPrice = Number(normalizedPrice);
    const nextLineNoteError = normalizedNote ? null : "Service detail is required.";
    const nextUnitPriceError = !normalizedPrice
      ? "Service price is required."
      : !Number.isFinite(parsedPrice)
        ? "Service price must be a valid number."
        : parsedPrice < 0
          ? "Service price cannot be negative."
          : null;

    setLineNoteError(nextLineNoteError);
    setUnitPriceError(nextUnitPriceError);
    if (nextLineNoteError || nextUnitPriceError) return;

    onSubmit({ lineNote: normalizedNote, unitPrice: parsedPrice });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 w-full max-w-xl p-6" ariaLabel="Service line">
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Service</h3>
          <FormHint>Enter the customer-facing service detail and the explicit amount for this order line.</FormHint>
        </div>

        <div>
          <Label htmlFor="service-line-detail">Service Detail</Label>
          <TextArea
            id="service-line-detail"
            rows={5}
            value={lineNote}
            onChange={setLineNote}
            placeholder="Describe the service"
            error={Boolean(lineNoteError)}
            hint={lineNoteError ?? "This text is saved on the order and copied to the invoice snapshot."}
          />
        </div>

        <div>
          <Label htmlFor="service-line-price">Price ({currencyCode || "USD"})</Label>
          <Input
            id="service-line-price"
            inputMode="decimal"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            placeholder="0.00"
            error={Boolean(unitPriceError)}
            hint={unitPriceError ?? "Enter the explicit price for this service."}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save Service</Button>
        </div>
      </div>
    </Modal>
  );
}