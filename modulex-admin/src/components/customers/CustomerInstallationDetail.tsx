"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { supabase } from "@/lib/supabase/client";
import type { CustomerInstallation, CustomerInstallationStatus } from "@/lib/customers/installation-types";

const INSTALLATION_STATUS_TRANSITIONS: Record<CustomerInstallationStatus, CustomerInstallationStatus[]> = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function nextInstallationStatuses(status: CustomerInstallationStatus) {
  return INSTALLATION_STATUS_TRANSITIONS[status] ?? [];
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusColor(status: CustomerInstallationStatus) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "error" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "confirmed") return "primary" as const;
  return "warning" as const;
}

export default function CustomerInstallationDetail() {
  const params = useParams<{ id: string; installationId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<CustomerInstallation | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("customer_installations")
      .select("*")
      .eq("id", params.installationId)
      .eq("customer_id", params.id)
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    const installation = data as CustomerInstallation;
    setItem(installation);
    setCompletionNotes(installation.completion_notes || "");
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [params.id, params.installationId]);

  async function updateStatus(status: CustomerInstallationStatus) {
    if (!item || !nextInstallationStatuses(item.status).includes(status)) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc("set_customer_installation_status", {
      p_installation_id: item.id,
      p_status: status,
      p_completion_notes: status === "completed" ? completionNotes.trim() || null : null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    void authenticatedFetch(`/api/admin/google-calendar/installations/${item.id}/sync`, { method: "POST" })
      .catch(() => undefined);

    await load();
    setSuccessMessage(`Installation moved to ${titleCase(status)}.`);
    setIsSaving(false);
  }

  if (isLoading) {
    return <ComponentCard title="Installation" desc="Loading appointment details."><p className="text-sm" role="status">Loading installation…</p></ComponentCard>;
  }

  if (!item) {
    return <Alert variant="error" title="Installation unavailable" message={errorMessage || "Installation not found."} />;
  }

  const address = item.address_snapshot as Record<string, string | null> | null;
  const nextStatuses = nextInstallationStatuses(item.status);
  const canComplete = nextStatuses.includes("completed");

  return (
    <div className="space-y-5">
      <ComponentCard
        title={item.installation_number}
        desc={`${dateTime(item.scheduled_start_at)}${item.scheduled_end_at ? ` → ${dateTime(item.scheduled_end_at)}` : ""}`}
        headerAction={<Badge color={statusColor(item.status)}>{titleCase(item.status)}</Badge>}
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${item.customer_id}/orders/${item.order_id}`)}>Open Order</Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/customers/installations")}>All Installations</Button>
        </div>
      </ComponentCard>

      {errorMessage ? <Alert variant="error" title="Installation action failed" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Installation updated" message={successMessage} /> : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ComponentCard title="Appointment" desc="Canonical Modulex installation schedule and assignment details.">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Status" value={titleCase(item.status)} />
              <Info label="Team" value={item.team_name} />
              <Info label="Contact" value={item.contact_name} />
              <Info label="Phone" value={item.contact_phone} />
              <Info label="Assigned User ID" value={item.assigned_to} />
              <Info label="Shipment ID" value={item.shipment_id} />
            </div>
            <div className="mt-5">
              <Info label="Address" value={address ? [address.address_line_1, address.address_line_2, address.postal_code, address.city, address.state_region, address.country_code].filter(Boolean).join(", ") : null} />
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Info label="Notes" value={item.notes} />
              <Info label="Internal Notes" value={item.internal_notes} />
            </div>
          </ComponentCard>
        </div>

        <ComponentCard title="Workflow" desc="Only valid next lifecycle actions are available; the database enforces the same transition policy.">
          <div className="space-y-4">
            {canComplete ? (
              <TextArea
                value={completionNotes}
                onChange={setCompletionNotes}
                rows={4}
                placeholder="Completion notes"
              />
            ) : null}

            {nextStatuses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === "cancelled" ? "danger" : "primary"}
                    onClick={() => void updateStatus(status)}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : status === "cancelled" ? "Cancel Installation" : `Mark ${titleCase(status)}`}
                  </Button>
                ))}
              </div>
            ) : (
              <Alert variant="info" title="Installation closed" message="No further lifecycle transitions are available." />
            )}

            <div className={`space-y-2 text-xs ${ADMIN_TEXT_STYLES.body}`}>
              <div>Confirmed: {dateTime(item.confirmed_at)}</div>
              <div>Started: {dateTime(item.started_at)}</div>
              <div>Completed: {dateTime(item.completed_at)}</div>
              <div>Cancelled: {dateTime(item.cancelled_at)}</div>
            </div>
          </div>
        </ComponentCard>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase">{label}</p>
      <p className={`mt-2 whitespace-pre-wrap text-sm ${ADMIN_TEXT_STYLES.body}`}>{value || "—"}</p>
    </div>
  );
}
