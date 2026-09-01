"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";

type Option = { value: string; label: string };
type StoneRow = {
  id: string;
  name: string;
  sku?: string;
  stone_type_id?: string;
  material_price_band_code?: string;
  price_per_sqft?: string;
};
type ServiceRow = {
  id: string;
  name: string;
  pricing_method: string;
  unit_price: string;
  quantity: string;
  selected: boolean;
};
type CountertopPriceResult = {
  stone?: {
    sku?: string;
    name?: string;
    sqft?: string | number;
    stone_type?: string;
    price_per_sqft?: string | number;
    material_price_band?: string;
  };
  subtotal?: string | number;
  material_subtotal?: string | number;
  edge_subtotal?: string | number;
  sink_subtotal?: string | number;
  services_subtotal?: string | number;
  attached?: boolean;
  order_item_id?: string;
};
type CountertopConfiguratorProps = {
  orderId?: string;
  orderItemId?: string;
  orderContext?: { orderNumber: string; lineNo?: number; sku?: string; productName?: string };
  onAttached?: (orderItemId: string) => void;
  onClose?: () => void;
};

function money(value: string | number | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0);
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{required ? " *" : ""}</Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm">{label}</span>
      <span className={strong ? "text-lg font-semibold" : "text-sm font-medium"}>{value}</span>
    </div>
  );
}

export default function CountertopConfigurator({ orderId, orderItemId, orderContext, onAttached, onClose }: CountertopConfiguratorProps = {}) {
  const [types, setTypes] = useState<Option[]>([]);
  const [edges, setEdges] = useState<Option[]>([]);
  const [sinks, setSinks] = useState<Option[]>([]);
  const [priceGroups, setPriceGroups] = useState<Option[]>([]);
  const [stones, setStones] = useState<StoneRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
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
  const [result, setResult] = useState<CountertopPriceResult | null>(null);

  const hasOrderPricingContext = Boolean(orderId || orderItemId);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [typeResult, edgeResult, sinkResult, profileResult, priceGroupResult, serviceResult] = await Promise.all([
        supabase.from("countertop_stone_types").select("id,name").eq("is_active", true).order("name"),
        supabase.from("countertop_edge_profiles").select("id,name").eq("is_active", true).order("name"),
        supabase.from("products").select("id,name,sku").eq("status", "active").contains("metadata", { product_kind: "sink" }).order("name"),
        supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,products(id,name,sku,status),countertop_material_price_bands(code,price_per_sqft)").eq("is_active", true),
        supabase.from("price_groups").select("id,name,available_for_orders,internal_only").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
        supabase.from("countertop_services").select("id,name,pricing_method,unit_price").eq("is_active", true).order("name"),
      ]);

      const orderItemContext = !orderId && orderItemId
        ? await supabase.from("customer_order_items").select("order_id").eq("id", orderItemId).maybeSingle()
        : { data: null, error: null };
      const contextOrderId = orderId ?? orderItemContext.data?.order_id ?? null;
      const orderPricing = contextOrderId
        ? await supabase.from("customer_orders").select("price_group_id").eq("id", contextOrderId).maybeSingle()
        : { data: null, error: null };

      if (!mounted) return;
      if ([typeResult, edgeResult, sinkResult, profileResult, priceGroupResult, serviceResult].some((entry) => entry.error) || orderItemContext.error || orderPricing.error) {
        setError("Countertop reference data could not be loaded.");
      }

      setTypes((typeResult.data ?? []).map((row) => ({ value: row.id, label: row.name })));
      setEdges((edgeResult.data ?? []).map((row) => ({ value: row.id, label: row.name })));
      setSinks((sinkResult.data ?? []).map((row) => ({ value: row.id, label: `${row.name} (${row.sku})` })));
      setPriceGroups((priceGroupResult.data ?? []).map((row) => ({ value: row.id, label: row.name })));
      setPriceGroupId(contextOrderId ? (orderPricing.data?.price_group_id ?? "") : (priceGroupResult.data?.[0]?.id ?? ""));
      setStones((profileResult.data ?? []).flatMap((row) => {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        const band = Array.isArray(row.countertop_material_price_bands) ? row.countertop_material_price_bands[0] : row.countertop_material_price_bands;
        if (!product || product.status !== "active") return [];
        return [{
          id: row.product_id,
          name: product.name ?? "",
          sku: product.sku ?? undefined,
          stone_type_id: row.stone_type_id,
          material_price_band_code: band?.code ?? undefined,
          price_per_sqft: band?.price_per_sqft === undefined || band?.price_per_sqft === null ? undefined : String(band.price_per_sqft),
        }];
      }));
      setServices((serviceResult.data ?? []).map((row) => ({ ...row, unit_price: String(row.unit_price), quantity: "1", selected: false })));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [orderId, orderItemId]);

  const filteredStones = useMemo(() => stones.filter((row) => !stoneTypeId || row.stone_type_id === stoneTypeId), [stones, stoneTypeId]);
  const selectedStone = stones.find((row) => row.id === stoneProductId);
  const canCalculate = Boolean(stoneProductId && priceGroupId && Number(sqft) > 0);
  const selectedServices = () => services.filter((row) => row.selected).map((row) => ({ service_id: row.id, quantity: row.quantity }));

  function toggleService(id: string) {
    setServices((rows) => rows.map((row) => row.id === id ? { ...row, selected: !row.selected } : row));
  }

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
    setResult(data as CountertopPriceResult);
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
    setResult((current) => current ? { ...current, attached: true, order_item_id: attachedItemId } : current);
    if (!orderItemId) setInitiationRequestId(crypto.randomUUID());
    if (attachedItemId) onAttached?.(attachedItemId);
  }

  if (loading) {
    return <ComponentCard title="Countertop configurator" desc="Loading managed Countertop references…"><p className="text-sm">Loading countertop references…</p></ComponentCard>;
  }

  return (
    <div className="space-y-5">
      <ComponentCard title="Countertop configurator" desc="Select managed references; server pricing is authoritative.">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              {orderContext ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge color="info">Order {orderContext.orderNumber}</Badge>
                  <span>{orderContext.lineNo ? `Line ${orderContext.lineNo}` : "New countertop"}</span>
                  {(orderContext.sku || orderContext.productName) ? <span>{orderContext.sku} · {orderContext.productName}</span> : null}
                </div>
              ) : null}
              {!orderItemId && !orderId ? <p className="text-sm">Open a draft customer order to configure and attach a countertop.</p> : null}
            </div>
            {onClose ? <Button variant="outline" onClick={onClose}>Close</Button> : null}
          </div>

          {error ? <Alert variant="error" title="Countertop action failed" message={error} /> : null}
          {result?.attached ? <Alert variant="success" title="Countertop added" message="The calculated countertop snapshot is attached to the Draft order." /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Stone type">
              <Select options={types} value={stoneTypeId} placeholder="Select Stone Type" allowEmpty onChange={(value) => { setStoneTypeId(value); setStoneProductId(""); setResult(null); }} />
            </Field>
            <Field label="Stone" required>
              <Select options={filteredStones.map((row) => ({ value: row.id, label: `${row.name} (${row.sku})` }))} value={stoneProductId} placeholder="Select Stone" onChange={(value) => { setStoneProductId(value); setResult(null); }} required />
            </Field>
            <Field label="Material price band">
              <div className="flex min-h-11 items-center gap-2 text-sm">
                {selectedStone ? <Badge color="info">{selectedStone.material_price_band_code} · {money(selectedStone.price_per_sqft)} / sq ft</Badge> : <span>Select a stone to view its material price band.</span>}
              </div>
            </Field>
            <Field label="Square feet" required>
              <Input type="number" step="0.0001" min="0.0001" value={sqft} onChange={(event) => { setSqft(event.target.value); setResult(null); }} />
            </Field>
            <Field label="Slabs to reserve">
              <Input type="number" step="1" min="1" value={slabQuantity} onChange={(event) => setSlabQuantity(event.target.value)} />
            </Field>
            <Field label="Edge">
              <Select options={edges} value={edgeId} placeholder="No edge profile" allowEmpty onChange={(value) => { setEdgeId(value); setResult(null); }} />
            </Field>
            <Field label="Edge linear feet">
              <Input type="number" step="0.0001" min="0" value={edgeLinearFt} onChange={(event) => { setEdgeLinearFt(event.target.value); setResult(null); }} />
            </Field>
            <Field label="Sink (optional)">
              <Select options={sinks} value={sinkId} placeholder="No sink" allowEmpty onChange={(value) => { setSinkId(value); setResult(null); }} />
            </Field>
            <Field label="Commercial price group">
              <Select options={priceGroups} value={priceGroupId} onChange={(value) => { setPriceGroupId(value); setResult(null); }} disabled={hasOrderPricingContext} />
              <p className="mt-1.5 text-xs">{hasOrderPricingContext ? "Inherited from the saved order." : "Select the pricing context for this countertop."}</p>
            </Field>
            <Field label="Manual $/sq ft (optional)">
              <Input inputMode="decimal" value={manualPrice} onChange={(event) => { setManualPrice(event.target.value); setResult(null); }} />
            </Field>
            <Field label="Override reason">
              <Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Additional services</h3>
            {services.length === 0 ? <p className="text-sm">No active services.</p> : null}
            {services.map((service) => (
              <div key={service.id} className="flex flex-wrap items-center gap-3">
                <div className="min-w-64 flex-1">
                  <Checkbox
                    checked={service.selected}
                    onChange={() => { toggleService(service.id); setResult(null); }}
                    label={`${service.name} (${service.pricing_method}) · ${money(service.unit_price)}`}
                  />
                </div>
                <div className="w-24">
                  <Input
                    ariaLabel={`${service.name} quantity`}
                    inputMode="decimal"
                    value={service.quantity}
                    disabled={!service.selected}
                    onChange={(event) => {
                      setServices((rows) => rows.map((row) => row.id === service.id ? { ...row, quantity: event.target.value } : row));
                      setResult(null);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={calculate} disabled={!canCalculate}>Calculate price</Button>
            {(orderItemId || orderId) ? (
              <Button variant="outline" onClick={attach} disabled={saving || !result}>
                {saving ? "Attaching…" : orderItemId ? "Attach draft snapshot" : "Add to draft order"}
              </Button>
            ) : null}
          </div>
        </div>
      </ComponentCard>

      {result ? (
        <ComponentCard title="Price Summary" desc="Authoritative server calculation for this Countertop configuration.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{result.stone?.name ?? selectedStone?.name ?? "Selected stone"}</span>
              {result.stone?.stone_type ? <Badge color="info">{result.stone.stone_type}</Badge> : null}
              {result.stone?.material_price_band ? <Badge color="primary">{result.stone.material_price_band}</Badge> : null}
              {result.stone?.sqft !== undefined ? <Badge color="light">{Number(result.stone.sqft)} sq ft</Badge> : null}
              {result.stone?.price_per_sqft !== undefined ? <Badge color="success">{money(result.stone.price_per_sqft)} / sq ft</Badge> : null}
            </div>
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              <SummaryRow label="Material" value={money(result.material_subtotal)} />
              <SummaryRow label="Edge" value={money(result.edge_subtotal)} />
              <SummaryRow label="Sink" value={money(result.sink_subtotal)} />
              <SummaryRow label="Services" value={money(result.services_subtotal)} />
            </div>
            <div className="border-t pt-3">
              <SummaryRow label="Total" value={money(result.subtotal)} strong />
            </div>
          </div>
        </ComponentCard>
      ) : null}
    </div>
  );
}
