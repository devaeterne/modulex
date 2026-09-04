import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { ProjectCommissionEventType, ProjectCommissionStatus } from "@/lib/customers/project-participants-commission-domain";

export type ProjectCommissionEventRow = {
  eventId: string;
  eventType: ProjectCommissionEventType;
  statusAfter: ProjectCommissionStatus;
  amountDelta: number;
  reason: string | null;
  reversesEventId: string | null;
  isReversed: boolean;
  createdAt: string;
};

type RawCommissionEvent = {
  event_id?: string | null;
  event_type?: string | null;
  status_after?: string | null;
  amount_delta?: number | string | null;
  reason?: string | null;
  reverses_event_id?: string | null;
  is_reversed?: boolean | null;
  created_at?: string | null;
};

async function requireCommissionView() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !profile.roles.some((role) => ["super_admin", "admin", "finance"].includes(role))) {
    throw new Error("You do not have permission to view Project commission events.");
  }
}

export async function getCustomerProjectCommissionEvents(obligationId: string): Promise<ProjectCommissionEventRow[]> {
  await requireCommissionView();
  if (!obligationId) return [];
  const { data, error } = await supabase.rpc("get_customer_project_commission_events", {
    p_obligation_id: obligationId,
  });
  if (error) throw error;
  return ((data ?? []) as RawCommissionEvent[]).map((row) => ({
    eventId: row.event_id ?? "",
    eventType: (row.event_type ?? "earned") as ProjectCommissionEventType,
    statusAfter: (row.status_after ?? "pending") as ProjectCommissionStatus,
    amountDelta: Number(row.amount_delta ?? 0),
    reason: row.reason ?? null,
    reversesEventId: row.reverses_event_id ?? null,
    isReversed: Boolean(row.is_reversed),
    createdAt: row.created_at ?? "",
  }));
}
