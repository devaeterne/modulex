import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type ProjectCollectionState = "not_received" | "partially_received" | "received" | "overdue" | "cancelled";

export type ProjectPaymentStatusRequirement = {
  id: string;
  name: string;
  dueDate: string | null;
  status: ProjectCollectionState;
};

export type ProjectPaymentStatus = {
  projectId: string;
  overallStatus: Exclude<ProjectCollectionState, "cancelled">;
  requirements: ProjectPaymentStatusRequirement[];
};

type RawRequirement = {
  id?: string | null;
  name?: string | null;
  due_date?: string | null;
  status?: string | null;
};

type RawStatus = {
  project_id?: string | null;
  overall_status?: string | null;
  requirements?: RawRequirement[] | null;
};

export async function loadProjectPaymentStatus(projectId: string): Promise<ProjectPaymentStatus> {
  const { profile, error: profileError } = await getCurrentProfile();
  if (profileError) throw profileError;
  if (!profile || !hasPermission(profile.roles, "project_payments.view")) {
    throw new Error("You do not have permission to view Project collection status.");
  }

  const { data, error } = await supabase.rpc("get_customer_project_payment_status", {
    p_project_id: projectId,
  });
  if (error) throw error;

  const raw = (data ?? {}) as RawStatus;
  return {
    projectId: raw.project_id ?? projectId,
    overallStatus: (raw.overall_status ?? "not_received") as ProjectPaymentStatus["overallStatus"],
    requirements: (raw.requirements ?? []).map((row) => ({
      id: row.id ?? "",
      name: row.name ?? "Payment requirement",
      dueDate: row.due_date ?? null,
      status: (row.status ?? "not_received") as ProjectCollectionState,
    })),
  };
}
