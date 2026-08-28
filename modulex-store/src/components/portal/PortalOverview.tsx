import Link from "next/link";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalDashboardSummary } from "@/lib/portal/fulfillment";

type Kind = "customer" | "dealer";

type RecentRecord = Record<string, unknown>;

function text(record: RecentRecord, key: string) {
  return typeof record[key] === "string" ? record[key] as string : "";
}

export default function PortalOverview({ kind, summary }: { kind: Kind; summary: PortalDashboardSummary }) {
  const root = kind === "dealer" ? "/dealer" : "/account";
  const label = kind === "dealer" ? "Dealer Portal" : "Customer Portal";
  const title = kind === "dealer" ? "Dealer dashboard" : "Account overview";

  return (
    <div>
      <PortalPageHeader
        eyebrow={label}
        title={title}
        description="Track your Oakwell orders, shipments, and installation activity in one place."
      />

      <div className="portal-overview-grid">
        <section className="portal-panel portal-summary-card">
          <div><p className="portal-kicker">Orders</p><div className="portal-summary-card__metric">{summary.orders.open_count}</div><span className="portal-muted">Open orders</span></div>
          <ul className="portal-summary-card__list">
            {summary.orders.recent.slice(0, 4).map((order) => {
              const id = text(order, "id");
              const number = text(order, "order_number");
              const status = text(order, "status");
              return <li key={id}><Link className="portal-link" href={`${root}/orders/${id}`}>{number}</Link>{status ? <PortalStatusBadge status={status} /> : null}</li>;
            })}
          </ul>
          <Link className="portal-link" href={`${root}/orders`}>View all orders</Link>
        </section>

        <section className="portal-panel portal-summary-card">
          <div><p className="portal-kicker">Shipments</p><div className="portal-summary-card__metric">{summary.shipments.active_count}</div><span className="portal-muted">Active shipments</span></div>
          <ul className="portal-summary-card__list">
            {summary.shipments.recent.slice(0, 4).map((shipment) => <li key={shipment.id}><Link className="portal-link" href={`${root}/shipments/${shipment.id}`}>{shipment.shipment_number}</Link><PortalStatusBadge status={shipment.status} /></li>)}
          </ul>
          <Link className="portal-link" href={`${root}/shipments`}>View all shipments</Link>
        </section>

        <section className="portal-panel portal-summary-card">
          <div><p className="portal-kicker">Installations</p><div className="portal-summary-card__metric">{summary.installations.active_count}</div><span className="portal-muted">Active installations</span></div>
          <ul className="portal-summary-card__list">
            {summary.installations.recent.slice(0, 4).map((installation) => <li key={installation.id}><Link className="portal-link" href={`${root}/installations/${installation.id}`}>{installation.installation_number}</Link><PortalStatusBadge status={installation.status} /></li>)}
          </ul>
          <Link className="portal-link" href={`${root}/installations`}>View all installations</Link>
        </section>
      </div>
    </div>
  );
}
