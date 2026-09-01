"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
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
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type ReferenceKind = "stone_type" | "material_band" | "edge" | "service";
type PricingMethod = "each" | "sq_ft" | "linear_ft" | "flat";
type ReferenceRow = {
  id: string;
  name?: string | null;
  code?: string | null;
  price_per_sqft?: string | number | null;
  pricing_method?: PricingMethod | null;
  unit_price?: string | number | null;
  is_active: boolean;
};
type ReferenceDraft = {
  id?: string;
  name: string;
  code: string;
  price: string;
  pricing_method: string;
};
type ReferenceConfig = {
  key: ReferenceKind;
  title: string;
  description: string;
  table: "countertop_stone_types" | "countertop_material_price_bands" | "countertop_edge_profiles" | "countertop_services";
  columns: string;
  orderBy: string;
};

const EMPTY_DRAFT: ReferenceDraft = { name: "", code: "", price: "", pricing_method: "" };
const METHOD_OPTIONS = [
  { value: "each", label: "Each" },
  { value: "sq_ft", label: "Sq ft" },
  { value: "linear_ft", label: "Linear ft" },
  { value: "flat", label: "Flat" },
];
const METHOD_LABELS: Record<string, string> = Object.fromEntries(METHOD_OPTIONS.map((option) => [option.value, option.label]));
const CONFIGS: ReferenceConfig[] = [
  { key: "stone_type", title: "Stone Types", description: "Manage the Stone Type choices used by Countertop products and Order configuration.", table: "countertop_stone_types", columns: "id,name,is_active", orderBy: "name" },
  { key: "material_band", title: "Material Price Bands", description: "Manage B/R material bands and their authoritative $/sq ft values.", table: "countertop_material_price_bands", columns: "id,code,price_per_sqft,is_active", orderBy: "sort_order" },
  { key: "edge", title: "Edge Profiles", description: "Manage edge options and their pricing method/unit price.", table: "countertop_edge_profiles", columns: "id,name,pricing_method,unit_price,is_active", orderBy: "name" },
  { key: "service", title: "Services", description: "Manage removal, plumbing and cutout services available in Countertop configuration.", table: "countertop_services", columns: "id,name,pricing_method,unit_price,is_active", orderBy: "name" },
];

function money(value: string | number | null | undefined) {
  const amount = Number(value);
  return value !== null && value !== undefined && Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
    : "—";
}

export default function CountertopReferenceManager() {
  const [rows, setRows] = useState<Record<ReferenceKind, ReferenceRow[]>>({ stone_type: [], material_band: [], edge: [], service: [] });
  const [editor, setEditor] = useState<ReferenceKind | null>(null);
  const [draft, setDraft] = useState<ReferenceDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ReferenceKind | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeConfig = useMemo(() => CONFIGS.find((config) => config.key === editor) ?? null, [editor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const entries = await Promise.all(CONFIGS.map(async (config) => {
      const result = await supabase.from(config.table).select(config.columns).order(config.orderBy);
      return [config.key, result] as const;
    }));
    const failed = entries.find(([, result]) => result.error);
    if (failed?.[1].error) {
      setError(failed[1].error.message || "Unable to load Countertop Setup references.");
      setLoading(false);
      return false;
    }
    const next = { stone_type: [], material_band: [], edge: [], service: [] } as Record<ReferenceKind, ReferenceRow[]>;
    for (const [key, result] of entries) next[key] = (result.data ?? []) as unknown as ReferenceRow[];
    setRows(next);
    setLoading(false);
    return true;
  }, []);

  useEffect(() => { void load(); }, [load]);

  function resetMessages() { setError(null); setMessage(null); }
  function openNew(kind: ReferenceKind) { resetMessages(); setDraft(EMPTY_DRAFT); setEditor(kind); }
  function openEdit(kind: ReferenceKind, row: ReferenceRow) {
    resetMessages();
    setDraft({ id: row.id, name: row.name ?? "", code: row.code ?? "", price: String(row.price_per_sqft ?? row.unit_price ?? ""), pricing_method: row.pricing_method ?? "" });
    setEditor(kind);
  }
  function closeEditor() {
    if (saving && saving !== "status") return;
    setEditor(null); setDraft(EMPTY_DRAFT);
  }

  function validateDraft(kind: ReferenceKind) {
    if (kind === "stone_type" && !draft.name.trim()) return "Stone Type name is required.";
    if (kind === "material_band" && (!draft.code.trim() || draft.price.trim() === "")) return "Material Band code and price are required.";
    if ((kind === "edge" || kind === "service") && (!draft.name.trim() || !draft.pricing_method || draft.price.trim() === "")) return "Name, pricing method and unit price are required.";
    if (kind !== "stone_type" && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) return "Price must be a non-negative number.";
    return null;
  }

  async function saveReference() {
    if (!editor) return;
    resetMessages();
    const validationError = validateDraft(editor);
    if (validationError) { setError(validationError); return; }
    setSaving(editor);
    const { error: saveError } = await supabase.rpc("upsert_countertop_reference", {
      p_kind: editor,
      p_id: draft.id ?? null,
      p_name: draft.name.trim() || null,
      p_code: draft.code.trim().toUpperCase() || null,
      p_price: editor === "stone_type" ? null : draft.price.trim(),
      p_pricing_method: editor === "edge" || editor === "service" ? draft.pricing_method : null,
      p_is_active: true,
    });
    setSaving(null);
    if (saveError) { setError(saveError.message.includes("already exists") ? "Duplicate reference." : saveError.message); return; }
    const successMessage = `${activeConfig?.title ?? "Countertop reference"} saved.`;
    setEditor(null); setDraft(EMPTY_DRAFT);
    if (await load()) setMessage(successMessage);
  }

  async function toggleReference(config: ReferenceConfig, row: ReferenceRow) {
    resetMessages(); setSaving("status");
    const { error: toggleError } = await supabase.rpc("upsert_countertop_reference", {
      p_kind: config.key,
      p_id: row.id,
      p_name: row.name ?? null,
      p_code: row.code ?? null,
      p_price: row.price_per_sqft ?? row.unit_price ?? null,
      p_pricing_method: row.pricing_method ?? null,
      p_is_active: !row.is_active,
    });
    setSaving(null);
    if (toggleError) { setError(toggleError.message); return; }
    if (await load()) setMessage(`${row.name ?? row.code ?? config.title} is now ${row.is_active ? "inactive" : "active"}.`);
  }

  function referenceName(row: ReferenceRow) { return row.name ?? row.code ?? "—"; }
  function referencePrice(config: ReferenceConfig, row: ReferenceRow) {
    if (config.key === "stone_type") return "—";
    const formatted = money(row.price_per_sqft ?? row.unit_price);
    return config.key === "material_band" ? `${formatted} / sq ft` : formatted;
  }
  function referenceMethod(config: ReferenceConfig, row: ReferenceRow) {
    if (config.key === "material_band") return "Sq ft";
    if (config.key === "stone_type") return "—";
    return row.pricing_method ? (METHOD_LABELS[row.pricing_method] ?? row.pricing_method) : "—";
  }

  return (
    <div className="space-y-6">
      {error ? <div className="space-y-3"><Alert variant="error" title="Countertop Setup" message={error} /><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : null}
      {message ? <Alert variant="success" title="Countertop Setup" message={message} /> : null}

      {CONFIGS.map((config) => (
        <ComponentCard key={config.key} title={config.title} desc={config.description} headerAction={<Button onClick={() => openNew(config.key)}>Add</Button>}>
          <TableViewport>
            <Table variant="admin" minWidth="standard">
              <TableHeader variant="admin"><TableRow>
                <TableCell isHeader variant="admin">Reference</TableCell><TableCell isHeader variant="admin">Price</TableCell><TableCell isHeader variant="admin">Pricing Method</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Actions</TableCell>
              </TableRow></TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={5}>Loading {config.title}…</TableStateRow> : rows[config.key].length === 0 ? <TableStateRow colSpan={5}>No references.</TableStateRow> : rows[config.key].map((row) => (
                  <TableRow key={row.id}>
                    <TableCell variant="admin" className="font-medium">{referenceName(row)}</TableCell><TableCell variant="admin">{referencePrice(config, row)}</TableCell><TableCell variant="admin">{referenceMethod(config, row)}</TableCell>
                    <TableCell variant="admin"><Badge color={row.is_active ? "success" : "light"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell variant="admin"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(config.key, row)}>Edit</Button><Button variant="outline" size="sm" disabled={saving === "status"} onClick={() => void toggleReference(config, row)}>{row.is_active ? "Deactivate" : "Activate"}</Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>
      ))}

      <Modal isOpen={editor !== null} onClose={closeEditor} className="m-4 max-h-[90vh] max-w-2xl overflow-y-auto p-6" ariaLabel="Countertop reference editor">
        {activeConfig ? <div className="space-y-6">
          <h3 className="text-lg font-semibold">{draft.id ? `Edit ${activeConfig.title}` : `Add ${activeConfig.title}`}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {editor !== "material_band" ? <div className="md:col-span-2"><Label htmlFor="reference-name">Name *</Label><Input id="reference-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div> : null}
            {editor === "material_band" ? <div><Label htmlFor="reference-code">Code *</Label><Input id="reference-code" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} /></div> : null}
            {editor !== "stone_type" ? <div><Label htmlFor="reference-price">{editor === "material_band" ? "Price / sq ft *" : "Unit Price *"}</Label><Input id="reference-price" type="number" min={0} step="0.01" value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))} /></div> : null}
            {editor === "edge" || editor === "service" ? <div><Label htmlFor="reference-method">Pricing Method *</Label><Select id="reference-method" value={draft.pricing_method} options={METHOD_OPTIONS} placeholder="Select pricing method" onChange={(value) => setDraft((current) => ({ ...current, pricing_method: value }))} /></div> : null}
          </div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving === editor} onClick={closeEditor}>Cancel</Button><Button disabled={saving === editor} onClick={() => void saveReference()}>{saving === editor ? "Saving…" : "Save"}</Button></div>
        </div> : null}
      </Modal>
    </div>
  );
}
