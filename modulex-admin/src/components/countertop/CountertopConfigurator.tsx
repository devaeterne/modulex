"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { supabase } from "@/lib/supabase/client";

type Option = { value: string; label: string };
type Row = { id: string; name: string; sku?: string; stone_type_id?: string; material_price_band_code?: string; price_per_sqft?: string };
type CountertopConfiguratorProps = { orderId?: string; orderItemId?: string; orderContext?: { orderNumber: string; lineNo?: number; sku?: string; productName?: string }; onAttached?: (orderItemId: string) => void; onClose?: () => void };

const fieldClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

export default function CountertopConfigurator({ orderId, orderItemId, orderContext, onAttached, onClose }: CountertopConfiguratorProps = {}) {
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

  const hasOrderPricingContext = Boolean(orderId || orderItemId);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [t, e, s, p, pg] = await Promise.all([
        supabase.from("countertop_stone_types").select("id,name").eq("is_active", true).order("name"),
        supabase.from("countertop_edge_profiles").select("id,name").eq("is_active", true).order("name"),
        supabase.from("products").select("id,name,sku").eq("status", "active").contains("metadata", { product_kind: "sink" }).order("name"),
        supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,products(id,name,sku,status),countertop_material_price_bands(code,price_per_sqft)").eq("is_active", true),
        supabase.from("price_groups").select("id,name,available_for_orders,internal_only").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
      ]);
      const svc = await supabase.from("countertop_services").select("id,name,pricing_method,unit_price").eq("is_active", true).order("name");

      const orderItemContext = !orderId && orderItemId
        ? await supabase.from("customer_order_items").select("order_id").eq("id", orderItemId).maybeSingle()
        : { data: null, error: null };
      const contextOrderId = orderId ?? orderItemContext.data?.order_id ?? null;
      const orderPricing = contextOrderId
        ? await supabase.from("customer_orders").select("price_group_id").eq("id", contextOrderId).maybeSingle()
        : { data: null, error: null };

      if (!mounted) return;
      if ([t, e, s, p, pg, svc].some((x) => x.error) || orderItemContext.error || orderPricing.error) {
        setError("Countertop reference data could not be loaded.");
      }
      setTypes((t.data ?? []).map((x) => ({ value: x.id, label: x.name })));
      setEdges((e.data ?? []).map((x) => ({ value: x.id, label: x.name })));
      setSinks((s.data ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` })));
      setPriceGroups((pg.data ?? []).map((x) => ({ value: x.id, label: x.name })));
      setPriceGroupId(contextOrderId ? (orderPricing.data?.price_group_id ?? "") : (pg.data?.[0]?.id ?? ""));
      setStones((p.data ?? []).filter((x: any) => x.products?.status === "active").map((x: any) => ({ id: x.product_id, name: x.products?.name ?? "", sku: x.products?.sku, stone_type_id: x.stone_type_id, material_price_band_code: x.countertop_material_price_bands?.code, price_per_sqft: x.countertop_material_price_bands?.price_per_sqft })));
      setServices((svc.data ?? []).map((x) => ({ ...x, quantity: "1" })));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [orderId, orderItemId]);

  const filteredStones = useMemo(() => stones.filter((x) => !stoneTypeId || x.stone_type_id === stoneTypeId), [stones, stoneTypeId]);
  const selectedStone = stones.find((x) => x.id === stoneProductId);
  const canCalculate = Boolean(stoneProductId && priceGroupId && Number(sqft) > 0);
  const toggleService = (id: string) => setServices((rows) => rows.map((x) => x.id === id ? { ...x, selected: !(x as any).selected } as any : x));
  const selectedServices = () => services.filter((x: any) => x.selected).map((x) => ({ service_id: x.id, quantity: x.quantity }));

  async function calculate() {
    setError(null);
    setResult(null);
    if (!priceGroupId) return setError("This order needs a saved price group before countertop pricing can be calculated.");
    if (!stoneProductId || Number(sqft) <= 0) return setError("Select a stone and enter square footage before calculating.");
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
    if (pricingError) return setError("Unable to calculate countertop pricing.");
    setResult(data as Record<string, unknown>);
  }

  async function attach() {
    if (!result) return setError("Calculate countertop pricing before attaching.");
    if (!orderItemId && !orderId) return setError("Open a draft customer order to configure and attach a countertop.");
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
      : await supabase.rpc("create_and_attach_countertop_order_item", { ...common, p_order_id: orderId, p_request_id: initiationRequestId });
    setSaving(false);
    if (response.error) return setError(orderItemId ? "Unable to attach countertop configuration." : "Unable to add countertop to this draft order.");
    const attachedItemId = String(response.data ?? orderItemId ?? "");
    setResult({ ...result, attached: true, order_item_id: attachedItemId });
    if (!orderItemId) setInitiationRequestId(crypto.randomUUID());
    if (attachedItemId) onAttached?.(attachedItemId);
  }

  if (loading) return <section className="p-5 text-sm text-gray-500 dark:text-gray-400">Loading countertop references…</section>;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Countertop configurator</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select managed references; server pricing is authoritative.</p>
          {orderContext && <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">Order {orderContext.orderNumber}{orderContext.lineNo ? ` · Line ${orderContext.lineNo}` : " · New countertop"}{(orderContext.sku || orderContext.productName) && <><br /><span className="font-normal">{orderContext.sku} · {orderContext.productName}</span></>}</p>}
        </div>
        {onClose && <Button variant="outline" onClick={onClose}>Close</Button>}
      </div>

      {!orderItemId && !orderId && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Open a draft customer order to configure and attach a countertop.</p>}
      {error && <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</p>}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className={fieldClass}>Stone type<Select className="mt-1.5" options={types} value={stoneTypeId} onChange={(v) => { setStoneTypeId(v); setStoneProductId(""); }} /></label>
        <label className={fieldClass}>Stone <span className="text-error-500">*</span><Select className="mt-1.5" options={filteredStones.map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` }))} value={stoneProductId} onChange={setStoneProductId} required /></label>
        <label className={fieldClass}>Material price band<div className="mt-1.5 text-sm font-normal text-gray-600 dark:text-gray-300">{selectedStone ? `${selectedStone.material_price_band_code} — $${selectedStone.price_per_sqft} / sq ft` : "Select a stone to view its material price band."}</div></label>
        <label className={fieldClass}>Square feet <span className="text-error-500">*</span><Input className="mt-1.5" type="number" step="0.0001" min="0.0001" value={sqft} onChange={(e) => setSqft(e.target.value)} /></label>
        <label className={fieldClass}>Slabs to reserve<Input className="mt-1.5" type="number" step="1" min="1" value={slabQuantity} onChange={(e) => setSlabQuantity(e.target.value)} /></label>
        <label className={fieldClass}>Edge<Select className="mt-1.5" options={edges} value={edgeId} onChange={setEdgeId} allowEmpty /></label>
        <label className={fieldClass}>Edge linear feet<Input className="mt-1.5" type="number" step="0.0001" min="0" value={edgeLinearFt} onChange={(e) => setEdgeLinearFt(e.target.value)} /></label>
        <label className={fieldClass}>Sink (optional)<Select className="mt-1.5" options={sinks} value={sinkId} onChange={setSinkId} allowEmpty /></label>
        <label className={fieldClass}>Commercial price group<Select className="mt-1.5" options={priceGroups} value={priceGroupId} onChange={setPriceGroupId} disabled={hasOrderPricingContext} /><span className="mt-1.5 block text-xs font-normal text-gray-500 dark:text-gray-400">{hasOrderPricingContext ? "Inherited from the saved order." : "Select the pricing context for this countertop."}</span></label>
        <label className={fieldClass}>Manual $/sqft (optional)<Input className="mt-1.5" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} /></label>
        <label className={fieldClass}>Override reason<Input className="mt-1.5" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /></label>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Additional services</p>
        {services.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No active services.</p>}
        {services.map((x: any) => <label key={x.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={Boolean(x.selected)} onChange={() => toggleService(x.id)} /><span>{x.name} ({x.pricing_method})</span><Input className="max-w-24" value={x.quantity} onChange={(e) => setServices((rows) => rows.map((r) => r.id === x.id ? { ...r, quantity: e.target.value } : r))} /></label>)}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={calculate} disabled={!canCalculate}>Calculate price</Button>
        {(orderItemId || orderId) && <Button variant="outline" onClick={attach} disabled={saving || !result}>{saving ? "Attaching…" : orderItemId ? "Attach draft snapshot" : "Add to draft order"}</Button>}
      </div>

      {result && <pre className="mt-5 overflow-auto rounded-lg bg-gray-50 p-4 text-sm dark:bg-white/[0.03] dark:text-gray-200">{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}