"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
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
type ProductPriceRow = {
  product_id: string;
  price_group_id: string;
  amount: string | number;
};

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

type SinkDraft = {
  product_id?: string;
  name: string;
  sku: string;
  brand_id: string;
  prices: Record<string, string>;
};

const EMPTY_STONE: StoneDraft = {
  name: "",
  sku: "",
  brand_id: "",
  stone_type_id: "",
  material_price_band_id: "",
  vendor_name: "",
  source_ref: "",
};

const EMPTY_SINK: SinkDraft = {
  name: "",
  sku: "",
  brand_id: "",
  prices: {},
};

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
    : "—";
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label>
      <span className={labelClass}>{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"stone" | "sink" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const brandOptions = useMemo<Option[]>(() => brands.map((row) => ({ value: row.id, label: row.name })), [brands]);
  const stoneTypeOptions = useMemo<Option[]>(() => stoneTypes.map((row) => ({ value: row.id, label: row.name })), [stoneTypes]);
  const bandOptions = useMemo<Option[]>(() => bands.map((row) => ({ value: row.id, label: `${row.code} — ${money(row.price_per_sqft)} / sq ft` })), [bands]);

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
      return;
    }

    const typeRows = (productTypeResult.data ?? []) as ProductTypeRow[];
    const stoneType = typeRows.find((row) => row.code === "STONE");
    const sinkType = typeRows.find((row) => row.code === "SINK");
    if (!stoneType || !sinkType) {
      setError("Canonical STONE and SINK Product Types are required before the catalog can be managed.");
      setLoading(false);
      return;
    }

    const [productResult, profileResult] = await Promise.all([
      supabase.from("products").select("id,name,sku,status,brand_id,product_type_id").in("product_type_id", [stoneType.id, sinkType.id]).neq("status", "archived").order("name"),
      supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,material_price_band_id,vendor_name,source_ref,is_active"),
    ]);

    if (productResult.error || profileResult.error) {
      setError(productResult.error?.message || profileResult.error?.message || "Unable to load Countertop Catalog products.");
      setLoading(false);
      return;
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
      return;
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
  }, []);

  useEffect(() => { void load(); }, [load]);

  function resetMessages() {
    setError(null);
    setMessage(null);
  }

  async function saveStone() {
    resetMessages();
    const normalized = {
      ...stoneDraft,
      name: stoneDraft.name.trim(),
      sku: stoneDraft.sku.trim().toUpperCase(),
      vendor_name: stoneDraft.vendor_name.trim(),
      source_ref: stoneDraft.source_ref.trim(),
    };

    if (!normalized.name || !normalized.sku || !normalized.brand_id || !normalized.stone_type_id || !normalized.material_price_band_id) {
      setError("Stone Name, SKU, Brand, Stone Type and Material Price Band are required.");
      return;
    }

    setSaving("stone");
    const { error: saveError } = await supabase.rpc("save_countertop_catalog_product", {
      p_kind: "stone",
      p_product_id: normalized.product_id ?? null,
      p_name: normalized.name,
      p_sku: normalized.sku,
      p_brand_id: normalized.brand_id,
      p_stone_type_id: normalized.stone_type_id,
      p_material_price_band_id: normalized.material_price_band_id,
      p_vendor_name: normalized.vendor_name || null,
      p_source_ref: normalized.source_ref || null,
      p_prices: null,
    });
    setSaving(null);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setMessage(normalized.product_id ? "Stone updated." : "Stone added to the Countertop Catalog.");
    setStoneDraft(EMPTY_STONE);
    await load();
  }

  async function saveSink() {
    resetMessages();
    const name = sinkDraft.name.trim();
    const sku = sinkDraft.sku.trim().toUpperCase();
    if (!name || !sku || !sinkDraft.brand_id) {
      setError("Sink Name, SKU and Brand are required.");
      return;
    }

    const prices = priceGroups.map((group) => ({
      price_group_id: group.id,
      amount: (sinkDraft.prices[group.id] ?? "").trim(),
    }));
    if (!priceGroups.length || prices.some((price) => price.amount === "" || !Number.isFinite(Number(price.amount)) || Number(price.amount) < 0)) {
      setError("Enter a non-negative Sink price for every active order price group.");
      return;
    }

    setSaving("sink");
    const { error: saveError } = await supabase.rpc("save_countertop_catalog_product", {
      p_kind: "sink",
      p_product_id: sinkDraft.product_id ?? null,
      p_name: name,
      p_sku: sku,
      p_brand_id: sinkDraft.brand_id,
      p_stone_type_id: null,
      p_material_price_band_id: null,
      p_vendor_name: null,
      p_source_ref: null,
      p_prices: prices,
    });
    setSaving(null);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setMessage(sinkDraft.product_id ? "Sink and prices updated." : "Sink added to the Countertop Catalog.");
    setSinkDraft(EMPTY_SINK);
    await load();
  }

  async function toggleStatus(product: ProductRow) {
    resetMessages();
    setSaving("status");
    const nextStatus = product.status === "active" ? "inactive" : "active";
    const { error: statusError } = await supabase.rpc("set_product_status", {
      p_product_id: product.id,
      p_status: nextStatus,
    });
    setSaving(null);
    if (statusError) {
      setError(statusError.message);
      return;
    }
    setMessage(`${product.name} is now ${nextStatus}.`);
    await load();
  }

  function editStone(row: StoneCatalogRow) {
    resetMessages();
    setStoneDraft({
      product_id: row.id,
      name: row.name,
      sku: row.sku,
      brand_id: row.brand_id,
      stone_type_id: row.stone_type_id,
      material_price_band_id: row.material_price_band_id,
      vendor_name: row.vendor_name ?? "",
      source_ref: row.source_ref ?? "",
    });
  }

  function editSink(row: SinkCatalogRow) {
    resetMessages();
    setSinkDraft({
      product_id: row.id,
      name: row.name,
      sku: row.sku,
      brand_id: row.brand_id,
      prices: { ...row.prices },
    });
  }

  if (loading) {
    return <ComponentCard title="Countertop Catalog" desc="Loading Stone and Sink products…"><p className="text-sm text-gray-500 dark:text-gray-400">Loading catalog…</p></ComponentCard>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-error-600 dark:text-error-300">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      ) : null}
      {message ? <p role="status" className="text-sm text-success-600 dark:text-success-300">{message}</p> : null}

      <ComponentCard
        title="Stones"
        desc="Create real Stone products here. Catalog pricing comes from the selected Material Price Band; manual $/sq ft override remains available inside an Order Countertop configuration."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Stone Name" required>
            <Input value={stoneDraft.name} placeholder="e.g. Calacatta Gold" onChange={(event) => setStoneDraft((draft) => ({ ...draft, name: event.target.value }))} />
          </Field>
          <Field label="SKU" required>
            <Input value={stoneDraft.sku} placeholder="e.g. STONE-CAL-GOLD" onChange={(event) => setStoneDraft((draft) => ({ ...draft, sku: event.target.value }))} />
          </Field>
          <Field label="Brand" required>
            <Select value={stoneDraft.brand_id} options={brandOptions} placeholder="Select brand" onChange={(value) => setStoneDraft((draft) => ({ ...draft, brand_id: value }))} />
          </Field>
          <Field label="Stone Type" required>
            <Select value={stoneDraft.stone_type_id} options={stoneTypeOptions} placeholder="Select Stone Type" onChange={(value) => setStoneDraft((draft) => ({ ...draft, stone_type_id: value }))} />
          </Field>
          <Field label="Material Price Band" required>
            <Select value={stoneDraft.material_price_band_id} options={bandOptions} placeholder="Select Material Price Band" onChange={(value) => setStoneDraft((draft) => ({ ...draft, material_price_band_id: value }))} />
          </Field>
          <Field label="Vendor">
            <Input value={stoneDraft.vendor_name} placeholder="Optional" onChange={(event) => setStoneDraft((draft) => ({ ...draft, vendor_name: event.target.value }))} />
          </Field>
          <Field label="Source reference">
            <Input value={stoneDraft.source_ref} placeholder="Optional supplier reference" onChange={(event) => setStoneDraft((draft) => ({ ...draft, source_ref: event.target.value }))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button disabled={saving !== null} onClick={() => void saveStone()}>{saving === "stone" ? "Saving…" : stoneDraft.product_id ? "Save Stone" : "Add Stone"}</Button>
          {stoneDraft.product_id ? <Button variant="outline" disabled={saving !== null} onClick={() => setStoneDraft(EMPTY_STONE)}>Cancel edit</Button> : null}
        </div>

        {stones.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No Stone products yet. Add the first Stone above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-gray-100 dark:border-gray-800"><th className="py-3 pr-4">Stone</th><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Material band</th><th className="py-3 pr-4">Vendor</th><th className="py-3 pr-4">Status</th><th className="py-3">Actions</th></tr></thead>
              <tbody>{stones.map((row) => {
                const stoneType = stoneTypes.find((item) => item.id === row.stone_type_id);
                const band = bands.find((item) => item.id === row.material_price_band_id);
                return (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 pr-4"><div className="font-medium text-gray-800 dark:text-white/90">{row.name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{row.sku}</div></td>
                    <td className="py-3 pr-4">{stoneType?.name ?? "—"}</td>
                    <td className="py-3 pr-4">{band ? `${band.code} — ${money(band.price_per_sqft)} / sq ft` : "—"}</td>
                    <td className="py-3 pr-4">{row.vendor_name || "—"}</td>
                    <td className="py-3 pr-4">{row.status === "active" ? "Active" : "Inactive"}</td>
                    <td className="py-3"><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving !== null} onClick={() => editStone(row)}>Edit</Button><Button variant="outline" size="sm" disabled={saving !== null} onClick={() => void toggleStatus(row)}>{row.status === "active" ? "Deactivate" : "Activate"}</Button></div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </ComponentCard>

      <ComponentCard
        title="Sinks"
        desc="Create Sink products and maintain the USD selling price for each order-eligible commercial price group. Order Countertop pricing automatically uses the saved Order price group."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Sink Name" required>
            <Input value={sinkDraft.name} placeholder="e.g. Roma 30 Undermount" onChange={(event) => setSinkDraft((draft) => ({ ...draft, name: event.target.value }))} />
          </Field>
          <Field label="SKU" required>
            <Input value={sinkDraft.sku} placeholder="e.g. SINK-ROMA-30" onChange={(event) => setSinkDraft((draft) => ({ ...draft, sku: event.target.value }))} />
          </Field>
          <Field label="Brand" required>
            <Select value={sinkDraft.brand_id} options={brandOptions} placeholder="Select brand" onChange={(value) => setSinkDraft((draft) => ({ ...draft, brand_id: value }))} />
          </Field>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">Sink prices</h4>
          {priceGroups.length === 0 ? (
            <p className="text-sm text-error-600 dark:text-error-300">No active order price groups are available. Sink catalog saves are blocked.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {priceGroups.map((group) => (
                <Field key={group.id} label={`${group.name} (USD)`} required>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={sinkDraft.prices[group.id] ?? ""}
                    placeholder="0.00"
                    onChange={(event) => setSinkDraft((draft) => ({ ...draft, prices: { ...draft.prices, [group.id]: event.target.value } }))}
                  />
                </Field>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button disabled={saving !== null || priceGroups.length === 0} onClick={() => void saveSink()}>{saving === "sink" ? "Saving…" : sinkDraft.product_id ? "Save Sink" : "Add Sink"}</Button>
          {sinkDraft.product_id ? <Button variant="outline" disabled={saving !== null} onClick={() => setSinkDraft(EMPTY_SINK)}>Cancel edit</Button> : null}
        </div>

        {sinks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No Sink products yet. Add the first Sink above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead><tr className="border-b border-gray-100 dark:border-gray-800"><th className="py-3 pr-4">Sink</th><th className="py-3 pr-4">Brand</th><th className="py-3 pr-4">Prices</th><th className="py-3 pr-4">Status</th><th className="py-3">Actions</th></tr></thead>
              <tbody>{sinks.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-3 pr-4"><div className="font-medium text-gray-800 dark:text-white/90">{row.name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{row.sku}</div></td>
                  <td className="py-3 pr-4">{brands.find((brand) => brand.id === row.brand_id)?.name ?? "—"}</td>
                  <td className="py-3 pr-4"><div className="flex flex-wrap gap-x-3 gap-y-1">{priceGroups.map((group) => <span key={group.id}>{group.name}: {row.prices[group.id] !== undefined ? money(row.prices[group.id]) : "Missing"}</span>)}</div></td>
                  <td className="py-3 pr-4">{row.status === "active" ? "Active" : "Inactive"}</td>
                  <td className="py-3"><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving !== null} onClick={() => editSink(row)}>Edit</Button><Button variant="outline" size="sm" disabled={saving !== null} onClick={() => void toggleStatus(row)}>{row.status === "active" ? "Deactivate" : "Activate"}</Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
