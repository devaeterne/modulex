"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { supabase } from "@/lib/supabase/client";

type Option = { value: string; label: string };
type Row = {
  id: string;
  name: string;
  sku?: string;
  stone_type_id?: string;
  material_price_band_code?: string;
  price_per_sqft?: string;
};

type CountertopConfiguratorProps = {
  orderId?: string;
  orderItemId?: string;
  orderContext?: { orderNumber: string; lineNo?: number; sku?: string; productName?: string };
  onAttached?: (orderItemId: string) => void;
  onClose?: () => void;
};

export default function CountertopConfigurator({
  orderId,
  orderItemId,
  orderContext,
  onAttached,
  onClose,
}: CountertopConfiguratorProps = {}) {
  const [types, setTypes] = useState<Option[]>([]);
  const [edges, setEdges] = useState<Option[]>([]);
  const [sinks, setSinks] = useState<Option[]>([]);
  const [priceGroups, setPriceGroups] = useState<Option[]>([]);
  const [stones, setStones] = useState<Row[]>([]);
  const [services, setServices] = useState<Array<Row & { pricing_method: string; unit_price: string; quantity: string }>>([]);
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [stoneProductId, setStoneProductId] = useState("");
  const [priceGroupId, setPriceGroupId] = useState("");
  const [edgeId, setEdgeId] = useState("");
  const [sinkId, setSinkId] = useState("");
  const [sqft, setSqft] = useState("");
  const [edgeLinearFt, setEdgeLinearFt] = useState("0");
  const [slabQuantity, setSlabQuantity] = useState("1");
  const [manualPrice, setManualPrice] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [initiationRequestId, setInitiationRequestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [t, e, s, p, pg] = await Promise.all([
        supabase.from("countertop_stone_types").select("id,name").eq("is_active", true).order("name"),
        supabase.from("countertop_edge_profiles").select("id,name").eq("is_active", true).order("name"),
        supabase.from("products").select("id,name,sku").eq("status", "active").contains("metadata", { product_kind: "sink" }).order("name"),
        supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,products(id,name,sku),countertop_material_price_bands(code,price_per_sqft)").eq("is_active", true),
        supabase.from("price_groups").select("id,name").eq("is_active", true).order("name"),
      ]);
      const svc = await supabase.from("countertop_services").select("id,name,pricing_method,unit_price").eq("is_active", true).order("name");
      if (!mounted) return;
      if ([t, e, s, p, pg, svc].some((x) => x.error)) setError("Countertop reference data could not be loaded.");
      setTypes((t.data ?? []).map((x) => ({ value: x.id, label: x.name })));
      setEdges((e.data ?? []).map((x) => ({ value: x.id, label: x.name })));
      setSinks((s.data ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` })));
      setPriceGroups((pg.data ?? []).map((x) => ({ value: x.id, label: x.name })));
      setPriceGroupId(pg.data?.[0]?.id ?? "");
      setStones((p.data ?? []).map((x: any) => ({
        id: x.product_id,
        name: x.products?.name ?? "",
        sku: x.products?.sku,
        stone_type_id: x.stone_type_id,
        material_price_band_code: x.countertop_material_price_bands?.code,
        price_per_sqft: x.countertop_material_price_bands?.price_per_sqft,
      })));
      setServices((svc.data ?? []).map((x) => ({ ...x, quantity: "1" })));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const filteredStones = useMemo(
    () => stones.filter((x) => !stoneTypeId || x.stone_type_id === stoneTypeId),
    [stones, stoneTypeId],
  );
  const selectedStone = stones.find((x) => x.id === stoneProductId);
  const toggleService = (id: string) => setServices((rows) => rows.map((x) => (
    x.id === id ? { ...x, selected: !(x as any).selected } as any : x
  )));

  function selectedServices() {
    return services.filter((x: any) => x.selected).map((x) => ({ service_id: x.id, quantity: x.quantity }));
  }

  async function calculate() {
    setError(null);
    setResult(null);
    if (!stoneProductId || !priceGroupId || !sqft) {
      setError("Stone, price group and square footage are required.");
      return;
    }
    const { data, error: pricingError } = await supabase.rpc("calculate_countertop_price", {
      p_stone_product_id: stoneProductId,
      p_price_group_id: priceGroupId,
      p_sqft: sqft,
      p_edge_profile_id: edgeId || null,
      p_edge_linear_ft: edgeLinearFt || "0",
      p_sink_product_id: sinkId || null,
      p_services: selectedServices(),
      p_manual_material_price: manualPrice || null,
    });
    if (pricingError) {
      setError("Unable to calculate countertop pricing.");
      return;
    }
    setResult(data as Record<string, unknown>);
  }

  async function attach() {
    if (!result) {
      setError("Calculate countertop pricing before attaching.");
      return;
    }
    if (!orderItemId && !orderId) {
      setError("Open a draft customer order to configure and attach a countertop.");
      return;
    }

    setSaving(true);
    setError(null);
    const common = {
      p_stone_product_id: stoneProductId,
      p_price_group_id: priceGroupId,
      p_sqft: sqft,
      p_edge_profile_id: edgeId || null,
      p_edge_linear_ft: edgeLinearFt || "0",
      p_sink_product_id: sinkId || null,
      p_services: selectedServices(),
      p_configuration: { edge_profile_id: edgeId || null, service_selection: selectedServices() },
      p_manual_material_price: manualPrice || null,
      p_slab_quantity: slabQuantity,
      p_override_reason: overrideReason || null,
    };

    const response = orderItemId
      ? await supabase.rpc("attach_countertop_configuration", { ...common, p_order_item_id: orderItemId })
      : await supabase.rpc("create_and_attach_countertop_order_item", {
          ...common,
          p_order_id: orderId,
          p_request_id: initiationRequestId,
        });

    setSaving(false);
    if (response.error) {
      setError(orderItemId ? "Unable to attach countertop configuration." : "Unable to add countertop to this draft order.");
      return;
    }

    const attachedItemId = String(response.data ?? orderItemId ?? "");
    setResult({ ...result, attached: true, order_item_id: attachedItemId });
    if (!orderItemId) setInitiationRequestId(crypto.randomUUID());
    if (attachedItemId) onAttached?.(attachedItemId);
  }

  if (loading) return <section className="p-5">Loading countertop references…</section>;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Countertop configurator</h2>
          <p className="mt-1 text-sm text-gray-500">Select managed references; server pricing is authoritative.</p>
          {orderContext && (
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Order {orderContext.orderNumber}{orderContext.lineNo ? ` · Line ${orderContext.lineNo}` : " · New countertop"}
              {(orderContext.sku || orderContext.productName) && <><br /><span className="font-normal">{orderContext.sku} · {orderContext.productName}</span></>}
            </p>
          )}
        </div>
        {onClose && <Button variant="outline" onClick={onClose}>Close</Button>}
      </div>

      {!orderItemId && !orderId && <p className="mt-4 text-sm text-gray-500">Open a draft customer order to configure and attach a countertop.</p>}
      {error && <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10">{error}</p>}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label>Stone type<Select options={types} defaultValue={stoneTypeId} onChange={(v) => { setStoneTypeId(v); setStoneProductId(""); }} /></label>
        <label>Stone<Select options={filteredStones.map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` }))} onChange={setStoneProductId} /></label>
        <label>Material price band<div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{selectedStone ? `${selectedStone.material_price_band_code} — $${selectedStone.price_per_sqft} / sq ft` : "Select a stone to view its material price band."}</div></label>
        <label>Square feet<Input type="number" step="0.0001" value={sqft} onChange={(e) => setSqft(e.target.value)} /></label>
        <label>Slabs to reserve<Input type="number" step="1" min="1" value={slabQuantity} onChange={(e) => setSlabQuantity(e.target.value)} /></label>
        <label>Edge<Select options={edges} defaultValue={edgeId} onChange={setEdgeId} /></label>
        <label>Edge linear feet<Input type="number" step="0.0001" value={edgeLinearFt} onChange={(e) => setEdgeLinearFt(e.target.value)} /></label>
        <label>Sink (optional)<Select options={sinks} defaultValue={sinkId} onChange={setSinkId} /></label>
        <label>Commercial price group<Select options={priceGroups} defaultValue={priceGroupId} onChange={setPriceGroupId} /></label>
        <label>Manual $/sqft (optional)<Input value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} /></label>
        <label>Override reason<Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /></label>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Additional services</p>
        {services.length === 0 && <p className="text-sm text-gray-500">No active services.</p>}
        {services.map((x: any) => (
          <label key={x.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={Boolean(x.selected)} onChange={() => toggleService(x.id)} />
            <span>{x.name} ({x.pricing_method})</span>
            <Input className="max-w-24" value={x.quantity} onChange={(e) => setServices((rows) => rows.map((r) => r.id === x.id ? { ...r, quantity: e.target.value } : r))} />
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={calculate}>Calculate price</Button>
        {(orderItemId || orderId) && (
          <Button variant="outline" onClick={attach} disabled={saving || !result}>
            {saving ? "Attaching…" : orderItemId ? "Attach draft snapshot" : "Add to draft order"}
          </Button>
        )}
      </div>

      {result && <pre className="mt-5 overflow-auto rounded-lg bg-gray-50 p-4 text-sm dark:bg-white/[0.03]">{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}
