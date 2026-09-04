import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { OrderFulfillmentType } from "@/lib/customers/types";

export type ProjectFulfillmentDeliveryState = "not_required" | "pending" | "in_progress" | "partial" | "delivered" | "customer_pickup" | "cancelled_history";
export type ProjectFulfillmentInstallationState = "not_required" | "not_scheduled" | "scheduled" | "in_progress" | "partial" | "completed" | "cancelled_history";
export type ProjectFulfillmentReadinessState = "pending" | "blocked" | "ready" | "cancelled_history";
export type ProjectProcurementBlockerState = "quantity_required" | "not_ordered" | "partially_ordered" | "not_delivered" | "partially_delivered";

export type ProjectFulfillmentShipment = {
  id: string;
  shipment_number: string;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

export type ProjectFulfillmentInstallation = {
  id: string;
  installation_number: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type ProjectFulfillmentOrder = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  fulfillment_type: OrderFulfillmentType;
  is_active: boolean;
  readiness_state: ProjectFulfillmentReadinessState;
  delivery_state: ProjectFulfillmentDeliveryState;
  delivered_at: string | null;
  installation_state: ProjectFulfillmentInstallationState;
  next_installation_at: string | null;
  installation_completed_at: string | null;
  blocker_count: number;
  blocker_states: ProjectProcurementBlockerState[];
  shipments: ProjectFulfillmentShipment[];
  installations: ProjectFulfillmentInstallation[];
};

export type ProjectFulfillmentSummary = {
  active_order_count: number;
  ready_order_count: number;
  pending_order_count: number;
  pickup_order_count: number;
  cancelled_order_count: number;
  procurement_blocker_count: number;
  delivery_required_count: number;
  delivery_state: Exclude<ProjectFulfillmentDeliveryState, "customer_pickup" | "cancelled_history">;
  installation_required_count: number;
  installation_state: Exclude<ProjectFulfillmentInstallationState, "cancelled_history">;
};

export type ProjectFulfillmentResult = {
  project_id: string;
  summary: ProjectFulfillmentSummary;
  orders: ProjectFulfillmentOrder[];
};

export async function getCustomerProjectFulfillment(projectId: string): Promise<ProjectFulfillmentResult> {
  const { profile, error: profileError } = await getCurrentProfile();
  if (profileError) throw profileError;
  if (!profile
    || !hasPermission(profile.roles, "projects.view")
    || !hasPermission(profile.roles, "shipments.view")
    || !hasPermission(profile.roles, "installations.view")) {
    throw new Error("You do not have permission to view Project fulfillment data.");
  }

  const { data, error } = await supabase.rpc("get_customer_project_fulfillment", { p_project_id: projectId });
  if (error) throw error;
  if (!data) throw new Error("Project fulfillment was not found.");
  return data as unknown as ProjectFulfillmentResult;
}
