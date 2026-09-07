"use client";

import { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
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
  deleteProjectProposalPricingGroup,
  mapProjectProposalError,
  upsertProjectProposalPricingGroup,
  type ProjectProposalArea,
  type ProjectProposalPricingGroup,
} from "@/lib/customers/project-proposal-domain";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function ProjectProposalPricingGroups({
  revisionId,
  currencyCode,
  groups,
  areas,
  canManage,
  onChanged,
}: {
  revisionId: string;
  currencyCode: string;
  groups: ProjectProposalPricingGroup[];
  areas: ProjectProposalArea[];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setEditingId(crypto.randomUUID());
    setLabel("");
    setDescription("");
    setSellAmount("");
    setError(null);
  }

  function startEdit(group: ProjectProposalPricingGroup) {
    setEditingId(group.id);
    setLabel(group.label);
    setDescription(group.description ?? "");
    setSellAmount(String(group.sellAmount));
    setError(null);
  }

  async function save() {
    if (!editingId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const existing = groups.find((group) => group.id === editingId);
      await upsertProjectProposalPricingGroup({
        revisionId,
        id: editingId,
        label,
        description,
        sellAmount,
        sortOrder: existing?.sortOrder ?? groups.length * 10,
      });
      setEditingId(null);
      await onChanged();
    } catch (saveError) {
      setError(mapProjectProposalError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(group: ProjectProposalPricingGroup) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await deleteProjectProposalPricingGroup(group.id);
      await onChanged();
    } catch (deleteError) {
      setError(mapProjectProposalError(deleteError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ComponentCard
      title="Pricing Groups"
      desc="One group sell amount may cover multiple Areas. Modulex never divides a grouped price into artificial per-Area amounts."
      headerAction={canManage ? <Button size="sm" variant="outline" onClick={startNew}>Add Pricing Group</Button> : undefined}
    >
      {error ? <Alert variant="error" title="Pricing Group action failed" message={error} /> : null}
      {editingId && canManage ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="proposal-group-label">Group Label</Label>
            <Input id="proposal-group-label" value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="proposal-group-sell-amount">Sell Amount ({currencyCode})</Label>
            <Input id="proposal-group-sell-amount" type="number" min={0} step="0.01" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="proposal-group-description">Description</Label>
            <TextArea id="proposal-group-description" value={description} onChange={setDescription} />
          </div>
          <div className="flex gap-2 md:col-span-2 md:justify-end">
            <Button variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save Group"}</Button>
          </div>
        </div>
      ) : null}

      <TableViewport>
        <Table variant="admin" minWidth="standard">
          <TableHeader variant="admin">
            <TableRow>
              <TableCell isHeader variant="admin">Group</TableCell>
              <TableCell isHeader variant="admin">Sell Amount</TableCell>
              <TableCell isHeader variant="admin">Area Members</TableCell>
              <TableCell isHeader variant="admin">Actions</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody variant="admin">
            {groups.length === 0 ? <TableStateRow colSpan={4}>No Pricing Groups. Areas may still use direct pricing.</TableStateRow> : null}
            {groups.map((group) => {
              const members = areas.filter((area) => area.pricingGroupId === group.id);
              return (
                <TableRow key={group.id}>
                  <TableCell variant="admin"><span className="font-medium">{group.label}</span>{group.description ? <p className="text-sm">{group.description}</p> : null}</TableCell>
                  <TableCell variant="admin">{money(group.sellAmount, currencyCode)}</TableCell>
                  <TableCell variant="admin">{members.length > 0 ? members.map((area) => area.areaName).join(", ") : "No Areas assigned"}</TableCell>
                  <TableCell variant="admin">
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(group)} disabled={saving}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => void remove(group)} disabled={saving || members.length > 0}>Delete</Button>
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
  );
}
