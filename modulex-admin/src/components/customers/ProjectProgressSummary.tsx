"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  loadProjectProgress,
  type ProjectProgressData,
} from "@/lib/customers/project-progress";
import type { CustomerProject, ProjectStatus } from "@/lib/customers/project-domain";

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";
type ProjectActivityActor = { full_name: string | null; email: string | null };

export type ProjectProgressLifecycleEntry = {
  id: string;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus;
  note: string | null;
  changed_by: string | null;
  created_at: string;
  actor: ProjectActivityActor | ProjectActivityActor[] | null;
};

const PROJECT_LIFECYCLE: ProjectStatus[] = ["draft", "quoted", "approved", "ordered", "in_progress", "completed"];

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function progressColor(completed: number, total: number): BadgeColor {
  if (total > 0 && completed >= total) return "success";
  if (completed > 0) return "info";
  return "light";
}

export default function ProjectProgressSummary({
  project,
  projectActivity,
}: {
  project: CustomerProject;
  projectActivity: ProjectProgressLifecycleEntry[];
}) {
  const [data, setData] = useState<ProjectProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await loadProjectProgress(project));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project progress could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [project]);

  const attainedStatuses = useMemo(() => {
    const statuses = new Set<ProjectStatus>([project.status]);
    for (const entry of projectActivity) {
      if (entry.from_status) statuses.add(entry.from_status);
      statuses.add(entry.to_status);
    }
    return statuses;
  }, [project.status, projectActivity]);

  return (
    <ComponentCard
      title="Project Progress"
      desc="Read-only rollup from canonical Project, Order and Invoice records."
    >
      {error ? (
        <div className="space-y-3" role="alert">
          <Alert variant="error" title="Project progress unavailable" message={error} />
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button>
        </div>
      ) : null}

      {loading && !data ? <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`} role="status">Loading Project progress…</p> : null}

      {data ? (
        <div className="space-y-5">
          <section aria-labelledby="project-progress-lifecycle" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="project-progress-lifecycle" className={`text-sm font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Lifecycle</p>
              {project.status === "cancelled" ? <Badge color="error">Cancelled</Badge> : <Badge color="primary">{statusLabel(project.status)}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Project lifecycle">
              {PROJECT_LIFECYCLE.map((status, index) => {
                const isCurrent = project.status === status;
                const isDone = attainedStatuses.has(status) && !isCurrent;
                const stateLabel = isCurrent ? "Current" : isDone ? "Done" : "Pending";
                const color: BadgeColor = isCurrent
                  ? (status === "completed" ? "success" : "primary")
                  : isDone
                    ? "success"
                    : "light";
                return (
                  <div key={status} className="flex items-center gap-2" role="listitem">
                    <Badge color={color}>{statusLabel(status)} · {stateLabel}</Badge>
                    {index < PROJECT_LIFECYCLE.length - 1 ? <span className={ADMIN_TEXT_STYLES.muted} aria-hidden="true">→</span> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <section aria-labelledby="project-progress-orders" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p id="project-progress-orders" className={`text-sm font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Orders</p>
                <Badge color={progressColor(data.orders.confirmedOrLater, data.orders.active)}>{data.orders.confirmedOrLater} / {data.orders.active}</Badge>
              </div>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Confirmed or later</p>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{data.orders.active} active Order{data.orders.active === 1 ? "" : "s"}; cancelled Orders are excluded.</p>
            </section>

            <section aria-labelledby="project-progress-delivery" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p id="project-progress-delivery" className={`text-sm font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Delivery</p>
                <Badge color={progressColor(data.delivery.completed, data.delivery.total)}>{data.delivery.completed} / {data.delivery.total}</Badge>
              </div>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Delivery Orders complete</p>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Pickup Orders are excluded.</p>
            </section>

            <section aria-labelledby="project-progress-installation" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p id="project-progress-installation" className={`text-sm font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Installation</p>
                <Badge color={progressColor(data.installation.completed, data.installation.total)}>{data.installation.completed} / {data.installation.total}</Badge>
              </div>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Installation Orders complete</p>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Only Delivery + Installation Orders are counted.</p>
            </section>

            <section aria-labelledby="project-progress-commercial" className="space-y-2">
              <p id="project-progress-commercial" className={`text-sm font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Commercial</p>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Invoiced Orders</span>
                <Badge color={progressColor(data.commercial.invoicedOrders, data.commercial.activeOrders)}>{data.commercial.invoicedOrders} / {data.commercial.activeOrders}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Paid Invoices</span>
                <Badge color={progressColor(data.commercial.paidInvoices, data.commercial.invoices)}>{data.commercial.paidInvoices} / {data.commercial.invoices}</Badge>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </ComponentCard>
  );
}
