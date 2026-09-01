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

type Option = { value: string; label: string };
type BrandRow = { id: string; name: string };
type StoneTypeRow = { id: string; name: string };
type BandRow = { id: string; code: string; price_per_sqft: string | number };
type PriceGroupRow = { id: string; name: string; sort_order: number };
type ProductTypeRow = { id: string; code: string };
type ProductRow = {
  id: string;
  name: string;
  sku: string;
  status: "active" | "inactive" | "archived";
  brand_id: string;
  product_type_id: string;
};
type StoneProfileRow = {
  product_id: string;
  stone_type_id: string;
  material_price_band_id: string;
  vendor_name: string | null;
  source_ref: string | null;
  is_active: boolean;
};
type ProductPriceRow = { product_id: string; price_group_id: string; amount: string | number };
type StoneCatalogRow = ProductRow & StoneProfileRow;
type SinkCatalogRow = ProductRow & { prices: Record<string, string> };
type StoneDraft = {
  product_id?: string;
  name: string;
  sku: string;
  brand_id: string;
  stone_type_id: string;
  material_price_band_id: string;
  vendor_name: string;
  source_ref: string;
};
type SinkDraft = { product_id?: string; name: string; sku: string; brand_id: string; prices: Record<string, string> };
type CatalogEditor = "stone" | "sink" | null;

const EMPTY_STONE: StoneDraft = {
  name: "", sku: "", brand_id: "", stone_type_id: "", material_price_band_id: "", vendor_name: "", source_ref: "",
};
const EMPTY_SINK: SinkDraft = { name: "", sku: "", brand_id: "", prices: {} };

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
    : "—";
}

export default function CountertopCatalogManager() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [stoneTypes, setStoneTypes] = useState<StoneTypeRow[]>([]);
  const [bands, setBands] = useState<BandRow[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupRow[]>([]);
  const [stones, setStones] = useState<StoneCatalogRow[]>([]);
  const [sinks, setSinks] = useState<SinkCatalogRow[]>([]);
  const [stoneDraft, setStoneDraft] = useState<StoneDraft>(EMPTY_STONE);
  const [sinkDraft, setSinkDraft] = useState<SinkDraft>(EMPTY_SINK);
  const [editor, setEditor] = useState<CatalogEditor>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"stone" | "sink" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const brandOptions = useMemo<Option[]>(() => brands.map((row) => ({ value: row.id, label: row.name })), [brands]);
  const stoneTypeOptions = useMemo<Option[]>(() => stoneTypes.map((row) => ({ value: row.id, label: row.name })), [stoneTypes]);
  const bandOptions = useMemo<Option[]>(() => bands.map((row) => ({ value: row.id, label: `${row.code} — ${money(row.price_per_sqft)} / sq ft` })), [bands]);
  const brandById = useMemo(() => new Map(brands.map((row) => [row.id, row.name])), [brands]);
  const stoneTypeById = useMemo(() => new Map(stoneTypes.map((row) => [row.id, row.name])), [stoneTypes]);
  const bandById = useMemo(() => new Map(bands.map((row) => [row.id, `${row.code} — ${money(row.price_per_sqft)} / sq ft`])), [bands]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [brandResult, stoneTypeResult, bandResult, priceGroupResult, productTypeResult] = await Promise.all([
      supabase.from("product_brands").select("id,name").eq("status", "active").order("name"),
      supabase.from("countertop_stone_types").select("id,name").eq("is_active", true).order("name"),
      supabase.from("countertop_material_price_bands").select("id,code,price_per_sqft").eq("is_active", true).order("sort_order"),
      supabase.from("price_groups").select("id,name,sort_order,available_for_orders,internal_only,is_active").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
      supabase.from("product_types").select("id,code").in("code", ["STONE", "SINK"]).eq("is_active", true),
    ]);
    const referenceFailure = [brandResult, stoneTypeResult, bandResult, priceGroupResult, productTypeResult].find((result) => result.error);
    if (referenceFailure?.error) {
      setError(referenceFailure.error.message || "Unable to load Countertop Catalog references.");
      setLoading(false);
      return false;
    }
    const typeRows = (productTypeResult.data ?? []) as ProductTypeRow[];
    const stoneType = typeRows.find((row) => row.code === "STONE");
    const sinkType = typeRows.find((row) => row.code === "SINK");
    if (!stoneType || !sinkType) {
      setError("Canonical STONE and SINK Product Types are required before the catalog can be managed.");
      setLoading(false);
      return false;
    }
    const [productResult, profileResult] = await Promise.all([
      supabase.from("products").select("id,name,sku,status,brand_id,product_type_id").in("product_type_id", [stoneType.id, sinkType.id]).neq("status", "archived").order("name"),
      supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,material_price_band_id,vendor_name,source_ref,is_active"),
    ]);
    if (productResult.error || profileResult.error) {
      setError(productResult.error?.message || profileResult.error?.message || "Unable to load Countertop Catalog products.");
      setLoading(false);
      return false;
    }
    const products = (productResult.data ?? []) as ProductRow[];
    const profiles = (profileResult.data ?? []) as StoneProfileRow[];
    const profileByProduct = new Map(profiles.map((row) => [row.product_id, row]));
    const stoneProducts = products.filter((row) => row.product_type_id === stoneType.id);
    const sinkProducts = products.filter((row) => row.product_type_id === sinkType.id);
    const sinkIds = sinkProducts.map((row) => row.id);
    const priceResult = sinkIds.length
      ? await supabase.from("product_prices").select("product_id,price_group_id,amount").in("product_id", sinkIds).eq("currency_code", "USD").eq("is_active", true).is("valid_to", null)
      : { data: [] as ProductPriceRow[], error: null };
    if (priceResult.error) {
      setError(priceResult.error.message || "Unable to load sink prices.");
      setLoading(false);
      return false;
    }
    const sinkPriceMap = new Map<string, Record<string, string>>();
    for (const row of (priceResult.data ?? []) as ProductPriceRow[]) {
      const current = sinkPriceMap.get(row.product_id) ?? {};
      current[row.price_group_id] = String(row.amount);
      sinkPriceMap.set(row.product_id, current);
    }
    setBrands((brandResult.data ?? []) as BrandRow[]);
    setStoneTypes((stoneTypeResult.data ?? []) as StoneTypeRow[]);
    setBands((bandResult.data ?? []) as BandRow[]);
    setPriceGroups((priceGroupResult.data ?? []).map((row) => ({ id: row.id, name: row.name, sort_order: row.sort_order })) as PriceGroupRow[]);
    setStones(stoneProducts.flatMap((product) => {
      const profile = profileByProduct.get(product.id);
      return profile ? [{ ...product, ...profile }] : [];
    }));
    setSinks(sinkProducts.map((product) => ({ ...product, prices: sinkPriceMap.get(product.id) ?? {} })));
    setLoading(false);
    return true;
  }, []);

  useEffect(() => { void load(); }, [load]);

  function resetMessages() { setError(null); setMessage(null); }
  function openNewStone() { resetMessages(); setStoneDraft(EMPTY_STONE); setEditor("stone"); }
  function openNewSink() { resetMessages(); setSinkDraft(EMPTY_SINK); setEditor("sink"); }
  function closeEditor() {
    if (saving === "stone" || saving === "sink") return;
    setEditor(null); setStoneDraft(EMPTY_STONE); setSinkDraft(EMPTY_SINK);
  }
  function editStone(row: StoneCatalogRow) {
    resetMessages();
    setStoneDraft({ product_id: row.id, name: row.name, sku: row.sku, brand_id: row.brand_id, stone_type_id: row.stone_type_id, material_price_band_id: row.material_price_band_id, vendor_name: row.vendor_name ?? "", source_ref: row.source_ref ?? "" });
    setEditor("stone");
  }
  function editSink(row: SinkCatalogRow) {
    resetMessages();
    setSinkDraft({ product_id: row.id, name: row.name, sku: row.sku, brand_id: row.brand_id, prices: { ...row.prices } });
    setEditor("sink");
  }

  async function saveStone() {
    resetMessages();
    const normalized = { ...stoneDraft, name: stoneDraft.name.trim(), sku: stoneDraft.sku.trim().toUpperCase(), vendor_name: stoneDraft.vendor_name.trim(), source_ref: stoneDraft.source_ref.trim() };
    if (!normalized.name || !normalized.sku || !normalized.brand_id || !normalized.stone_type_id || !normalized.material_price_band_id) {
      setError("Stone Name, SKU, Brand, Stone Type and Material Price Band are required."); return;
    }
    setSaving("stone");
    const { error: saveError } = await supabase.rpc("save_countertop_catalog_product", {
      p_kind: "stone", p_product_id: normalized.product_id ?? null, p_name: normalized.name, p_sku: normalized.sku,
      p_brand_id: normalized.brand_id, p_stone_type_id: normalized.stone_type_id, p_material_price_band_id: normalized.material_price_band_id,
      p_vendor_name: normalized.vendor_name || null, p_source_ref: normalized.source_ref || null, p_prices: null,
    });
    setSaving(null);
    if (saveError) { setError(saveError.message); return; }
    const successMessage = normalized.product_id ? "Stone updated." : "Stone added to the Countertop Catalog.";
    setEditor(null); setStoneDraft(EMPTY_STONE);
    if (await load()) setMessage(successMessage);
  }

  async function saveSink() {
    resetMessages();
    const name = sinkDraft.name.trim(); const sku = sinkDraft.sku.trim().toUpperCase();
    if (!name || !sku || !sinkDraft.brand_id) { setError("Sink Name, SKU and Brand are required."); return; }
    const prices = priceGroups.map((group) => ({ price_group_id: group.id, amount: (sinkDraft.prices[group.id] ?? "").trim() }));
    if (!priceGroups.length || prices.some((price) => price.amount === "" || !Number.isFinite(Number(price.amount)) || Number(price.amount) < 0)) {
      setError("Enter a non-negative Sink price for every active order price group."); return;
    }
    setSaving("sink");
    const { error: saveError } = await supabase.rpc("save_countertop_catalog_product", {
      p_kind: "sink", p_product_id: sinkDraft.product_id ?? null, p_name: name, p_sku: sku, p_brand_id: sinkDraft.brand_id,
      p_stone_type_id: null, p_material_price_band_id: null, p_vendor_name: null, p_source_ref: null, p_prices: prices,
    });
    setSaving(null);
    if (saveError) { setError(saveError.message); return; }
    const successMessage = sinkDraft.product_id ? "Sink and prices updated." : "Sink added to the Countertop Catalog.";
    setEditor(null); setSinkDraft(EMPTY_SINK);
    if (await load()) setMessage(successMessage);
  }

  async function toggleStatus(product: ProductRow) {
    resetMessages(); setSaving("status");
    const nextStatus = product.status === "active" ? "inactive" : "active";
    const { error: statusError } = await supabase.rpc("set_product_status", { p_product_id: product.id, p_status: nextStatus });
    setSaving(null);
    if (statusError) { setError(statusError.message); return; }
    if (await load()) setMessage(`${product.name} is now ${nextStatus}.`);
  }

  return (
    <div className="space-y-6">
      {error ? <div className="space-y-3"><Alert variant="error" title="Countertop Catalog" message={error} /><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : null}
      {message ? <Alert variant="success" title="Countertop Catalog" message={message} /> : null}

      <ComponentCard title="Stones" desc="Stone products use the selected Material Price Band for catalog $/sq ft pricing." headerAction={<Button onClick={openNewStone}>Add Stone</Button>}>
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin"><TableRow>
              {["Stone","SKU","Brand","Stone Type","Material Price Band","Vendor","Status","Actions"].map((heading) => <TableCell key={heading} isHeader variant="admin">{heading}</TableCell>)}
            </TableRow></TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={8}>Loading Stone products…</TableStateRow> : stones.length === 0 ? <TableStateRow colSpan={8}>No Stone products.</TableStateRow> : stones.map((row) => (
                <TableRow key={row.id}>
                  <TableCell variant="admin" className="font-medium">{row.name}</TableCell><TableCell variant="admin">{row.sku}</TableCell>
                  <TableCell variant="admin">{brandById.get(row.brand_id) ?? "—"}</TableCell><TableCell variant="admin">{stoneTypeById.get(row.stone_type_id) ?? "—"}</TableCell>
                  <TableCell variant="admin">{bandById.get(row.material_price_band_id) ?? "—"}</TableCell><TableCell variant="admin">{row.vendor_name || "—"}</TableCell>
                  <TableCell variant="admin"><Badge color={row.status === "active" ? "success" : "light"}>{row.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell variant="admin"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => editStone(row)}>Edit</Button><Button variant="outline" size="sm" disabled={saving === "status"} onClick={() => void toggleStatus(row)}>{row.status === "active" ? "Deactivate" : "Activate"}</Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <ComponentCard title="Sinks" desc="Sink prices are maintained for every active order-eligible commercial Price Group." headerAction={<Button onClick={openNewSink}>Add Sink</Button>}>
        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin"><TableRow>
              <TableCell isHeader variant="admin">Sink</TableCell><TableCell isHeader variant="admin">SKU</TableCell><TableCell isHeader variant="admin">Brand</TableCell><TableCell isHeader variant="admin">Status</TableCell>
              {priceGroups.map((group) => <TableCell key={group.id} isHeader variant="admin">{group.name}</TableCell>)}
              <TableCell isHeader variant="admin">Actions</TableCell>
            </TableRow></TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={5 + priceGroups.length}>Loading Sink products…</TableStateRow> : sinks.length === 0 ? <TableStateRow colSpan={5 + priceGroups.length}>No Sink products.</TableStateRow> : sinks.map((row) => (
                <TableRow key={row.id}>
                  <TableCell variant="admin" className="font-medium">{row.name}</TableCell><TableCell variant="admin">{row.sku}</TableCell><TableCell variant="admin">{brandById.get(row.brand_id) ?? "—"}</TableCell>
                  <TableCell variant="admin"><Badge color={row.status === "active" ? "success" : "light"}>{row.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                  {priceGroups.map((group) => <TableCell key={group.id} variant="admin">{row.prices[group.id] === undefined ? "—" : money(row.prices[group.id])}</TableCell>)}
                  <TableCell variant="admin"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => editSink(row)}>Edit</Button><Button variant="outline" size="sm" disabled={saving === "status"} onClick={() => void toggleStatus(row)}>{row.status === "active" ? "Deactivate" : "Activate"}</Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <Modal isOpen={editor === "stone"} onClose={closeEditor} className="m-4 max-h-[90vh] max-w-3xl overflow-y-auto p-6" ariaLabel="Stone editor">
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{stoneDraft.product_id ? "Edit Stone" : "Add Stone"}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="stone-name">Stone Name *</Label><Input id="stone-name" value={stoneDraft.name} onChange={(event) => setStoneDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
            <div><Label htmlFor="stone-sku">SKU *</Label><Input id="stone-sku" value={stoneDraft.sku} onChange={(event) => setStoneDraft((draft) => ({ ...draft, sku: event.target.value }))} /></div>
            <div><Label htmlFor="stone-brand">Brand *</Label><Select id="stone-brand" value={stoneDraft.brand_id} options={brandOptions} placeholder="Select brand" onChange={(value) => setStoneDraft((draft) => ({ ...draft, brand_id: value }))} /></div>
            <div><Label htmlFor="stone-type">Stone Type *</Label><Select id="stone-type" value={stoneDraft.stone_type_id} options={stoneTypeOptions} placeholder="Select Stone Type" onChange={(value) => setStoneDraft((draft) => ({ ...draft, stone_type_id: value }))} /></div>
            <div><Label htmlFor="stone-band">Material Price Band *</Label><Select id="stone-band" value={stoneDraft.material_price_band_id} options={bandOptions} placeholder="Select Material Price Band" onChange={(value) => setStoneDraft((draft) => ({ ...draft, material_price_band_id: value }))} /></div>
            <div><Label htmlFor="stone-vendor">Vendor</Label><Input id="stone-vendor" value={stoneDraft.vendor_name} onChange={(event) => setStoneDraft((draft) => ({ ...draft, vendor_name: event.target.value }))} /></div>
            <div className="md:col-span-2"><Label htmlFor="stone-source">Source</Label><Input id="stone-source" value={stoneDraft.source_ref} onChange={(event) => setStoneDraft((draft) => ({ ...draft, source_ref: event.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving === "stone"} onClick={closeEditor}>Cancel</Button><Button disabled={saving === "stone"} onClick={() => void saveStone()}>{saving === "stone" ? "Saving…" : "Save Stone"}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={editor === "sink"} onClose={closeEditor} className="m-4 max-h-[90vh] max-w-3xl overflow-y-auto p-6" ariaLabel="Sink editor">
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{sinkDraft.product_id ? "Edit Sink" : "Add Sink"}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="sink-name">Sink Name *</Label><Input id="sink-name" value={sinkDraft.name} onChange={(event) => setSinkDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
            <div><Label htmlFor="sink-sku">SKU *</Label><Input id="sink-sku" value={sinkDraft.sku} onChange={(event) => setSinkDraft((draft) => ({ ...draft, sku: event.target.value }))} /></div>
            <div className="md:col-span-2"><Label htmlFor="sink-brand">Brand *</Label><Select id="sink-brand" value={sinkDraft.brand_id} options={brandOptions} placeholder="Select brand" onChange={(value) => setSinkDraft((draft) => ({ ...draft, brand_id: value }))} /></div>
          </div>
          <div className="space-y-4"><h4 className="text-base font-semibold">Sink prices</h4><div className="grid gap-4 md:grid-cols-2">
            {priceGroups.map((group) => <div key={group.id}><Label htmlFor={`sink-price-${group.id}`}>{group.name} *</Label><Input id={`sink-price-${group.id}`} type="number" min={0} step="0.01" value={sinkDraft.prices[group.id] ?? ""} onChange={(event) => setSinkDraft((draft) => ({ ...draft, prices: { ...draft.prices, [group.id]: event.target.value } }))} /></div>)}
          </div></div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving === "sink"} onClick={closeEditor}>Cancel</Button><Button disabled={saving === "sink"} onClick={() => void saveSink()}>{saving === "sink" ? "Saving…" : "Save Sink"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
