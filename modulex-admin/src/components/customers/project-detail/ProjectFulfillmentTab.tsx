"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  getCustomerProjectFulfillment,
  type ProjectFulfillmentOrder,
  type ProjectFulfillmentResult,
} from "@/lib/customers/project-fulfillment-domain";

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function statusColor(value: string): BadgeColor {
  if (["ready", "delivered", "completed"].includes(value)) return "success";
  if (["partial", "in_progress", "scheduled", "customer_pickup"].includes(value)) return "info";
  if (["blocked", "pending", "not_scheduled", "not_delivered", "partially_delivered", "partially_ordered", "not_ordered", "quantity_required"].includes(value)) return "warning";
  if (["cancelled", "cancelled_history"].includes(value)) return "error";
  return "light";
}

function FulfillmentRows({ rows, emptyMessage }: { rows: ProjectFulfillmentOrder[]; emptyMessage: string }) {
  return (
    <TableViewport>
      <Table variant="admin" minWidth="wide">
        <TableHeader variant="admin">
          <TableRow>
            <TableCell isHeader variant="admin">Order</TableCell>
            <TableCell isHeader variant="admin">Fulfillment</TableCell>
            <TableCell isHeader variant="admin">Shipment / delivery</TableCell>
            <TableCell isHeader variant="admin">Expected</TableCell>
            <TableCell isHeader variant="admin">Delivered</TableCell>
            <TableCell isHeader variant="admin">Installation</TableCell>
            <TableCell isHeader variant="admin">Blocker</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody variant="admin">
          {rows.length === 0 ? <TableStateRow colSpan={7}>{emptyMessage}</TableStateRow> : null}
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell variant="admin">
                <div className="space-y-1">
                  <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.order_number}</p>
                  <Badge color={statusColor(row.readiness_state)}>{label(row.readiness_state)}</Badge>
                </div>
              </TableCell>
              <TableCell variant="admin">
                <div className="space-y-1">
                  <p>{row.fulfillment_type === "pickup" ? "Customer Pickup" : label(row.fulfillment_type)}</p>
                  <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{label(row.status)}</p>
                </div>
              </TableCell>
              <TableCell variant="admin">
                <div className="space-y-2">
                  <Badge color={statusColor(row.delivery_state)}>{label(row.delivery_state)}</Badge>
                  {row.shipments.length > 0 ? (
                    <div className={`space-y-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>
                      {row.shipments.map((shipment) => (
                        <p key={shipment.id}>{shipment.shipment_number} · {label(shipment.status)}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell variant="admin">{date(row.expected_date)}</TableCell>
              <TableCell variant="admin">{date(row.delivered_at)}</TableCell>
              <TableCell variant="admin">
                <div className="space-y-2">
                  <Badge color={statusColor(row.installation_state)}>{label(row.installation_state)}</Badge>
                  {row.installations.length > 0 ? (
                    <div className={`space-y-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>
                      {row.installations.map((installation) => (
                        <p key={installation.id}>{installation.installation_number} · {label(installation.status)} · {date(installation.scheduled_start_at)}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell variant="admin">
                {row.blocker_count > 0 ? (
                  <div className="space-y-1">
                    {Array.from(new Set(row.blocker_states)).map((blocker) => (
                      <Badge key={blocker} color="warning">{label(blocker)}</Badge>
                    ))}
                  </div>
                ) : <span className={ADMIN_TEXT_STYLES.muted}>—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableViewport>
  );
}

export default function ProjectFulfillmentTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectFulfillmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) throw profileError;
      const canView = Boolean(
        profile
        && hasPermission(profile.roles, "projects.view")
        && hasPermission(profile.roles, "shipments.view")
        && hasPermission(profile.roles, "installations.view")
      );
      setAuthorized(canView);
      if (!canView) {
        setData(null);
        return;
      }
      setData(await getCustomerProjectFulfillment(projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project fulfillment could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRows = useMemo(() => data?.orders.filter((row) => row.is_active) ?? [], [data]);
  const cancelledRows = useMemo(() => data?.orders.filter((row) => !row.is_active) ?? [], [data]);

  if (authorized === false) {
    return <Alert variant="warning" title="Fulfillment access restricted" message="Your role can view the Project but does not have Shipment and Installation visibility." />;
  }

  if (loading && !data) {
    return <ComponentCard title="Fulfillment" desc="Loading canonical Order, Shipment, Installation and Procurement progress."><p role="status">Loading fulfillment…</p></ComponentCard>;
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <Alert variant="error" title="Fulfillment could not be loaded" message={error || "No fulfillment projection was returned."} />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button>
      </div>
    );
  }

  const summary = data.summary;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ComponentCard title="Orders Ready" desc={`${summary.pending_order_count} pending · ${summary.pickup_order_count} Customer Pickup`}>
          <p className={`text-3xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary.ready_order_count}/{summary.active_order_count}</p>
        </ComponentCard>
        <ComponentCard title="Delivery status" desc={`${summary.delivery_required_count} delivery-required Orders`}>
          <Badge color={statusColor(summary.delivery_state)}>{label(summary.delivery_state)}</Badge>
        </ComponentCard>
        <ComponentCard title="Installation status" desc={`${summary.installation_required_count} installation-required Orders`}>
          <Badge color={statusColor(summary.installation_state)}>{label(summary.installation_state)}</Badge>
        </ComponentCard>
        <ComponentCard title="Procurement blockers" desc="Sales-safe operational blockers only; no vendor or cost detail.">
          <p className={`text-3xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary.procurement_blocker_count}</p>
        </ComponentCard>
      </div>

      <ComponentCard title="Fulfillment" desc="Project rollup from canonical Shipment, Delivery and Installation records. Multiple records stay separate; no Project fulfillment ledger is created.">
        <FulfillmentRows rows={activeRows} emptyMessage="No active Orders are linked to this Project." />
      </ComponentCard>

      <ComponentCard title="Cancelled history" desc="Cancelled Orders remain visible for history but are excluded from active readiness, delivery, installation and blocker counts.">
        <FulfillmentRows rows={cancelledRows} emptyMessage="No cancelled Orders are linked to this Project." />
      </ComponentCard>
    </div>
  );
}
