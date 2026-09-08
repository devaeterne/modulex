import { requireStorePortalContext } from "@/lib/portal/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PortalProjectSummary = {
  id: string;
  project_number: string;
  name: string;
  status: string;
  project_address: Record<string, unknown> | null;
  start_date: string | null;
  target_date: string | null;
  planned_delivery_date: string | null;
  order_count: number;
  shipment_count: number;
  installation_count: number;
};

export type PortalProjectOrder = {
  id: string;
  order_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  customer_reference: string | null;
  item_count: number;
  fulfillment_type: string;
};

export type PortalProjectShipment = {
  id: string;
  shipment_number: string;
  order_id: string;
  order_number: string;
  status: string;
  customer_reference: string | null;
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
};

export type PortalProjectInstallation = {
  id: string;
  installation_number: string;
  order_id: string;
  order_number: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  completed_at: string | null;
};

export type PortalProjectDetail = Omit<PortalProjectSummary, "order_count" | "shipment_count" | "installation_count"> & {
  orders: PortalProjectOrder[];
  shipments: PortalProjectShipment[];
  installations: PortalProjectInstallation[];
};

export type PortalProjectPage = {
  projects: PortalProjectSummary[];
  totalCount: number;
  limit: number;
  offset: number;
};

type ProjectsResponse = {
  ok?: boolean;
  projects?: PortalProjectSummary[];
  total_count?: number;
  limit?: number;
  offset?: number;
};
type ProjectResponse = { ok?: boolean; project?: PortalProjectDetail };

const POSTGRES_INTEGER_MAX = 2_147_483_647;

async function createAuthorizedPortalClient() {
  await requireStorePortalContext();
  return createServerSupabaseClient();
}

function nonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

export async function getPortalProjects(limit = 25, offset = 0): Promise<PortalProjectPage> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 25, 100));
  const safeOffset = Math.min(POSTGRES_INTEGER_MAX, Math.max(0, Math.trunc(offset) || 0));
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_projects", {
    p_limit: safeLimit,
    p_offset: safeOffset,
  });
  if (error) throw new Error("Unable to load projects.");

  const response = data as ProjectsResponse | null;
  if (!response?.ok || !Array.isArray(response.projects)) {
    return { projects: [], totalCount: 0, limit: safeLimit, offset: safeOffset };
  }

  return {
    projects: response.projects,
    totalCount: nonNegativeInteger(response.total_count, response.projects.length),
    limit: nonNegativeInteger(response.limit, safeLimit),
    offset: nonNegativeInteger(response.offset, safeOffset),
  };
}

export async function getPortalProject(projectId: string): Promise<PortalProjectDetail | null> {
  const supabase = await createAuthorizedPortalClient();
  const { data, error } = await supabase.rpc("get_store_portal_project", { p_project_id: projectId });
  if (error) throw new Error("Unable to load project.");
  const response = data as ProjectResponse | null;
  if (!response?.ok || !response.project) return null;
  return response.project;
}
