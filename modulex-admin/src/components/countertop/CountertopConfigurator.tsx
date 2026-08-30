"use client";

import { useState } from "react";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import { supabase } from "@/lib/supabase/client";

export default function CountertopConfigurator() {
  const [stoneProductId, setStoneProductId] = useState("");
  const [priceGroupId, setPriceGroupId] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [sqft, setSqft] = useState("");
  const [edgeProfileId, setEdgeProfileId] = useState("");
  const [edgeLinearFt, setEdgeLinearFt] = useState("0");
  const [sinkProductId, setSinkProductId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function calculate() {
    setError(null); setResult(null);
    if (!stoneProductId || !priceGroupId || !sqft) { setError("Stone, price group and square footage are required."); return; }
    const { data, error: rpcError } = await supabase.rpc("calculate_countertop_price", {
      p_stone_product_id: stoneProductId, p_price_group_id: priceGroupId, p_sqft: sqft,
      p_edge_profile_id: edgeProfileId || null, p_edge_linear_ft: edgeLinearFt || "0",
      p_sink_product_id: sinkProductId || null, p_services: [], p_manual_material_price: null,
    });
    if (rpcError) { setError("Unable to calculate countertop pricing."); return; }
    setResult(data as Record<string, unknown>);
  }

  async function attach() {
    if (!orderItemId || !result) { setError("Calculate a price and provide a draft order item first."); return; }
    setSaving(true); setError(null);
    const { error: rpcError } = await supabase.rpc("attach_countertop_configuration", {
      p_order_item_id: orderItemId, p_stone_product_id: stoneProductId, p_price_group_id: priceGroupId,
      p_sqft: sqft, p_edge_profile_id: edgeProfileId || null, p_edge_linear_ft: edgeLinearFt || "0",
      p_sink_product_id: sinkProductId || null, p_services: [], p_configuration: {}, p_manual_material_price: null,
    });
    setSaving(false);
    if (rpcError) { setError("Unable to attach countertop configuration to the draft order."); return; }
    setResult({ ...result, attached: true });
  }

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
    <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Countertop configuration</h2>
    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Server-side pricing preview and draft-order snapshot attachment.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium">Stone product ID<Input value={stoneProductId} onChange={(e) => setStoneProductId(e.target.value)} /></label>
      <label className="text-sm font-medium">Price group ID<Input value={priceGroupId} onChange={(e) => setPriceGroupId(e.target.value)} /></label>
      <label className="text-sm font-medium">Square feet<Input type="number" step="0.0001" value={sqft} onChange={(e) => setSqft(e.target.value)} /></label>
      <label className="text-sm font-medium">Edge profile ID (optional)<Input value={edgeProfileId} onChange={(e) => setEdgeProfileId(e.target.value)} /></label>
      <label className="text-sm font-medium">Edge linear feet<Input type="number" step="0.0001" value={edgeLinearFt} onChange={(e) => setEdgeLinearFt(e.target.value)} /></label>
      <label className="text-sm font-medium">Sink product ID (optional)<Input value={sinkProductId} onChange={(e) => setSinkProductId(e.target.value)} /></label>
      <label className="text-sm font-medium">Draft order item ID (optional)<Input value={orderItemId} onChange={(e) => setOrderItemId(e.target.value)} /></label>
    </div>
    <div className="mt-5 flex gap-3"><Button onClick={calculate}>Calculate price</Button><Button variant="outline" onClick={attach} disabled={saving || !result || !orderItemId}>{saving ? "Attaching..." : "Attach snapshot"}</Button></div>
    {error && <p className="mt-4 text-sm text-error-600">{error}</p>}
    {result && <pre className="mt-5 overflow-auto rounded-lg bg-gray-50 p-4 text-sm dark:bg-white/[0.03]">{JSON.stringify(result, null, 2)}</pre>}
  </section>;
}
