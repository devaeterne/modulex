"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
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
import { getCurrentProfile } from "@/lib/supabase/profile";
import { formatDbDecimal, parseDbDecimal } from "@/lib/validation";

type MaterialBand = {
  id: string;
  code: string;
  price_per_sqft: string | number;
  is_active: boolean;
  sort_order: number;
};

const PRICE_DECIMAL = { precision: 18, scale: 4, min: 0, allowNull: false } as const;

function bandErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("permission")) return "You do not have permission to manage material pricing.";
  if (normalized.includes("duplicate") || normalized.includes("already exists")) {
    return "A material band with this code already exists.";
  }
  if (normalized.includes("price")) return "Enter a valid non-negative price per square foot.";
  return "Material band pricing could not be saved. Please retry.";
}

export default function MaterialBandPricingTable() {
  const [rows, setRows] = useState<MaterialBand[]>([]);
  const [editing, setEditing] = useState<MaterialBand | null>(null);
  const [price, setPrice] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("countertop_material_price_bands")
      .select("id,code,price_per_sqft,is_active,sort_order")
      .order("sort_order");

    if (loadError) {
      setRows([]);
      setError("Material bands could not be loaded. Please retry.");
      setLoading(false);
      return;
    }

    setRows((data ?? []) as MaterialBand[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    let mounted = true;
    getCurrentProfile().then(({ profile }) => {
      if (!mounted) return;
      setCanManage(hasPermission(profile?.roles, "pricing.manage"));
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  function openEditor(row: MaterialBand) {
    setError(null);
    setSuccess(null);
    setEditing(row);
    setPrice(formatDbDecimal(row.price_per_sqft, PRICE_DECIMAL));
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setPrice("");
    setError(null);
  }

  async function save() {
    if (!editing) return;
    const parsed = parseDbDecimal(price, PRICE_DECIMAL);
    if (parsed.error || parsed.value === null) {
      setError(`Price per sq ft: ${parsed.error ?? "A value is required."}`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: saveError } = await supabase.rpc("upsert_countertop_reference", {
      p_kind: "material_band",
      p_id: editing.id,
      p_name: null,
      p_code: editing.code,
      p_price: parsed.value,
      p_pricing_method: null,
      p_product_id: null,
      p_stone_type_id: null,
      p_material_price_band_id: null,
      p_vendor_name: null,
      p_source_ref: null,
      p_is_active: editing.is_active,
    });

    if (saveError) {
      setError(bandErrorMessage(saveError.message));
      setSaving(false);
      return;
    }

    const code = editing.code;
    setEditing(null);
    setPrice("");
    await load();
    setSuccess(`${code} price updated.`);
    setSaving(false);
  }

  async function toggle(row: MaterialBand) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: toggleError } = await supabase.rpc("upsert_countertop_reference", {
      p_kind: "material_band",
      p_id: row.id,
      p_name: null,
      p_code: row.code,
      p_price: row.price_per_sqft,
      p_pricing_method: null,
      p_product_id: null,
      p_stone_type_id: null,
      p_material_price_band_id: null,
      p_vendor_name: null,
      p_source_ref: null,
      p_is_active: !row.is_active,
    });

    if (toggleError) {
      setError(bandErrorMessage(toggleError.message));
      setSaving(false);
      return;
    }

    await load();
    setSuccess(`${row.code} ${row.is_active ? "deactivated" : "activated"}.`);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Material Bands"
        desc="Manage the canonical countertop material rate per square foot. Product Types and UOMs do not store these prices."
      >
        <div className="flex flex-wrap gap-2">
          <Badge color="info">Countertop Material Band</Badge>
          <Badge color="light">USD / SQ_FT</Badge>
          <Badge color="warning">Band codes remain canonical</Badge>
        </div>
      </ComponentCard>

      {error && !editing ? <Alert variant="error" title="Material pricing unavailable" message={error} /> : null}
      {success ? <Alert variant="success" title="Material pricing updated" message={success} /> : null}

      <ComponentCard
        title="Material Price Band Directory"
        desc="Stone products reference one of these bands through their stone profile. Changing a rate affects every product using that band."
      >
        {loading ? (
          <Alert variant="info" title="Loading material bands" message="Loading canonical pricing references." />
        ) : (
          <TableViewport>
            <Table variant="admin" className="min-w-[720px]">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin" className="text-left">Band</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Price / sq ft</TableCell>
                  <TableCell isHeader variant="admin" className="text-left">Status</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell variant="admin">
                        <Badge color="primary">{row.code}</Badge>
                      </TableCell>
                      <TableCell variant="admin" className="text-right">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        }).format(Number(row.price_per_sqft))}
                      </TableCell>
                      <TableCell variant="admin">
                        <Badge color={row.is_active ? "success" : "light"}>
                          {row.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell variant="admin" className="text-right">
                        {canManage ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => openEditor(row)}>
                              Edit Price
                            </Button>
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => void toggle(row)}>
                              {row.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        ) : (
                          <Badge color="light">View only</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell variant="admin" colSpan={4} className="text-center">
                      No material price bands found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableViewport>
        )}
      </ComponentCard>

      <Modal isOpen={Boolean(editing)} onClose={closeEditor} className="m-4 max-w-[640px]">
        <div className="p-4 sm:p-6">
          <ComponentCard
            title={editing ? `Edit ${editing.code}` : "Edit Material Band"}
            desc="This rate is global for every Stone product mapped to this material band."
          >
            <div className="space-y-4">
              {error ? <Alert variant="error" title="Unable to save" message={error} /> : null}
              <div>
                <Label htmlFor="material-band-code">Band Code</Label>
                <Input id="material-band-code" value={editing?.code ?? ""} disabled readOnly />
              </div>
              <div>
                <Label htmlFor="material-band-price">Price / sq ft (USD)</Label>
                <Input
                  id="material-band-price"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  disabled={saving}
                  hint="Stored with numeric(18,4) precision."
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={saving} onClick={closeEditor}>Cancel</Button>
                <Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Price"}</Button>
              </div>
            </div>
          </ComponentCard>
        </div>
      </Modal>
    </div>
  );
}
