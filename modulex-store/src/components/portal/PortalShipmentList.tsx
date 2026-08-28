import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalShipmentSummary } from "@/lib/portal/fulfillment";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export default function PortalShipmentList({ shipments, basePath }: { shipments: PortalShipmentSummary[]; basePath: string }) {
  if (!shipments.length) return <PortalEmptyState title="No shipments yet" description="Shipment activity for your Oakwell orders will appear here." />;

  return (
    <div className="portal-panel portal-table-wrap">
      <div className="table-responsive">
        <table className="table portal-table align-middle mb-0">
          <thead><tr><th>Shipment</th><th>Order</th><th>Status</th><th>Carrier</th><th>Tracking</th><th>Shipped</th><th>Delivered</th></tr></thead>
          <tbody>
            {shipments.map((shipment) => (
              <tr key={shipment.id}>
                <td><Link className="portal-link" href={`${basePath}/${shipment.id}`}>{shipment.shipment_number}</Link></td>
                <td>{shipment.order_number}</td>
                <td><PortalStatusBadge status={shipment.status} /></td>
                <td>{[shipment.carrier, shipment.service_level].filter(Boolean).join(" · ") || "—"}</td>
                <td>{shipment.tracking_number || "—"}</td>
                <td>{formatDate(shipment.shipped_at)}</td>
                <td>{formatDate(shipment.delivered_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
