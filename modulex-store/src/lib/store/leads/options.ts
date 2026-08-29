import "server-only";

import { callPublicRpc } from "@/lib/supabase/public-rest";
import type { StoreLeadFormOption, StoreLeadFormOptionGroup } from "./types";

const groups = new Set<StoreLeadFormOptionGroup>(["project_type", "consultation_intent"]);

function isOption(value: unknown): value is StoreLeadFormOption {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return groups.has(item.option_group as StoreLeadFormOptionGroup)
    && typeof item.option_key === "string"
    && typeof item.label === "string"
    && typeof item.sort_order === "number";
}

export async function getStorePublicLeadFormOptions(): Promise<StoreLeadFormOption[]> {
  try {
    const data = await callPublicRpc<unknown>("get_store_public_lead_form_options", {}, { revalidate: 300 });
    return Array.isArray(data) ? data.filter(isOption) : [];
  } catch (error) {
    console.error("Unable to load Store lead form options", { error });
    return [];
  }
}
