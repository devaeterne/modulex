"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import SectionTitle from "@/components/common/SectionTitle";
import SummaryRow from "@/components/common/SummaryRow";
import FormHint from "@/components/form/FormHint";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import SearchableSelect from "@/components/form/SearchableSelect";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { parseDbDecimal } from "@/lib/validation";

type Option = { value: string; label: string };
type MaterialBandRow = { id: string; code: string; price_per_sqft: string };
type StoneRow = {
  id: string;
  name: string;
  sku?: string;
  stone_type_id?: string;
  material_price_band_id?: string;
};
type CatalogProductRow = { id: string; name: string; sku?: string };
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
    material_price_band_id?: string;
    material_price_band?: string;
  };
  subtotal?: string | number;
  material_subtotal?: string | number;
  edge_subtotal?: string | number;
  sink_subtotal?: string | number;
  faucet_subtotal?: string | number;
  services_subtotal?: string | number;
  sink_price_source?: "price_group" | "manual_fallback" | "customer_provided" | null;
  faucet_price_source?: "price_group" | "customer_provided" | null;
  attached?: boolean;
  order_item_id?: string;
};
type ExistingConfiguration = {
  stone_product_id: string;
  material_price_band_id: string | null;
  sink_product_id: string | null;
  price_group_id: string;
  sqft: string | number;
  edge_profile_id: string | null;
  edge_linear_ft: string | number;
  slab_quantity: string | number;
  manual_price_per_sqft: string | number | null;
  manual_sink_price: string | number | null;
  override_reason: string | null;
  configuration: unknown;
  pricing_snapshot: unknown;
};
type CountertopConfiguratorProps = {
  orderId?: string;
  orderItemId?: string;
  orderContext?: { orderNumber: string; lineNo?: number; sku?: string; productName?: string };
  onAttached?: (orderItemId: string) => void;
  onClose?: () => void;
};

const CUSTOMER_PROVIDED_SINK_VALUE = "__customer_provided__";
const CUSTOMER_PROVIDED_FAUCET_VALUE = "__customer_provided_faucet__";
const MANUAL_SINK_PRICE_CONTRACT = {
  precision: 18,
  scale: 4,
  min: 0.0001,
  allowNull: true,
} as const;

function money(value: string | number | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function Field({ label, required = false, hint, children }: { label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{required ? " *" : ""}</Label>
      {children}
      {hint ? <FormHint>{hint}</FormHint> : null}
    </div>
  );
}

function priceResultFromSnapshot(value: unknown, orderItemId: string): CountertopPriceResult | null {
  const snapshot = asRecord(value);
  if (Object.keys(snapshot).length === 0) return null;
  const totals = asRecord(snapshot.totals);
  return {
    ...(snapshot as CountertopPriceResult),
    subtotal: snapshot.subtotal as string | number | undefined ?? totals.subtotal as string | number | undefined,
    material_subtotal: snapshot.material_subtotal as string | number | undefined ?? totals.material_subtotal as string | number | undefined,
    edge_subtotal: snapshot.edge_subtotal as string | number | undefined ?? totals.edge_subtotal as string | number | undefined,
    sink_subtotal: snapshot.sink_subtotal as string | number | undefined ?? totals.sink_subtotal as string | number | undefined,
    faucet_subtotal: snapshot.faucet_subtotal as string | number | undefined ?? totals.faucet_subtotal as string | number | undefined,
    services_subtotal: snapshot.services_subtotal as string | number | undefined ?? totals.services_subtotal as string | number | undefined,
    attached: true,
    order_item_id: orderItemId,
  };
}

export default function CountertopConfigurator({ orderId, orderItemId, orderContext, onAttached, onClose }: CountertopConfiguratorProps = {}) {
  const [types, setTypes] = useState<Option[]>([]);
  const [edges, setEdges] = useState<Option[]>([]);
  const [sinks, setSinks] = useState<Option[]>([]);
  const [sinkCatalog, setSinkCatalog] = useState<CatalogProductRow[]>([]);
  const [faucets, setFaucets] = useState<Option[]>([]);
  const [faucetCatalog, setFaucetCatalog] = useState<CatalogProductRow[]>([]);
  const [priceGroups, setPriceGroups] = useState<Option[]>([]);
  const [stones, setStones] = useState<StoneRow[]>([]);
  const [materialBands, setMaterialBands] = useState<MaterialBandRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [stoneTypeId, setStoneTypeId] = useState("");
  const [stoneProductId, setStoneProductId] = useState("");
  const [materialBandId, setMaterialBandId] = useState("");
  const [priceGroupId, setPriceGroupId] = useState("");
  const [edgeId, setEdgeId] = useState("");
  const [sinkId, setSinkId] = useState("");
  const [customerProvidedSinkCatalogId, setCustomerProvidedSinkCatalogId] = useState("");
  const [customerProvidedSinkNote, setCustomerProvidedSinkNote] = useState("");
  const [manualSinkPrice, setManualSinkPrice] = useState("");
  const [faucetId, setFaucetId] = useState("");
  const [customerProvidedFaucetCatalogId, setCustomerProvidedFaucetCatalogId] = useState("");
  const [customerProvidedFaucetNote, setCustomerProvidedFaucetNote] = useState("");
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
  const [resolvedLineNo, setResolvedLineNo] = useState<number | null>(orderContext?.lineNo ?? null);

  const hasOrderPricingContext = Boolean(orderId || orderItemId);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [typeResult, edgeResult, sinkResult, faucetResult, profileResult, bandResult, priceGroupResult, serviceResult] = await Promise.all([
        supabase.from("countertop_stone_types").select("id,name").eq("is_active", true).order("name"),
        supabase.from("countertop_edge_profiles").select("id,name").eq("is_active", true).order("name"),
        supabase.from("products").select("id,name,sku").eq("status", "active").contains("metadata", { product_kind: "sink" }).order("name"),
        supabase.from("products").select("id,name,sku").eq("status", "active").contains("metadata", { product_kind: "faucet" }).order("name"),
        supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,material_price_band_id,products(id,name,sku,status)").eq("is_active", true),
        supabase.from("countertop_material_price_bands").select("id,code,price_per_sqft").eq("is_active", true).order("sort_order").order("code"),
        supabase.from("price_groups").select("id,name,available_for_orders,internal_only").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
        supabase.from("countertop_services").select("id,name,pricing_method,unit_price").eq("is_active", true).order("name"),
      ]);

      const orderItemContext = orderItemId
        ? await supabase.from("customer_order_items").select("order_id,line_no").eq("id", orderItemId).maybeSingle()
        : { data: null, error: null };
      const contextOrderId = orderId ?? orderItemContext.data?.order_id ?? null;
      const [orderPricing, existingConfigurationResult] = await Promise.all([
        contextOrderId
          ? supabase.from("customer_orders").select("price_group_id").eq("id", contextOrderId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        orderItemId
          ? supabase.from("countertop_configurations").select("stone_product_id,material_price_band_id,sink_product_id,price_group_id,sqft,edge_profile_id,edge_linear_ft,slab_quantity,manual_price_per_sqft,manual_sink_price,override_reason,configuration,pricing_snapshot").eq("order_item_id", orderItemId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (!mounted) return;
      setResolvedLineNo(orderContext?.lineNo ?? orderItemContext.data?.line_no ?? null);
      const referenceError = [typeResult, edgeResult, sinkResult, faucetResult, profileResult, bandResult, priceGroupResult, serviceResult].find((entry) => entry.error)?.error
        ?? orderItemContext.error
        ?? orderPricing.error
        ?? existingConfigurationResult.error;
      if (referenceError) setError(errorMessage(referenceError, "Countertop reference data could not be loaded."));

      const mappedStones = (profileResult.data ?? []).flatMap((row) => {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        if (!product || product.status !== "active") return [];
        return [{
          id: row.product_id,
          name: product.name ?? "",
          sku: product.sku ?? undefined,
          stone_type_id: row.stone_type_id,
          material_price_band_id: row.material_price_band_id,
        }];
      });
      const mappedBands = (bandResult.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        price_per_sqft: String(row.price_per_sqft),
      }));
      const mappedSinks: CatalogProductRow[] = (sinkResult.data ?? []).map((row) => ({ id: row.id, name: row.name, sku: row.sku ?? undefined }));
      const mappedFaucets: CatalogProductRow[] = (faucetResult.data ?? []).map((row) => ({ id: row.id, name: row.name, sku: row.sku ?? undefined }));
      const baseServices = (serviceResult.data ?? []).map((row) => ({ ...row, unit_price: String(row.unit_price), quantity: "1", selected: false }));
      const existing = existingConfigurationResult.data as ExistingConfiguration | null;
      const savedConfiguration = asRecord(existing?.configuration);
      const savedSnapshot = asRecord(existing?.pricing_snapshot);
      const savedStoneSnapshot = asRecord(savedSnapshot.stone);
      const savedServiceRows = Array.isArray(savedSnapshot.services) ? savedSnapshot.services : [];
      const savedServiceMap = new Map(savedServiceRows.flatMap((entry) => {
        const service = asRecord(entry);
        const id = typeof service.service_id === "string" ? service.service_id : null;
        return id ? [[id, String(service.quantity ?? "1")]] : [];
      }));

      setTypes((typeResult.data ?? []).map((row) => ({ value: row.id, label: row.name })));
      setEdges((edgeResult.data ?? []).map((row) => ({ value: row.id, label: row.name })));
      setSinkCatalog(mappedSinks);
      setSinks([
        { value: CUSTOMER_PROVIDED_SINK_VALUE, label: "Customer Provides" },
        ...mappedSinks.map((row) => ({ value: row.id, label: row.sku ? `${row.name} (${row.sku})` : row.name })),
      ]);
      setFaucetCatalog(mappedFaucets);
      setFaucets([
        { value: CUSTOMER_PROVIDED_FAUCET_VALUE, label: "Customer Provides" },
        ...mappedFaucets.map((row) => ({ value: row.id, label: row.sku ? `${row.name} (${row.sku})` : row.name })),
      ]);
      setPriceGroups((priceGroupResult.data ?? []).map((row) => ({ value: row.id, label: row.name })));
      setStones(mappedStones);
      setMaterialBands(mappedBands);
      setServices(baseServices.map((service) => savedServiceMap.has(service.id)
        ? { ...service, selected: true, quantity: savedServiceMap.get(service.id) ?? "1" }
        : service));

      if (existing) {
        const savedStone = mappedStones.find((stone) => stone.id === existing.stone_product_id);
        const snapshotBandId = typeof savedStoneSnapshot.material_price_band_id === "string" ? savedStoneSnapshot.material_price_band_id : null;
        const isCustomerProvidedSink = savedConfiguration.sink_source === "customer_provided";
        const isCustomerProvidedFaucet = savedConfiguration.faucet_source === "customer_provided";
        const savedFaucetProductId = typeof savedConfiguration.faucet_product_id === "string" ? savedConfiguration.faucet_product_id : "";
        setStoneProductId(existing.stone_product_id);
        setStoneTypeId(savedStone?.stone_type_id ?? "");
        setMaterialBandId(existing.material_price_band_id || snapshotBandId || savedStone?.material_price_band_id || "");
        setPriceGroupId(existing.price_group_id || orderPricing.data?.price_group_id || "");
        setSqft(String(existing.sqft));
        setEdgeId(existing.edge_profile_id ?? "");
        setEdgeLinearFt(String(existing.edge_linear_ft ?? 0));
        setSinkId(isCustomerProvidedSink ? CUSTOMER_PROVIDED_SINK_VALUE : (existing.sink_product_id ?? ""));
        setCustomerProvidedSinkCatalogId(isCustomerProvidedSink && typeof savedConfiguration.customer_provided_sink_product_id === "string" ? savedConfiguration.customer_provided_sink_product_id : "");
        setCustomerProvidedSinkNote(isCustomerProvidedSink && typeof savedConfiguration.customer_provided_sink_note === "string" ? savedConfiguration.customer_provided_sink_note : "");
        setManualSinkPrice(isCustomerProvidedSink || existing.manual_sink_price === null ? "" : String(existing.manual_sink_price));
        setFaucetId(isCustomerProvidedFaucet ? CUSTOMER_PROVIDED_FAUCET_VALUE : savedFaucetProductId);
        setCustomerProvidedFaucetCatalogId(isCustomerProvidedFaucet && typeof savedConfiguration.customer_provided_faucet_product_id === "string" ? savedConfiguration.customer_provided_faucet_product_id : "");
        setCustomerProvidedFaucetNote(isCustomerProvidedFaucet && typeof savedConfiguration.customer_provided_faucet_note === "string" ? savedConfiguration.customer_provided_faucet_note : "");
        setSlabQuantity(String(existing.slab_quantity ?? 1));
        setManualPrice(existing.manual_price_per_sqft === null ? "" : String(existing.manual_price_per_sqft));
        setOverrideReason(existing.override_reason ?? "");
        setResult(priceResultFromSnapshot(existing.pricing_snapshot, orderItemId ?? ""));
      } else {
        setPriceGroupId(contextOrderId ? (orderPricing.data?.price_group_id ?? "") : (priceGroupResult.data?.[0]?.id ?? ""));
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [orderId, orderItemId, orderContext?.lineNo]);

  const stoneOptions = stones
    .filter((row) => !stoneTypeId || row.stone_type_id === stoneTypeId)
    .map((row) => ({ value: row.id, label: row.sku ? `${row.name} (${row.sku})` : row.name }));
  const selectedStone = stones.find((row) => row.id === stoneProductId);
  const selectedBand = materialBands.find((row) => row.id === materialBandId);
  const defaultBand = materialBands.find((row) => row.id === selectedStone?.material_price_band_id);
  const selectedSinkProductId = sinkId && sinkId !== CUSTOMER_PROVIDED_SINK_VALUE ? sinkId : null;
  const customerProvidedCatalogSink = sinkCatalog.find((row) => row.id === customerProvidedSinkCatalogId);
  const customerProvidedSinkOptions = sinkCatalog.map((row) => ({ value: row.id, label: row.sku ? `${row.name} (${row.sku})` : row.name }));
  const selectedFaucetProductId = faucetId && faucetId !== CUSTOMER_PROVIDED_FAUCET_VALUE ? faucetId : null;
  const customerProvidedCatalogFaucet = faucetCatalog.find((row) => row.id === customerProvidedFaucetCatalogId);
  const customerProvidedFaucetOptions = faucetCatalog.map((row) => ({ value: row.id, label: row.sku ? `${row.name} (${row.sku})` : row.name }));
  const canCalculate = Boolean(stoneProductId && materialBandId && priceGroupId && Number(sqft) > 0);
  const selectedServices = () => services.filter((row) => row.selected).map((row) => ({ service_id: row.id, quantity: row.quantity }));
  const materialBandHint = !selectedStone
    ? "Select a stone. Its catalog band will be preselected, and any active band can be used for this order."
    : defaultBand && materialBandId === defaultBand.id
      ? `Default for this stone: ${defaultBand.code} · ${money(defaultBand.price_per_sqft)} / sq ft.`
      : defaultBand
        ? `Stone default: ${defaultBand.code} · ${money(defaultBand.price_per_sqft)} / sq ft. This order uses the selected band.`
        : "Choose any active Material Price Band for this order.";

  function toggleService(id: string) {
    setServices((rows) => rows.map((row) => row.id === id ? { ...row, selected: !row.selected } : row));
  }

  function parseManualSinkPrice() {
    const parsed = parseDbDecimal(manualSinkPrice, MANUAL_SINK_PRICE_CONTRACT);
    if (parsed.error) {
      setError(`Manual Sink fallback: ${parsed.error}`);
      return null;
    }
    if (!selectedSinkProductId && parsed.value !== null) {
      setError("Select a Modulex Sink before entering a manual Sink fallback price.");
      return null;
    }
    return parsed.value;
  }

  function validateCustomerProvidedSink() {
    if (sinkId !== CUSTOMER_PROVIDED_SINK_VALUE) return true;
    if (customerProvidedSinkCatalogId || customerProvidedSinkNote.trim()) return true;
    setError("Select the customer-provided Sink from the catalog or enter its brand/model details.");
    return false;
  }

  function validateCustomerProvidedFaucet() {
    if (faucetId !== CUSTOMER_PROVIDED_FAUCET_VALUE) return true;
    if (customerProvidedFaucetCatalogId || customerProvidedFaucetNote.trim()) return true;
    setError("Select the customer-provided Faucet from the catalog or enter its brand/model details.");
    return false;
  }

  async function calculate() {
    setError(null);
    setResult(null);
    if (!priceGroupId) return setError("This order needs a saved price group before countertop pricing can be calculated.");
    if (!stoneProductId || Number(sqft) <= 0) return setError("Select a stone and enter square footage before calculating.");
    if (!materialBandId) return setError("Select a Material Price Band before calculating.");
    if (!validateCustomerProvidedSink() || !validateCustomerProvidedFaucet()) return;
    const normalizedManualSinkPrice = parseManualSinkPrice();
    if (normalizedManualSinkPrice === null && manualSinkPrice.trim()) return;

    const { data, error: pricingError } = await supabase.rpc("calculate_countertop_price_with_faucet", {
      p_stone_product_id: stoneProductId,
      p_material_price_band_id: materialBandId,
      p_price_group_id: priceGroupId,
      p_sqft: sqft,
      p_edge_profile_id: edgeId || null,
      p_edge_linear_ft: edgeLinearFt || "0",
      p_sink_product_id: selectedSinkProductId,
      p_services: selectedServices(),
      p_manual_material_price: manualPrice || null,
      p_manual_sink_price: normalizedManualSinkPrice,
      p_faucet_product_id: selectedFaucetProductId,
    });
    if (pricingError) return setError(errorMessage(pricingError, "Unable to calculate countertop pricing."));
    setResult(data as CountertopPriceResult);
  }

  async function attach() {
    if (!result) return setError("Calculate countertop pricing before attaching.");
    if (!orderItemId && !orderId) return setError("Open a draft customer order to configure and attach a countertop.");
    if (!materialBandId) return setError("Select a Material Price Band before saving the countertop.");
    if (!validateCustomerProvidedSink() || !validateCustomerProvidedFaucet()) return;
    const normalizedManualSinkPrice = parseManualSinkPrice();
    if (normalizedManualSinkPrice === null && manualSinkPrice.trim()) return;

    setSaving(true);
    setError(null);
    const common = {
      p_stone_product_id: stoneProductId,
      p_material_price_band_id: materialBandId,
      p_price_group_id: priceGroupId,
      p_sqft: sqft,
      p_edge_profile_id: edgeId || null,
      p_edge_linear_ft: edgeLinearFt || "0",
      p_sink_product_id: selectedSinkProductId,
      p_services: selectedServices(),
      p_configuration: {
        edge_profile_id: edgeId || null,
        material_price_band_id: materialBandId,
        service_selection: selectedServices(),
        sink_source: sinkId === CUSTOMER_PROVIDED_SINK_VALUE ? "customer_provided" : selectedSinkProductId ? "modulex" : null,
        ...(sinkId === CUSTOMER_PROVIDED_SINK_VALUE ? {
          customer_provided_sink_product_id: customerProvidedCatalogSink?.id ?? null,
          customer_provided_sink_name: customerProvidedCatalogSink?.name ?? null,
          customer_provided_sink_sku: customerProvidedCatalogSink?.sku ?? null,
          customer_provided_sink_note: customerProvidedSinkNote.trim() || null,
        } : {}),
        ...(normalizedManualSinkPrice === null ? {} : { manual_sink_price: normalizedManualSinkPrice }),
        faucet_source: faucetId === CUSTOMER_PROVIDED_FAUCET_VALUE ? "customer_provided" : selectedFaucetProductId ? "modulex" : null,
        ...(selectedFaucetProductId ? { faucet_product_id: selectedFaucetProductId } : {}),
        ...(faucetId === CUSTOMER_PROVIDED_FAUCET_VALUE ? {
          customer_provided_faucet_product_id: customerProvidedCatalogFaucet?.id ?? null,
          customer_provided_faucet_name: customerProvidedCatalogFaucet?.name ?? null,
          customer_provided_faucet_sku: customerProvidedCatalogFaucet?.sku ?? null,
          customer_provided_faucet_note: customerProvidedFaucetNote.trim() || null,
        } : {}),
      },
      p_manual_material_price: manualPrice || null,
      p_slab_quantity: slabQuantity,
      p_override_reason: overrideReason || null,
    };
    const response = orderItemId
      ? await supabase.rpc("attach_countertop_configuration", { ...common, p_order_item_id: orderItemId })
      : await supabase.rpc("create_and_attach_countertop_order_item", { ...common, p_order_id: orderId, p_request_id: initiationRequestId });
    setSaving(false);

    if (response.error) return setError(errorMessage(response.error, orderItemId ? "Unable to attach countertop configuration." : "Unable to add countertop to this draft order."));
    const attachedItemId = String(response.data ?? orderItemId ?? "");
    setResult((current) => current ? { ...current, attached: true, order_item_id: attachedItemId } : current);
    if (!orderItemId) setInitiationRequestId(crypto.randomUUID());
    if (attachedItemId) onAttached?.(attachedItemId);
  }

  if (loading) {
    return <ComponentCard title="Countertop configurator" desc="Loading managed Countertop references…"><FormHint>Loading countertop references…</FormHint></ComponentCard>;
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
                  <Badge color="light">{resolvedLineNo ? `Line ${resolvedLineNo}` : "New countertop"}</Badge>
                  {(orderContext.sku || orderContext.productName) ? (
                    <Badge color="light">{[orderContext.sku, orderContext.productName].filter(Boolean).join(" · ")}</Badge>
                  ) : null}
                </div>
              ) : null}
              {!orderItemId && !orderId ? <FormHint>Open a draft customer order to configure and attach a countertop.</FormHint> : null}
            </div>
            {onClose ? <Button variant="outline" onClick={onClose}>Close</Button> : null}
          </div>

          {error ? <Alert variant="error" title="Countertop action failed" message={error} /> : null}
          {result?.attached ? <Alert variant="success" title="Countertop saved" message="The Countertop snapshot is attached to the Draft order. Saved selections are restored when this line is reopened." /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Stone type">
              <Select options={types} value={stoneTypeId} placeholder="Select Stone Type" allowEmpty onChange={(value) => { setStoneTypeId(value); setStoneProductId(""); setMaterialBandId(""); setResult(null); }} />
            </Field>
            <Field label="Stone" required>
              <SearchableSelect options={stoneOptions} value={stoneProductId} placeholder="Select Stone" searchPlaceholder="Search stone by name or SKU" onChange={(value) => {
                const nextStone = stones.find((row) => row.id === value);
                setStoneProductId(value);
                setMaterialBandId(nextStone?.material_price_band_id ?? "");
                setResult(null);
              }} required />
            </Field>
            <Field label="Material price band" required hint={materialBandHint}>
              <Select options={materialBands.map((band) => ({ value: band.id, label: `${band.code} · ${money(band.price_per_sqft)} / sq ft` }))} value={materialBandId} placeholder="Select Material Price Band" onChange={(value) => { setMaterialBandId(value); setResult(null); }} required />
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
              <SearchableSelect options={sinks} value={sinkId} placeholder="No sink" searchPlaceholder="Search sink by name or SKU" allowEmpty onChange={(value) => {
                if (value !== sinkId) setManualSinkPrice("");
                setSinkId(value);
                if (value !== CUSTOMER_PROVIDED_SINK_VALUE) {
                  setCustomerProvidedSinkCatalogId("");
                  setCustomerProvidedSinkNote("");
                }
                setResult(null);
              }} />
            </Field>
            <Field label="Manual sink price fallback (optional)" hint="Used only when the selected Modulex Sink has no current active price for this order's price group. Customer-provided Sinks are not priced or reserved.">
              <Input type="number" inputMode="decimal" step="0.0001" min="0.0001" value={manualSinkPrice} disabled={!selectedSinkProductId} onChange={(event) => { setManualSinkPrice(event.target.value); setResult(null); }} />
            </Field>
            {sinkId === CUSTOMER_PROVIDED_SINK_VALUE ? (
              <>
                <Field label="Customer-provided sink — catalog match (optional)" hint="Choose it here when the customer's Sink already exists in Modulex. It will be recorded for project history but will not be priced or reserved.">
                  <SearchableSelect options={customerProvidedSinkOptions} value={customerProvidedSinkCatalogId} placeholder="Not in Modulex catalog" searchPlaceholder="Search known sink by name or SKU" allowEmpty onChange={(value) => { setCustomerProvidedSinkCatalogId(value); setResult(null); }} />
                </Field>
                <Field label="Customer-provided sink details" required={!customerProvidedSinkCatalogId} hint="If it is not in Modulex, enter brand, model, size, finish, or other identifying information.">
                  <Input value={customerProvidedSinkNote} placeholder="Example: Ruvati RVH8300, 30 in, stainless" onChange={(event) => { setCustomerProvidedSinkNote(event.target.value); setResult(null); }} />
                </Field>
              </>
            ) : null}
            <Field label="Faucet (optional)">
              <SearchableSelect options={faucets} value={faucetId} placeholder="No faucet" searchPlaceholder="Search faucet by name or SKU" allowEmpty onChange={(value) => {
                setFaucetId(value);
                if (value !== CUSTOMER_PROVIDED_FAUCET_VALUE) {
                  setCustomerProvidedFaucetCatalogId("");
                  setCustomerProvidedFaucetNote("");
                }
                setResult(null);
              }} />
            </Field>
            {faucetId === CUSTOMER_PROVIDED_FAUCET_VALUE ? (
              <>
                <Field label="Customer-provided faucet — catalog match (optional)" hint="Choose it when the customer's Faucet already exists in Modulex. It is recorded for project history and is not priced or reserved.">
                  <SearchableSelect options={customerProvidedFaucetOptions} value={customerProvidedFaucetCatalogId} placeholder="Not in Modulex catalog" searchPlaceholder="Search known faucet by name or SKU" allowEmpty onChange={(value) => { setCustomerProvidedFaucetCatalogId(value); setResult(null); }} />
                </Field>
                <Field label="Customer-provided faucet details" required={!customerProvidedFaucetCatalogId} hint="If it is not in Modulex, enter brand, model, finish, or other identifying information.">
                  <Input value={customerProvidedFaucetNote} placeholder="Example: Kohler K-596-VS, Vibrant Stainless" onChange={(event) => { setCustomerProvidedFaucetNote(event.target.value); setResult(null); }} />
                </Field>
              </>
            ) : null}
            <Field label="Commercial price group" hint={hasOrderPricingContext ? "Inherited from the saved order." : "Select the pricing context for this countertop."}>
              <Select options={priceGroups} value={priceGroupId} onChange={(value) => { setPriceGroupId(value); setResult(null); }} disabled={hasOrderPricingContext} />
            </Field>
            <Field label="Manual $/sq ft (optional)" hint={selectedBand ? `Overrides the selected ${selectedBand.code} band price for this order only.` : undefined}>
              <Input inputMode="decimal" value={manualPrice} onChange={(event) => { setManualPrice(event.target.value); setResult(null); }} />
            </Field>
            <Field label="Override reason">
              <Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-3">
            <SectionTitle>Additional services</SectionTitle>
            {services.length === 0 ? <FormHint>No active services.</FormHint> : null}
            {services.map((service) => (
              <div key={service.id} className="flex flex-wrap items-center gap-3">
                <div className="min-w-64 flex-1">
                  <Checkbox checked={service.selected} onChange={() => { toggleService(service.id); setResult(null); }} label={`${service.name} (${service.pricing_method}) · ${money(service.unit_price)}`} />
                </div>
                <div className="w-24">
                  <Input ariaLabel={`${service.name} quantity`} inputMode="decimal" value={service.quantity} disabled={!service.selected} onChange={(event) => {
                    setServices((rows) => rows.map((row) => row.id === service.id ? { ...row, quantity: event.target.value } : row));
                    setResult(null);
                  }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={calculate} disabled={!canCalculate}>Calculate price</Button>
            {(orderItemId || orderId) ? (
              <Button variant="outline" onClick={attach} disabled={saving || !result}>
                {saving ? "Saving…" : orderItemId ? "Save Countertop" : "Add to draft order"}
              </Button>
            ) : null}
          </div>
        </div>
      </ComponentCard>

      {result ? (
        <ComponentCard title="Price Summary" desc="Authoritative server calculation for this Countertop configuration.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="light">{result.stone?.name ?? selectedStone?.name ?? "Selected stone"}</Badge>
              {result.stone?.stone_type ? <Badge color="info">{result.stone.stone_type}</Badge> : null}
              {result.stone?.material_price_band ? <Badge color="primary">{result.stone.material_price_band}</Badge> : null}
              {result.stone?.sqft !== undefined ? <Badge color="light">{Number(result.stone.sqft)} sq ft</Badge> : null}
              {result.stone?.price_per_sqft !== undefined ? <Badge color="success">{money(result.stone.price_per_sqft)} / sq ft</Badge> : null}
              {sinkId === CUSTOMER_PROVIDED_SINK_VALUE ? <Badge color="info">Customer Provides Sink</Badge> : null}
              {result.sink_price_source === "manual_fallback" ? <Badge color="warning">Manual Sink fallback</Badge> : null}
              {faucetId === CUSTOMER_PROVIDED_FAUCET_VALUE ? <Badge color="info">Customer Provides Faucet</Badge> : null}
            </div>
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              <SummaryRow label="Material" value={money(result.material_subtotal)} />
              <SummaryRow label="Edge" value={money(result.edge_subtotal)} />
              <SummaryRow label="Sink" value={money(result.sink_subtotal)} />
              <SummaryRow label="Faucet" value={money(result.faucet_subtotal)} />
              <SummaryRow label="Services" value={money(result.services_subtotal)} />
            </div>
            <SummaryRow label="Total" value={money(result.subtotal)} strong divider />
          </div>
        </ComponentCard>
      ) : null}
    </div>
  );
}