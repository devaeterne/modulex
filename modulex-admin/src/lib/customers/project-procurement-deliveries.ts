import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type ProjectProcurementDeliveryEvent = {
  id: string;
  deliveredDate: string;
  originalQuantity: number;
  correctedQuantity: number;
  effectiveQuantity: number;
  notes: string | null;
};

type RawDeliveryEvent = {
  id?: string | null;
  delivered_date?: string | null;
  original_quantity?: number | string | null;
  corrected_quantity?: number | string | null;
  effective_quantity?: number | string | null;
  notes?: string | null;
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadProjectProcurementDeliveryEvents(commitmentId: string): Promise<ProjectProcurementDeliveryEvent[]> {
  const { profile, error: profileError } = await getCurrentProfile();
  if (profileError) throw profileError;
  if (!profile || !hasPermission(profile.roles, "project_procurement.manage")) {
    throw new Error("You do not have permission to manage Project procurement delivery.");
  }

  const { data, error } = await supabase.rpc("get_customer_project_procurement_delivery_events", {
    p_commitment_id: commitmentId,
  });
  if (error) throw error;

  return ((data ?? []) as RawDeliveryEvent[]).map((row) => ({
    id: row.id ?? "",
    deliveredDate: row.delivered_date ?? "",
    originalQuantity: numberValue(row.original_quantity),
    correctedQuantity: numberValue(row.corrected_quantity),
    effectiveQuantity: numberValue(row.effective_quantity),
    notes: row.notes ?? null,
  }));
}
