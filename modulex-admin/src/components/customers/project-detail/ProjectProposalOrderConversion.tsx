"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  getProjectProposalOrderConversionPreview,
  mapProposalOrderConversionError,
  type ProposalOrderConversionPreview,
} from "@/lib/customers/project-proposal-order-conversion-domain";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function ProjectProposalOrderConversion({
  projectId,
  revisionId,
  canManage,
}: {
  projectId: string;
  revisionId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<ProposalOrderConversionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await getProjectProposalOrderConversionPreview(revisionId));
    } catch (loadError) {
      setError(mapProposalOrderConversionError(loadError));
    } finally {
      setLoading(false);
    }
  }, [revisionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableUnits = useMemo(
    () => preview?.units.filter((unit) => !unit.convertedOrderId) ?? [],
    [preview],
  );

  const selectedUnits = useMemo(
    () => availableUnits.filter((unit) => selectedUnitIds.has(unit.unitId)),
    [availableUnits, selectedUnitIds],
  );

  const selectedAreaIds = useMemo(
    () => selectedUnits.flatMap((unit) => unit.areas.map((area) => area.id)),
    [selectedUnits],
  );

  const selectedTotal = selectedUnits.reduce((sum, unit) => sum + unit.acceptedSellAmount, 0);

  function toggleUnit(unitId: string) {
    setSelectedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function continueToOrder() {
    if (!preview || selectedAreaIds.length === 0) return;
    const query = new URLSearchParams({
      projectId,
      proposalRevisionId: preview.revisionId,
      proposalAreaIds: selectedAreaIds.join(","),
    });
    router.push(`/customers/${preview.customerId}/orders/new?${query.toString()}`);
  }

  if (loading && !preview) {
    return (
      <ComponentCard title="Create Order from Proposal" desc="Preparing accepted Proposal scope for Order conversion.">
        <p className="text-sm" role="status">Loading accepted Proposal conversion status…</p>
      </ComponentCard>
    );
  }

  if (error && !preview) {
    return (
      <ComponentCard title="Create Order from Proposal" desc="Accepted Proposal scope could not be prepared.">
        <div className="space-y-3">
          <Alert variant="error" title="Proposal conversion unavailable" message={error} />
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>Retry</Button>
        </div>
      </ComponentCard>
    );
  }

  if (!preview) return null;

  return (
    <>
      <ComponentCard
        title="Create Order from Proposal"
        desc={`Revision ${preview.revisionNo} is accepted. Order creation remains an explicit workflow and always starts as Draft.`}
        headerAction={canManage && availableUnits.length > 0 ? (
          <Button size="sm" onClick={() => setOpen(true)}>Create Order from Proposal</Button>
        ) : undefined}
      >
        <div className="space-y-3">
          <p className="text-sm">
            Accepted Proposal scope can be partitioned across multiple Orders. Pricing Groups stay atomic and are never split across member Areas.
          </p>
          {!canManage ? <Alert variant="warning" title="Conversion access restricted" message="You can view accepted Proposal conversion history, but Order creation requires Sales or Admin Order management access." /> : null}
          {availableUnits.length === 0 ? <Alert variant="info" title="Accepted scope already converted" message="Every accepted Area in this Revision is already linked to a Proposal-created Order." /> : null}
          {preview.units.some((unit) => unit.convertedOrderId) ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Converted scope</p>
              {preview.units.filter((unit) => unit.convertedOrderId).map((unit) => (
                <div key={unit.unitId} className="flex flex-wrap items-center justify-between gap-2 border p-3 text-sm">
                  <span>{unit.label} · {money(unit.acceptedSellAmount, preview.currencyCode)}</span>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${preview.customerId}/orders/${unit.convertedOrderId}`)}>
                    Open {unit.convertedOrderNumber || "Order"}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ComponentCard>

      <Modal isOpen={open} onClose={() => setOpen(false)} className="m-4 w-full max-w-3xl p-6" ariaLabel="Create Order from Proposal">
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">Create Order from Proposal</h3>
            <p className="mt-1 text-sm">Accepted Revision {preview.revisionNo} · choose the commercial units for this Draft Order.</p>
          </div>

          {error ? <Alert variant="error" title="Proposal conversion selection failed" message={error} /> : null}

          <div className="space-y-3">
            {availableUnits.map((unit) => {
              const selected = selectedUnitIds.has(unit.unitId);
              const group = unit.kind === "pricing_group";
              return (
                <div key={unit.unitId} className="border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{unit.label}</p>
                      <p className="mt-1 text-sm">{group ? "Atomic Pricing Group" : "Accepted Area"} · {money(unit.acceptedSellAmount, preview.currencyCode)}</p>
                      <p className="mt-1 text-sm">Areas: {unit.areas.map((area) => area.areaName).join(", ")}</p>
                    </div>
                    <Button size="sm" variant={selected ? "primary" : "outline"} onClick={() => toggleUnit(unit.unitId)}>
                      {selected ? "Selected" : group ? "Select Group" : "Select Area"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-sm">Selected accepted pre-tax scope</p>
              <p className="text-lg font-semibold">{money(selectedTotal, preview.currencyCode)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={continueToOrder} disabled={selectedAreaIds.length === 0}>Continue to Order</Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
