import { parseDbDecimal } from "@/lib/validation";

export type CountertopCharge = { id: string; name: string; pricing_method: "each" | "sq_ft" | "linear_ft" | "flat"; unit_price: string; quantity: string };
export type CountertopPricingInput = { materialUnitPrice: string; sqft: string; edgeUnitPrice?: string; edgeLinearFt?: string; sinkPrice?: string; services?: CountertopCharge[] };
export type CountertopPricing = { material_subtotal: string; edge_subtotal: string; sink_subtotal: string; services_subtotal: string; subtotal: string };

const money = { precision: 18, scale: 4, min: 0, allowNull: false } as const;

function scaled(value: string, scale = 4) {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(`${integer.replace(/^\+/, "")}${fraction.padEnd(scale, "0").slice(0, scale)}`);
}

function formatScaled(value: bigint, scale = 4) {
  const negative = value < BigInt(0);
  const magnitude = (negative ? -value : value).toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${magnitude.slice(0, -scale)}.${magnitude.slice(-scale)}`;
}

function multiply(a: string, b: string) {
  const product = scaled(a) * scaled(b);
  const divisor = BigInt(10000);
  let result = product / divisor;
  if ((product % divisor) * BigInt(2) >= divisor) result += product < BigInt(0) ? BigInt(-1) : BigInt(1);
  return formatScaled(result);
}

export function calculateCountertopPrice(input: CountertopPricingInput): CountertopPricing {
  const values = [input.materialUnitPrice, input.sqft, input.edgeUnitPrice ?? "0", input.edgeLinearFt ?? "0", input.sinkPrice ?? "0"];
  for (const value of values) { const parsed = parseDbDecimal(value, money); if (parsed.error || parsed.value === null) throw new Error(parsed.error ?? "Invalid countertop amount."); }
  if (scaled(input.sqft) <= BigInt(0)) throw new Error("Square footage must be greater than zero.");
  if (scaled(input.edgeLinearFt ?? "0") < BigInt(0)) throw new Error("Edge linear feet cannot be negative.");
  const material = multiply(input.materialUnitPrice, input.sqft);
  const edge = multiply(input.edgeUnitPrice ?? "0", input.edgeLinearFt ?? "0");
  const sink = input.sinkPrice ?? "0";
  const services = (input.services ?? []).reduce((sum, service) => {
    const price = parseDbDecimal(service.unit_price, money); const quantity = parseDbDecimal(service.quantity, money);
    if (price.error || quantity.error || price.value === null || quantity.value === null) throw new Error("Invalid service amount.");
    return formatScaled(scaled(sum) + scaled(multiply(service.unit_price, service.quantity)));
  }, "0.0000");
  const subtotal = formatScaled(scaled(material) + scaled(edge) + scaled(sink) + scaled(services));
  return { material_subtotal: material, edge_subtotal: edge, sink_subtotal: sink, services_subtotal: services, subtotal };
}
