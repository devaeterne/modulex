"use client";

import { useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import {
  deleteProjectProposalArea,
  mapProjectProposalError,
  upsertProjectProposalArea,
  type ProposalAreaType,
  type ProjectProposalArea,
  type ProjectProposalPricingGroup,
} from "@/lib/customers/project-proposal-domain";
import ProjectProposalAreaModal from "./ProjectProposalAreaModal";

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

function readinessTone(value: ProjectProposalArea["readinessStatus"]): BadgeColor {
  if (value === "ready_to_cut") return "success";
  if (value === "ready_to_measure") return "info";
  if (value === "needs_remeasure") return "warning";
  return "light";
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function fullAreaInput(area: ProjectProposalArea, sortOrder = area.sortOrder) {
  return {
    id: area.id,
    areaTypeId: area.areaTypeId,
    areaName: area.areaName,
    readinessStatus: area.readinessStatus,
    statusNote: area.statusNote,
    materialProductId: area.materialProductId,
    materialDescription: area.materialDescription,
    supplierSnapshot: area.supplierSnapshot,
    finish: area.finish,
    thickness: area.thickness,
    sqFt: area.sqFt,
    linearFt: area.linearFt,
    edgeProfile: area.edgeProfile,
    edgeLinearFt: area.edgeLinearFt,
    sinkQuantity: area.sinkQuantity,
    sinkSource: area.sinkSource,
    sinkCutoutQuantity: area.sinkCutoutQuantity,
    sinkTemplateStatus: area.sinkTemplateStatus,
    backsplash: area.backsplash,
    backsplashNotes: area.backsplashNotes,
    scopeNotes: area.scopeNotes,
    measurementNotes: area.measurementNotes,
    internalNotes: area.internalNotes,
    pricingGroupId: area.pricingGroupId,
    directSellAmount: area.directSellAmount,
    sortOrder,
  };
}

export default function ProjectProposalAreaList({
  revisionId,
  currencyCode,
  areas,
  areaTypes,
  pricingGroups,
  canManage,
  onChanged,
}: {
  revisionId: string;
  currencyCode: string;
  areas: ProjectProposalArea[];
  areaTypes: ProposalAreaType[];
  pricingGroups: ProjectProposalPricingGroup[];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editingArea, setEditingArea] = useState<ProjectProposalArea | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orderedAreas = useMemo(() => [...areas].sort((a, b) => a.sortOrder - b.sortOrder || a.areaName.localeCompare(b.areaName)), [areas]);

  function addArea() {
    setEditingArea(null);
    setModalOpen(true);
    setError(null);
  }

  function editArea(area: ProjectProposalArea) {
    setEditingArea(area);
    setModalOpen(true);
    setError(null);
  }

  async function removeArea(area: ProjectProposalArea) {
    if (busyId) return;
    setBusyId(area.id);
    setError(null);
    try {
      await deleteProjectProposalArea(area.id);
      await onChanged();
    } catch (deleteError) {
      setError(mapProjectProposalError(deleteError));
    } finally {
      setBusyId(null);
    }
  }

  async function reorderArea(area: ProjectProposalArea, direction: "up" | "down") {
    if (busyId) return;
    const index = orderedAreas.findIndex((candidate) => candidate.id === area.id);
    const neighbor = orderedAreas[index + (direction === "up" ? -1 : 1)];
    if (!neighbor) return;
    const nextSort = direction === "up" ? neighbor.sortOrder - 1 : neighbor.sortOrder + 1;
    setBusyId(area.id);
    setError(null);
    try {
      await upsertProjectProposalArea(revisionId, fullAreaInput(area, nextSort));
      await onChanged();
    } catch (reorderError) {
      setError(mapProjectProposalError(reorderError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ComponentCard
        title="Areas"
        desc="Areas are flexible commercial scope rows. Area Name is the only required field."
        headerAction={canManage ? <Button size="sm" onClick={addArea}>+ Add Area</Button> : undefined}
      >
        {error ? <Alert variant="error" title="Area action failed" message={error} /> : null}
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Area</TableCell>
                <TableCell isHeader variant="admin">Type</TableCell>
                <TableCell isHeader variant="admin">Readiness</TableCell>
                <TableCell isHeader variant="admin">Pricing</TableCell>
                <TableCell isHeader variant="admin">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {orderedAreas.length === 0 ? <TableStateRow colSpan={5}>No Areas yet. A minimal Area needs only Area Name.</TableStateRow> : null}
              {orderedAreas.map((area, index) => {
                const group = area.pricingGroupId ? pricingGroups.find((candidate) => candidate.id === area.pricingGroupId) : null;
                const pricing = group ? `Group: ${group.label}` : area.directSellAmount !== null ? money(area.directSellAmount, currencyCode) : "Unpriced";
                return (
                  <TableRow key={area.id}>
                    <TableCell variant="admin"><span className="font-medium">{area.areaName}</span>{area.statusNote ? <p className="text-sm">{area.statusNote}</p> : null}</TableCell>
                    <TableCell variant="admin">{area.areaTypeName || "—"}</TableCell>
                    <TableCell variant="admin">{area.readinessStatus ? <Badge color={readinessTone(area.readinessStatus)}>{area.readinessStatus.replaceAll("_", " ")}</Badge> : "—"}</TableCell>
                    <TableCell variant="admin">{pricing}</TableCell>
                    <TableCell variant="admin">
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => editArea(area)} disabled={Boolean(busyId)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => void reorderArea(area, "up")} disabled={Boolean(busyId) || index === 0}>Move up</Button>
                          <Button size="sm" variant="ghost" onClick={() => void reorderArea(area, "down")} disabled={Boolean(busyId) || index === orderedAreas.length - 1}>Move down</Button>
                          <Button size="sm" variant="danger" onClick={() => void removeArea(area)} disabled={Boolean(busyId)}>Delete</Button>
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <ProjectProposalAreaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        revisionId={revisionId}
        area={editingArea}
        areaTypes={areaTypes}
        pricingGroups={pricingGroups}
        defaultSortOrder={orderedAreas.length === 0 ? 0 : Math.max(...orderedAreas.map((area) => area.sortOrder)) + 10}
        onSaved={onChanged}
      />
    </>
  );
}
