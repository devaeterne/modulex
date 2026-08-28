import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalInstallationSummary } from "@/lib/portal/fulfillment";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PortalInstallationList({ installations, basePath }: { installations: PortalInstallationSummary[]; basePath: string }) {
  if (!installations.length) return <PortalEmptyState title="No installations yet" description="Scheduled Oakwell installation activity will appear here." />;

  return (
    <div className="portal-panel portal-table-wrap">
      <div className="table-responsive">
        <table className="table portal-table align-middle mb-0">
          <thead><tr><th>Installation</th><th>Order</th><th>Status</th><th>Scheduled</th><th>Team</th><th>Contact</th></tr></thead>
          <tbody>
            {installations.map((installation) => (
              <tr key={installation.id}>
                <td><Link className="portal-link" href={`${basePath}/${installation.id}`}>{installation.installation_number}</Link></td>
                <td>{installation.order_number}</td>
                <td><PortalStatusBadge status={installation.status} /></td>
                <td>{formatDateTime(installation.scheduled_start_at)}</td>
                <td>{installation.team_name || "—"}</td>
                <td>{installation.contact_name || installation.contact_phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
