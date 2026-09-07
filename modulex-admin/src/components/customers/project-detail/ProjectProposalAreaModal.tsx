"use client";

import { useEffect, useMemo, useState } from "react";
import Label from "@/components/form/Label";
import SearchableSelect from "@/components/form/SearchableSelect";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  mapProjectProposalError,
  searchProposalMaterialProducts,
  upsertProjectProposalArea,
  type ProposalAreaType,
  type ProposalMaterialProductOption,
  type ProjectProposalArea,
  type ProjectProposalPricingGroup,
  type ProjectProposalReadiness,
} from "@/lib/customers/project-proposal-domain";

const readinessOptions = [
  { value: "not_ready", label: "Not ready" },
  { value: "ready_to_measure", label: "Ready to measure" },
  { value: "needs_remeasure", label: "Needs remeasure" },
  { value: "ready_to_cut", label: "Ready to cut" },
];

function valueOf(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

export default function ProjectProposalAreaModal({
  isOpen,
  onClose,
  revisionId,
  area,
  areaTypes,
  pricingGroups,
  defaultSortOrder,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  revisionId: string;
  area: ProjectProposalArea | null;
  areaTypes: ProposalAreaType[];
  pricingGroups: ProjectProposalPricingGroup[];
  defaultSortOrder: number;
  onSaved: () => Promise<void> | void;
}) {
  const [draftId, setDraftId] = useState("");
  const [areaTypeId, setAreaTypeId] = useState("");
  const [areaName, setAreaName] = useState("");
  const [readinessStatus, setReadinessStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [materialProductId, setMaterialProductId] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [supplierSnapshot, setSupplierSnapshot] = useState("");
  const [finish, setFinish] = useState("");
  const [thickness, setThickness] = useState("");
  const [sqFt, setSqFt] = useState("");
  const [linearFt, setLinearFt] = useState("");
  const [edgeProfile, setEdgeProfile] = useState("");
  const [edgeLinearFt, setEdgeLinearFt] = useState("");
  const [backsplash, setBacksplash] = useState("");
  const [backsplashNotes, setBacksplashNotes] = useState("");
  const [sinkQuantity, setSinkQuantity] = useState("");
  const [sinkSource, setSinkSource] = useState("");
  const [sinkCutoutQuantity, setSinkCutoutQuantity] = useState("");
  const [sinkTemplateStatus, setSinkTemplateStatus] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");
  const [measurementNotes, setMeasurementNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [pricingGroupId, setPricingGroupId] = useState("");
  const [directSellAmount, setDirectSellAmount] = useState("");
  const [productOptions, setProductOptions] = useState<ProposalMaterialProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraftId(area?.id ?? crypto.randomUUID());
    setAreaTypeId(area?.areaTypeId ?? "");
    setAreaName(area?.areaName ?? "");
    setReadinessStatus(area?.readinessStatus ?? "");
    setStatusNote(area?.statusNote ?? "");
    setMaterialProductId(area?.materialProductId ?? "");
    setMaterialDescription(area?.materialDescription ?? "");
    setSupplierSnapshot(area?.supplierSnapshot ?? "");
    setFinish(area?.finish ?? "");
    setThickness(area?.thickness ?? "");
    setSqFt(valueOf(area?.sqFt));
    setLinearFt(valueOf(area?.linearFt));
    setEdgeProfile(area?.edgeProfile ?? "");
    setEdgeLinearFt(valueOf(area?.edgeLinearFt));
    setBacksplash(area?.backsplash ?? "");
    setBacksplashNotes(area?.backsplashNotes ?? "");
    setSinkQuantity(valueOf(area?.sinkQuantity));
    setSinkSource(area?.sinkSource ?? "");
    setSinkCutoutQuantity(valueOf(area?.sinkCutoutQuantity));
    setSinkTemplateStatus(area?.sinkTemplateStatus ?? "");
    setScopeNotes(area?.scopeNotes ?? "");
    setMeasurementNotes(area?.measurementNotes ?? "");
    setInternalNotes(area?.internalNotes ?? "");
    setPricingGroupId(area?.pricingGroupId ?? "");
    setDirectSellAmount(valueOf(area?.directSellAmount));
    setProductOptions(area?.materialProductId ? [{ id: area.materialProductId, label: area.materialDescription || "Current material product" }] : []);
    setError(null);
  }, [area, isOpen]);

  const areaTypeOptions = useMemo(() => areaTypes
    .filter((type) => type.isActive || type.id === area?.areaTypeId)
    .map((type) => ({ value: type.id, label: type.isActive ? type.name : `${type.name} (inactive)` })), [area?.areaTypeId, areaTypes]);
  const pricingOptions = useMemo(() => pricingGroups.map((group) => ({ value: group.id, label: group.label })), [pricingGroups]);
  const materialOptions = useMemo(() => productOptions.map((product) => ({ value: product.id, label: product.label })), [productOptions]);

  async function searchProducts(query: string) {
    setProductLoading(true);
    try {
      const results = await searchProposalMaterialProducts(query);
      setProductOptions((current) => {
        const selected = materialProductId ? current.find((item) => item.id === materialProductId) : undefined;
        return selected && !results.some((item) => item.id === selected.id) ? [selected, ...results] : results;
      });
    } catch (searchError) {
      setError(mapProjectProposalError(searchError));
    } finally {
      setProductLoading(false);
    }
  }

  async function save() {
    if (!draftId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await upsertProjectProposalArea(revisionId, {
        id: draftId,
        areaTypeId,
        areaName,
        readinessStatus: (readinessStatus || null) as ProjectProposalReadiness | null,
        statusNote,
        materialProductId,
        materialDescription,
        supplierSnapshot,
        finish,
        thickness,
        sqFt,
        linearFt,
        edgeProfile,
        edgeLinearFt,
        sinkQuantity,
        sinkSource,
        sinkCutoutQuantity,
        sinkTemplateStatus,
        backsplash,
        backsplashNotes,
        scopeNotes,
        measurementNotes,
        internalNotes,
        pricingGroupId,
        directSellAmount,
        sortOrder: area?.sortOrder ?? defaultSortOrder,
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(mapProjectProposalError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="m-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto p-6" ariaLabel={area ? "Edit Proposal Area" : "Add Proposal Area"}>
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold">{area ? "Edit Area" : "Add Area"}</h3>
          <p className="text-sm">Only Area Name is required. Leave unused measurements, scope details, and pricing blank.</p>
        </div>
        {error ? <Alert variant="error" title="Area not saved" message={error} /> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="proposal-area-type">Area Type</Label>
            <Select id="proposal-area-type" options={areaTypeOptions} value={areaTypeId} onChange={setAreaTypeId} placeholder="No Area Type" allowEmpty />
          </div>
          <div>
            <Label htmlFor="proposal-area-name">Area Name</Label>
            <Input id="proposal-area-name" value={areaName} onChange={(event) => setAreaName(event.target.value)} required />
          </div>
          <div>
            <Label htmlFor="proposal-area-readiness">Readiness</Label>
            <Select id="proposal-area-readiness" options={readinessOptions} value={readinessStatus} onChange={setReadinessStatus} placeholder="No readiness status" allowEmpty />
          </div>
          <div>
            <Label htmlFor="proposal-area-status-note">Status Note</Label>
            <TextArea id="proposal-area-status-note" rows={2} value={statusNote} onChange={setStatusNote} />
          </div>
        </div>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Material</summary>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Material Product</Label>
              <SearchableSelect
                options={materialOptions}
                value={materialProductId}
                onChange={setMaterialProductId}
                onSearchChange={(query) => void searchProducts(query)}
                loading={productLoading}
                placeholder="No linked Product"
                searchPlaceholder="Search Product name or SKU"
                allowEmpty
              />
            </div>
            <div>
              <Label htmlFor="proposal-area-material-description">Material Description / Fallback</Label>
              <Input id="proposal-area-material-description" value={materialDescription} onChange={(event) => setMaterialDescription(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="proposal-area-supplier">Supplier Snapshot</Label>
              <Input id="proposal-area-supplier" value={supplierSnapshot} onChange={(event) => setSupplierSnapshot(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="proposal-area-finish">Finish</Label>
              <Input id="proposal-area-finish" value={finish} onChange={(event) => setFinish(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="proposal-area-thickness">Thickness</Label>
              <Input id="proposal-area-thickness" value={thickness} onChange={(event) => setThickness(event.target.value)} />
            </div>
          </div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Measurements</summary>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="proposal-area-sqft">Square Feet</Label><Input id="proposal-area-sqft" type="number" min={0} step="0.0001" value={sqFt} onChange={(event) => setSqFt(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-linear-ft">Linear Feet</Label><Input id="proposal-area-linear-ft" type="number" min={0} step="0.0001" value={linearFt} onChange={(event) => setLinearFt(event.target.value)} /></div>
            <div className="md:col-span-2"><Label htmlFor="proposal-area-measurement-notes">Measurement Notes</Label><TextArea id="proposal-area-measurement-notes" value={measurementNotes} onChange={setMeasurementNotes} /></div>
          </div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Edge / Backsplash</summary>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="proposal-area-edge-profile">Edge Profile</Label><Input id="proposal-area-edge-profile" value={edgeProfile} onChange={(event) => setEdgeProfile(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-edge-linear-ft">Edge Linear Feet</Label><Input id="proposal-area-edge-linear-ft" type="number" min={0} step="0.0001" value={edgeLinearFt} onChange={(event) => setEdgeLinearFt(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-backsplash">Backsplash</Label><Input id="proposal-area-backsplash" value={backsplash} onChange={(event) => setBacksplash(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-backsplash-notes">Backsplash Notes</Label><TextArea id="proposal-area-backsplash-notes" value={backsplashNotes} onChange={setBacksplashNotes} /></div>
          </div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Sink / Cutout</summary>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="proposal-area-sink-quantity">Sink Quantity</Label><Input id="proposal-area-sink-quantity" type="number" min={0} step={1} value={sinkQuantity} onChange={(event) => setSinkQuantity(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-sink-source">Sink Source / Type</Label><Input id="proposal-area-sink-source" value={sinkSource} onChange={(event) => setSinkSource(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-cutout-quantity">Sink Cutout Quantity</Label><Input id="proposal-area-cutout-quantity" type="number" min={0} step={1} value={sinkCutoutQuantity} onChange={(event) => setSinkCutoutQuantity(event.target.value)} /></div>
            <div><Label htmlFor="proposal-area-template-status">Sink Template Status</Label><Input id="proposal-area-template-status" value={sinkTemplateStatus} onChange={(event) => setSinkTemplateStatus(event.target.value)} /></div>
          </div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Scope Notes</summary>
          <div><Label htmlFor="proposal-area-scope-notes">Customer-facing Scope Notes</Label><TextArea id="proposal-area-scope-notes" rows={4} value={scopeNotes} onChange={setScopeNotes} /></div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Internal Notes</summary>
          <div><Label htmlFor="proposal-area-internal-notes">Internal Notes</Label><TextArea id="proposal-area-internal-notes" rows={4} value={internalNotes} onChange={setInternalNotes} hint="Internal only. This field must never be included in customer-facing Proposal output." /></div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">Pricing</summary>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="proposal-area-direct-sell">Direct Sell Amount</Label>
              <Input
                id="proposal-area-direct-sell"
                type="number"
                min={0}
                step="0.01"
                value={directSellAmount}
                onChange={(event) => {
                  const value = event.target.value;
                  setDirectSellAmount(value);
                  if (value.trim()) setPricingGroupId("");
                }}
                disabled={Boolean(pricingGroupId)}
              />
            </div>
            <div>
              <Label htmlFor="proposal-area-pricing-group">Pricing Group</Label>
              <Select
                id="proposal-area-pricing-group"
                options={pricingOptions}
                value={pricingGroupId}
                onChange={(value) => {
                  setPricingGroupId(value);
                  if (value) setDirectSellAmount("");
                }}
                placeholder="No Pricing Group"
                allowEmpty
                disabled={directSellAmount.trim() !== ""}
              />
            </div>
          </div>
        </details>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !areaName.trim()}>{saving ? "Saving…" : "Save Area"}</Button>
        </div>
      </div>
    </Modal>
  );
}
