import FormHint from "@/components/form/FormHint";
import Badge from "@/components/ui/badge/Badge";
import type { CountertopLineSummary } from "@/lib/customers/types";

type CountertopLineDetailsProps = {
  summary?: CountertopLineSummary | null;
};

function quantity(value: number | null, suffix: string) {
  if (value === null || !Number.isFinite(value)) return null;
  return `${Number(value.toFixed(4))} ${suffix}`;
}

export default function CountertopLineDetails({ summary }: CountertopLineDetailsProps) {
  if (!summary) return null;

  const serviceText = summary.services.length
    ? summary.services.map((service) => `${service.name} ×${Number(service.quantity.toFixed(4))}`).join(", ")
    : null;
  const details = [
    summary.edgeName
      ? `Edge: ${summary.edgeName}${summary.edgeLinearFt !== null ? ` · ${quantity(summary.edgeLinearFt, "lf")}` : ""}`
      : null,
    summary.sinkName ? `Sink: ${summary.sinkName}${summary.sinkSku ? ` (${summary.sinkSku})` : ""}` : null,
    serviceText ? `Services: ${serviceText}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {summary.stoneType ? <Badge size="sm" color="info">{summary.stoneType}</Badge> : null}
        {summary.sqft !== null ? <Badge size="sm" color="light">{quantity(summary.sqft, "sq ft")}</Badge> : null}
        {summary.materialPriceBand ? <Badge size="sm" color="primary">{summary.materialPriceBand}</Badge> : null}
        {summary.manualOverrideApplied ? <Badge size="sm" color="warning">Manual material price</Badge> : null}
      </div>
      {details.length ? <FormHint>{details.join(" · ")}</FormHint> : null}
      {summary.manualOverrideApplied && summary.manualOverrideReason ? <FormHint>Override: {summary.manualOverrideReason}</FormHint> : null}
    </div>
  );
}
