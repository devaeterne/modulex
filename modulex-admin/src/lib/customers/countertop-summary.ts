import { supabase } from "@/lib/supabase/client";
import type { CountertopLineSummary } from "@/lib/customers/types";

type CountertopConfigurationRow = { order_item_id: string; pricing_snapshot: unknown };
type CountertopLineSummaryWithFaucet = CountertopLineSummary & { faucetName?: string | null; faucetSku?: string | null; backsplashSummary?: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function textValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function compactNumber(value: number) { return String(Number(value.toFixed(4))); }
function fixtureLabel(entry: unknown) {
  const fixture = asRecord(entry); const name = textValue(fixture.name); if (!name) return null;
  const quantity = numberValue(fixture.quantity) ?? 1;
  return quantity === 1 ? name : `${name} ×${compactNumber(quantity)}`;
}
function aggregateFixtures(snapshot: Record<string, unknown>, type: "sink" | "faucet") {
  const explicit = Array.isArray(snapshot[type === "sink" ? "sinks" : "faucets"])
    ? snapshot[type === "sink" ? "sinks" : "faucets"] as unknown[]
    : Array.isArray(snapshot.fixtures)
      ? (snapshot.fixtures as unknown[]).filter((entry) => asRecord(entry).fixture_type === type)
      : [];
  return explicit.map(fixtureLabel).filter((value): value is string => Boolean(value)).join(", ") || null;
}
function backsplashLabel(entry: unknown) {
  const backsplash = asRecord(entry);
  const mode = textValue(backsplash.height_mode);
  const height = numberValue(backsplash.height_inches);
  const linearFt = numberValue(backsplash.linear_ft);
  const sqft = numberValue(backsplash.sqft);
  if (!mode || linearFt === null || sqft === null) return null;
  const heightLabel = mode === "full_height" ? `Full Height${height !== null ? ` ${compactNumber(height)}\"` : ""}` : `${mode}\"`;
  const edgeName = textValue(backsplash.edge_name);
  return `${heightLabel} · ${compactNumber(linearFt)} lf · ${compactNumber(sqft)} sq ft${edgeName ? ` · ${edgeName}` : ""}`;
}
function aggregateBacksplashes(snapshot: Record<string, unknown>) {
  const backsplashes = Array.isArray(snapshot.backsplashes) ? snapshot.backsplashes as unknown[] : [];
  return backsplashes.map(backsplashLabel).filter((value): value is string => Boolean(value)).join(", ") || null;
}

function parseCountertopLineSummary(row: CountertopConfigurationRow): CountertopLineSummaryWithFaucet {
  const snapshot = asRecord(row.pricing_snapshot); const stone = asRecord(snapshot.stone); const edge = asRecord(snapshot.edge);
  const sink = asRecord(snapshot.sink); const faucet = asRecord(snapshot.faucet); const manualOverride = asRecord(snapshot.manual_override);
  const serviceRows = Array.isArray(snapshot.services) ? snapshot.services : [];
  const multiSinkName = aggregateFixtures(snapshot,"sink"); const multiFaucetName = aggregateFixtures(snapshot,"faucet"); const backsplashSummary = aggregateBacksplashes(snapshot);
  return {
    orderItemId: row.order_item_id, stoneName: textValue(stone.name), stoneSku: textValue(stone.sku), stoneType: textValue(stone.stone_type),
    sqft: numberValue(stone.sqft), materialPriceBand: textValue(stone.material_price_band), pricePerSqft: numberValue(stone.price_per_sqft),
    edgeName: textValue(edge.name), edgeLinearFt: numberValue(edge.linear_ft),
    sinkName: multiSinkName ?? textValue(sink.name), sinkSku: multiSinkName ? null : textValue(sink.sku),
    faucetName: multiFaucetName ?? textValue(faucet.name), faucetSku: multiFaucetName ? null : textValue(faucet.sku), backsplashSummary,
    services: serviceRows.flatMap((entry) => { const service=asRecord(entry); const name=textValue(service.name); const quantity=numberValue(service.quantity); return name&&quantity!==null?[{name,quantity}]:[]; }),
    manualOverrideApplied: manualOverride.applied === true, manualOverridePricePerSqft: numberValue(manualOverride.price_per_sqft), manualOverrideReason: textValue(manualOverride.reason),
  };
}

export async function loadCountertopLineSummaries(orderItemIds: string[]): Promise<CountertopLineSummary[]> {
  const ids=[...new Set(orderItemIds.filter(Boolean))]; if(!ids.length)return[];
  const {data,error}=await supabase.from("countertop_configurations").select("order_item_id, pricing_snapshot").in("order_item_id",ids);
  if(error)throw error; return ((data??[]) as CountertopConfigurationRow[]).map(parseCountertopLineSummary);
}

export function formatCountertopPrintDetail(summary?: CountertopLineSummaryWithFaucet | null): string | null {
  if(!summary)return null;
  const material=[summary.stoneType?`Material: ${summary.stoneType}`:summary.stoneName?`Material: ${summary.stoneName}`:null,summary.sqft!==null?`Area: ${compactNumber(summary.sqft)} sq ft`:null,summary.materialPriceBand?`Band: ${summary.materialPriceBand}`:null].filter((value):value is string=>Boolean(value));
  const rows=[material.length?material.join(" · "):null,summary.edgeName?`Edge: ${summary.edgeName}${summary.edgeLinearFt!==null?` · ${compactNumber(summary.edgeLinearFt)} lf`:""}`:null,summary.sinkName?`Sink: ${summary.sinkName}${summary.sinkSku?` (${summary.sinkSku})`:""}`:null,summary.faucetName?`Faucet: ${summary.faucetName}${summary.faucetSku?` (${summary.faucetSku})`:""}`:null,summary.backsplashSummary?`Backsplash: ${summary.backsplashSummary}`:null,summary.services.length?`Services: ${summary.services.map((service)=>`${service.name} ×${compactNumber(service.quantity)}`).join(", ")}`:null,summary.manualOverrideApplied?[summary.manualOverridePricePerSqft!==null?`Manual material price: ${compactNumber(summary.manualOverridePricePerSqft)}/sq ft`:"Manual material price override",summary.manualOverrideReason?`Reason: ${summary.manualOverrideReason}`:null].filter(Boolean).join(" · "):null].filter((value):value is string=>Boolean(value));
  return rows.length?rows.join("\n"):null;
}
