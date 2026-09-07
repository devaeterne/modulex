import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalProjectDetail as PortalProjectDetailModel } from "@/lib/portal/projects";

function sectionTitle(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function PortalProjectDetail({
  project,
  kind,
}: {
  project: PortalProjectDetailModel;
  kind: "customer" | "dealer";
}) {
  const root = kind === "dealer" ? "/dealer" : "/account";

  return (
    <>
      <PortalPageHeader
        eyebrow={`${kind === "dealer" ? "Dealer" : "Customer"} Portal · ${project.project_number}`}
        title={project.name}
        description="Project-level progress derived from your Oakwell orders, deliveries, and installations."
        actions={<PortalStatusBadge status={project.status} />}
      />

      <div className="portal-grid portal-grid--3 mb-4">
        <div className="portal-panel">
          <p className="portal-kicker">Start</p>
          <strong>{project.start_date || "—"}</strong>
        </div>
        <div className="portal-panel">
          <p className="portal-kicker">Target</p>
          <strong>{project.target_date || "—"}</strong>
        </div>
        <div className="portal-panel">
          <p className="portal-kicker">Planned delivery</p>
          <strong>{project.planned_delivery_date || "—"}</strong>
        </div>
      </div>

      <section className="portal-panel mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <p className="portal-kicker mb-1">Orders</p>
            <h2 className="h5 mb-0">{sectionTitle(project.orders.length, "order")}</h2>
          </div>
          <Link className="portal-link" href={`${root}/orders`}>View all orders</Link>
        </div>
        {project.orders.length ? (
          <div className="d-grid gap-2">
            {project.orders.map((order) => (
              <Link key={order.id} className="portal-list-link" href={`${root}/orders/${order.id}`}>
                <span>{order.order_number}</span>
                <PortalStatusBadge status={order.status} />
              </Link>
            ))}
          </div>
        ) : (
          <PortalEmptyState title="No linked orders" description="Orders linked to this project will appear here." />
        )}
      </section>

      <section className="portal-panel mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <p className="portal-kicker mb-1">Delivery / Shipments</p>
            <h2 className="h5 mb-0">{sectionTitle(project.shipments.length, "shipment")}</h2>
          </div>
          <Link className="portal-link" href={`${root}/shipments`}>View all shipments</Link>
        </div>
        {project.shipments.length ? (
          <div className="d-grid gap-2">
            {project.shipments.map((shipment) => (
              <Link key={shipment.id} className="portal-list-link" href={`${root}/shipments/${shipment.id}`}>
                <span>{shipment.shipment_number} · {shipment.order_number}</span>
                <PortalStatusBadge status={shipment.status} />
              </Link>
            ))}
          </div>
        ) : (
          <PortalEmptyState title="No linked shipments" description="Project deliveries will appear when shipment records are created." />
        )}
      </section>

      <section className="portal-panel mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <p className="portal-kicker mb-1">Installations</p>
            <h2 className="h5 mb-0">{sectionTitle(project.installations.length, "installation")}</h2>
          </div>
          <Link className="portal-link" href={`${root}/installations`}>View all installations</Link>
        </div>
        {project.installations.length ? (
          <div className="d-grid gap-2">
            {project.installations.map((installation) => (
              <Link key={installation.id} className="portal-list-link" href={`${root}/installations/${installation.id}`}>
                <span>{installation.installation_number} · {installation.order_number}</span>
                <PortalStatusBadge status={installation.status} />
              </Link>
            ))}
          </div>
        ) : (
          <PortalEmptyState title="No linked installations" description="Project installation appointments will appear here." />
        )}
      </section>

      {kind === "dealer" ? (
        <section className="portal-panel">
          <p className="portal-kicker mb-1">Documents</p>
          <h2 className="h5">Approved account documents</h2>
          <p className="portal-muted">Documents remain governed by the existing Dealer Portal visibility controls.</p>
          <Link className="portal-link" href="/dealer/documents">Open Documents</Link>
        </section>
      ) : null}
    </>
  );
}
