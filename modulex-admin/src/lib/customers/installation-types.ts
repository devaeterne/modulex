export type CustomerInstallationStatus = "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled";

export type CustomerInstallation = {
  id: string;
  installation_number: string;
  customer_id: string;
  order_id: string;
  shipment_id: string | null;
  status: CustomerInstallationStatus;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  address_snapshot: Record<string, unknown> | null;
  assigned_to: string | null;
  team_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  internal_notes: string | null;
  completion_notes: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};
