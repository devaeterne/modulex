import { supabase } from "@/lib/supabase/client";
import type { CountertopLineSummary } from "@/lib/customers/types";

type CountertopConfigurationRow = {
  order_item_id: string;
  pricing_snapshot: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function compactNumber(value: number) {
  return String(Number(value.toFixed(4)));
}

function parseCountertopLineSummary(row: CountertopConfigurationRow): CountertopLineSummary {
  const snapshot = asRecord(row.pricing_snapshot);
  const stone = asRecord(snapshot.stone);
  const edge = asRecord(snapshot.edge);
  const sink = asRecord(snapshot.sink);
  const manualOverride = asRecord(snapshot.manual_override);
  const serviceRows = Array.isArray(snapshot.services) ? snapshot.services : [];

  return {
    orderItemId: row.order_item_id,
    stoneName: textValue(stone.name),
    stoneSku: textValue(stone.sku),
    stoneType: textValue(stone.stone_type),
    sqft: numberValue(stone.sqft),
    materialPriceBand: textValue(stone.material_price_band),
    pricePerSqft: numberValue(stone.price_per_sqft),
    edgeName: textValue(edge.name),
    edgeLinearFt: numberValue(edge.linear_ft),
    sinkName: textValue(sink.name),
    sinkSku: textValue(sink.sku),
    services: serviceRows.flatMap((entry) => {
      const service = asRecord(entry);
      const name = textValue(service.name);
      const quantity = numberValue(service.quantity);
      return name && quantity !== null ? [{ name, quantity }] : [];
    }),
    manualOverrideApplied: manualOverride.applied === true,
    manualOverridePricePerSqft: numberValue(manualOverride.price_per_sqft),
    manualOverrideReason: textValue(manualOverride.reason),
  };
}

export async function loadCountertopLineSummaries(orderItemIds: string[]): Promise<CountertopLineSummary[]> {
  const ids = [...new Set(orderItemIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("countertop_configurations")
    .select("order_item_id, pricing_snapshot")
    .in("order_item_id", ids);

  if (error) throw error;
  return ((data ?? []) as CountertopConfigurationRow[]).map(parseCountertopLineSummary);
}

export function formatCountertopPrintDetail(summary?: CountertopLineSummary | null): string | null {
  if (!summary) return null;

  const material = [
    summary.stoneType ? `Material: ${summary.stoneType}` : summary.stoneName ? `Material: ${summary.stoneName}` : null,
    summary.sqft !== null ? `Area: ${compactNumber(summary.sqft)} sq ft` : null,
    summary.materialPriceBand ? `Band: ${summary.materialPriceBand}` : null,
  ].filter((value): value is string => Boolean(value));

  const rows = [
    material.length ? material.join(" · ") : null,
    summary.edgeName ? `Edge: ${summary.edgeName}${summary.edgeLinearFt !== null ? ` · ${compactNumber(summary.edgeLinearFt)} lf` : ""}` : null,
    summary.sinkName ? `Sink: ${summary.sinkName}${summary.sinkSku ? ` (${summary.sinkSku})` : ""}` : null,
    summary.services.length
      ? `Services: ${summary.services.map((service) => `${service.name} ×${compactNumber(service.quantity)}`).join(", ")}`
      : null,
    summary.manualOverrideApplied
      ? [
          summary.manualOverridePricePerSqft !== null ? `Manual material price: ${compactNumber(summary.manualOverridePricePerSqft)}/sq ft` : "Manual material price override",
          summary.manualOverrideReason ? `Reason: ${summary.manualOverrideReason}` : null,
        ].filter(Boolean).join(" · ")
      : null,
  ].filter((value): value is string => Boolean(value));

  return rows.length ? rows.join("\n") : null;
}
