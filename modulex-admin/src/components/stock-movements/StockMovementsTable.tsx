"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";

type MovementType =
  | "in"
  | "out"
  | "transfer"
  | "adjustment"
  | "return"
  | "damage"
  | "reservation"
  | "release"
  | string;

type StockMovement = {
  movement_id: string;
  reference_no: string | null;
  sku: string;
  product_name: string;
  barcode: string | null;
  movement_type: MovementType;
  quantity: number;
  from_warehouse_code: string | null;
  from_location_code: string | null;
  to_warehouse_code: string | null;
  to_location_code: string | null;
  reason: string | null;
  notes: string | null;
  created_by_email: string | null;
  created_at: string;
};

type PendingReversal = {
  signature: string;
  key: string;
};

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light";
type MovementModalMode = "details" | "reverse";

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatNumber = (value: number | string | null | undefined) =>
  numberFormatter.format(Number(value ?? 0));
const formatDate = (value: string) => dateFormatter.format(new Date(value));

function movementTypeColor(type: MovementType): BadgeColor {
  switch (type) {
    case "in":
      return "success";
    case "out":
    case "damage":
      return "error";
    case "transfer":
      return "primary";
    case "adjustment":
      return "warning";
    case "reservation":
    case "release":
      return "info";
    default:
      return "light";
  }
}

function formatMovementType(type: MovementType) {
  return String(type)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function movementLocation(warehouseCode: string | null, locationCode: string | null) {
  if (!warehouseCode && !locationCode) return "-";
  return [warehouseCode, locationCode].filter(Boolean).join(" / ");
}

function reversalErrorMessage(message: string) {
  if (message.includes("Movement has already been reversed")) {
    return "This movement has already been reversed.";
  }
  if (message.includes("A reversal movement cannot itself be reversed")) {
    return "A reversal movement cannot itself be reversed.";
  }
  if (message.startsWith("Cannot reverse")) {
    return message;
  }
  if (message.includes("Unsupported movement type")) {
    return "This legacy movement type cannot be reversed automatically. Post a separate corrective stock operation instead.";
  }
  if (message.includes("Permission denied")) {
    return "You do not have permission to reverse this movement.";
  }
  return "The movement could not be reversed. Review current stock and try again.";
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="mt-1 text-sm text-gray-800 dark:text-white/90">{value || "-"}</div>
    </div>
  );
}

export default function StockMovementsTable() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const [modalMode, setModalMode] = useState<MovementModalMode>("details");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalReference, setReversalReference] = useState("");
  const [reversalNotes, setReversalNotes] = useState("");
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [isReversing, setIsReversing] = useState(false);
  const reversalKeyRef = useRef<PendingReversal | null>(null);

  const canReverse = hasPermission(profile?.roles, "inventory.manage");

  const loadMovements = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("v_inventory_movement_history")
      .select(
        "movement_id, reference_no, sku, product_name, barcode, movement_type, quantity, from_warehouse_code, from_location_code, to_warehouse_code, to_location_code, reason, notes, created_by_email, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Failed to load stock movements", error);
      setErrorMessage("Stock movements could not be loaded. Try again.");
      setMovements([]);
    } else {
      setMovements((data as StockMovement[]) ?? []);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    async function loadProfile() {
      const { profile: currentProfile, error } = await getCurrentProfile();
      if (error) {
        console.error("Failed to load movement action permissions", error);
        return;
      }
      setProfile(currentProfile);
    }

    void loadProfile();
  }, []);

  function resetReversalForm() {
    setReversalReason("");
    setReversalReference("");
    setReversalNotes("");
    setReversalError(null);
    reversalKeyRef.current = null;
  }

  function openDetails(movement: StockMovement) {
    resetReversalForm();
    setSelectedMovement(movement);
    setModalMode("details");
  }

  function openReverse(movement: StockMovement) {
    resetReversalForm();
    setReversalReference(movement.reference_no ?? "");
    setSelectedMovement(movement);
    setModalMode("reverse");
  }

  function closeMovementModal() {
    if (isReversing) return;
    setSelectedMovement(null);
    setModalMode("details");
    resetReversalForm();
  }

  function getReversalKey(movementId: string, reason: string, referenceNo: string, notes: string) {
    const signature = JSON.stringify([movementId, reason, referenceNo, notes]);
    if (!reversalKeyRef.current || reversalKeyRef.current.signature !== signature) {
      reversalKeyRef.current = { signature, key: crypto.randomUUID() };
    }
    return reversalKeyRef.current.key;
  }

  async function handleReverse() {
    if (!selectedMovement || !canReverse) return;

    const reason = reversalReason.trim();
    const referenceNo = reversalReference.trim();
    const notes = reversalNotes.trim();

    if (!reason) {
      setReversalError("Reason is required for a movement correction.");
      return;
    }

    setIsReversing(true);
    setReversalError(null);
    setActionSuccessMessage(null);

    const { error } = await supabase.rpc("reverse_inventory_movement", {
      p_movement_id: selectedMovement.movement_id,
      p_idempotency_key: getReversalKey(selectedMovement.movement_id, reason, referenceNo, notes),
      p_reason: reason,
      p_reference_no: referenceNo || null,
      p_notes: notes || null,
    });

    if (error) {
      console.error("Failed to reverse inventory movement", error);
      setReversalError(reversalErrorMessage(error.message));
      setIsReversing(false);
      return;
    }

    reversalKeyRef.current = null;
    setActionSuccessMessage(
      `Movement ${selectedMovement.reference_no || selectedMovement.movement_id} was reversed with a linked corrective movement.`,
    );
    setIsReversing(false);
    setSelectedMovement(null);
    resetReversalForm();
    await loadMovements();
  }

  return (
    <ComponentCard
      title="Movement History"
      desc="Track stock entries, exits, transfers, reservations, and adjustments. Posted movements are immutable; corrections create linked reversal movements."
    >
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={() => void loadMovements()}
        >
          <span className="sr-only">Refresh stock movement history</span>
          <span aria-hidden="true">{isLoading ? "Refreshing…" : "Refresh"}</span>
        </Button>
      </div>

      {actionSuccessMessage ? (
        <div role="status" aria-live="polite">
          <Alert variant="success" title="Movement corrected" message={actionSuccessMessage} />
        </div>
      ) : null}

      {errorMessage ? (
        <div role="alert" className="space-y-3">
          <Alert variant="error" title="Movement history unavailable" message={errorMessage} />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadMovements()}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <div aria-busy={isLoading}>
        <TableViewport>
          <Table variant="admin" className="w-full min-w-[1120px]">
            <caption className="sr-only">Most recent stock movements</caption>
            <TableHeader variant="admin">
              <TableRow>
                {["Reference", "Product", "Type", "Quantity", "From", "To", "User", "Date", "Actions"].map(
                  (label) => (
                    <TableCell
                      key={label}
                      isHeader
                      variant="admin"
                      className={
                        label === "Quantity"
                          ? "text-right"
                          : label === "Actions"
                            ? "text-right"
                            : "text-left"
                      }
                    >
                      {label}
                    </TableCell>
                  ),
                )}
              </TableRow>
            </TableHeader>

            <TableBody variant="admin">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} variant="admin" className="py-8 text-center">
                    <span role="status">Loading stock movements...</span>
                  </TableCell>
                </TableRow>
              ) : movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} variant="admin" className="py-8 text-center">
                    No stock movements found.
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((movement) => (
                  <TableRow key={movement.movement_id}>
                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">
                        {movement.reference_no || "-"}
                      </p>
                      {movement.reason ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{movement.reason}</p>
                      ) : null}
                    </TableCell>

                    <TableCell variant="admin">
                      <p className="font-medium text-gray-800 dark:text-white/90">{movement.sku}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{movement.product_name}</p>
                      {movement.barcode ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Barcode: {movement.barcode}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell variant="admin">
                      <Badge color={movementTypeColor(movement.movement_type)} size="sm">
                        {formatMovementType(movement.movement_type)}
                      </Badge>
                    </TableCell>

                    <TableCell
                      variant="admin"
                      className="text-right font-medium text-gray-800 dark:text-white/90"
                    >
                      {formatNumber(movement.quantity)}
                    </TableCell>

                    <TableCell variant="admin">
                      {movement.from_location_code ? (
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {movement.from_location_code}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {movement.from_warehouse_code || "-"}
                          </p>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>

                    <TableCell variant="admin">
                      {movement.to_location_code ? (
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {movement.to_location_code}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {movement.to_warehouse_code || "-"}
                          </p>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>

                    <TableCell variant="admin">{movement.created_by_email || "System"}</TableCell>
                    <TableCell variant="admin">{formatDate(movement.created_at)}</TableCell>
                    <TableCell variant="admin" className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openDetails(movement)}>
                          View Details
                        </Button>
                        {canReverse ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => openReverse(movement)}>
                            Reverse / Correct
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableViewport>
      </div>

      <Modal
        isOpen={Boolean(selectedMovement)}
        onClose={closeMovementModal}
        closeOnEscape={!isReversing}
        className="m-4 max-h-[90vh] max-w-[760px] overflow-hidden"
      >
        {selectedMovement ? (
          <div className="flex max-h-[90vh] flex-col">
            <div className="border-b border-gray-200 px-5 py-5 pr-16 dark:border-gray-800 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {modalMode === "reverse" ? "Reverse / Correct Movement" : "Movement Details"}
                </h3>
                <Badge color={movementTypeColor(selectedMovement.movement_type)} size="sm">
                  {formatMovementType(selectedMovement.movement_type)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {modalMode === "reverse"
                  ? "The posted movement stays immutable. This creates one linked compensating movement."
                  : "Review the immutable audit record for this stock movement."}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailItem label="Reference" value={selectedMovement.reference_no || "-"} />
                <DetailItem label="Movement ID" value={selectedMovement.movement_id} />
                <DetailItem
                  label="Product"
                  value={`${selectedMovement.sku} - ${selectedMovement.product_name}`}
                />
                <DetailItem label="Barcode" value={selectedMovement.barcode || "-"} />
                <DetailItem label="Quantity" value={formatNumber(selectedMovement.quantity)} />
                <DetailItem label="Date" value={formatDate(selectedMovement.created_at)} />
                <DetailItem
                  label="From"
                  value={movementLocation(
                    selectedMovement.from_warehouse_code,
                    selectedMovement.from_location_code,
                  )}
                />
                <DetailItem
                  label="To"
                  value={movementLocation(
                    selectedMovement.to_warehouse_code,
                    selectedMovement.to_location_code,
                  )}
                />
                <DetailItem label="Created By" value={selectedMovement.created_by_email || "System"} />
                <DetailItem label="Reason" value={selectedMovement.reason || "-"} />
                <div className="sm:col-span-2">
                  <DetailItem label="Notes" value={selectedMovement.notes || "-"} />
                </div>
              </div>

              {modalMode === "reverse" ? (
                <div className="mt-6 space-y-4">
                  {reversalError ? (
                    <div role="alert">
                      <Alert variant="error" title="Correction could not be posted" message={reversalError} />
                    </div>
                  ) : null}

                  <div>
                    <Label htmlFor="movement-reversal-reason">
                      Reason <span className="text-error-500">*</span>
                    </Label>
                    <TextArea
                      id="movement-reversal-reason"
                      value={reversalReason}
                      onChange={setReversalReason}
                      rows={3}
                      required
                      disabled={isReversing}
                      placeholder="Explain why this posted movement must be corrected"
                    />
                  </div>

                  <div>
                    <Label htmlFor="movement-reversal-reference">Reference No</Label>
                    <Input
                      id="movement-reversal-reference"
                      value={reversalReference}
                      onChange={(event) => setReversalReference(event.target.value)}
                      disabled={isReversing}
                      placeholder="Optional correction reference"
                    />
                  </div>

                  <div>
                    <Label htmlFor="movement-reversal-notes">Notes</Label>
                    <TextArea
                      id="movement-reversal-notes"
                      value={reversalNotes}
                      onChange={setReversalNotes}
                      rows={3}
                      disabled={isReversing}
                      placeholder="Optional correction notes"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
              <Button type="button" variant="outline" onClick={closeMovementModal} disabled={isReversing}>
                Close
              </Button>
              {modalMode === "details" && canReverse ? (
                <Button type="button" onClick={() => setModalMode("reverse")}>
                  Reverse / Correct
                </Button>
              ) : null}
              {modalMode === "reverse" ? (
                <Button type="button" disabled={isReversing} onClick={() => void handleReverse()}>
                  {isReversing ? "Posting Correction..." : "Post Correction"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </ComponentCard>
  );
}
