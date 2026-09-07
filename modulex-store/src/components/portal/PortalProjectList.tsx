import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalProjectSummary } from "@/lib/portal/projects";

export default function PortalProjectList({
  projects,
  basePath,
}: {
  projects: PortalProjectSummary[];
  basePath: string;
}) {
  if (!projects.length) {
    return (
      <PortalEmptyState
        title="No projects yet"
        description="Projects associated with this Oakwell account will appear here."
      />
    );
  }

  return (
    <div className="portal-panel portal-table-wrap">
      <div className="table-responsive">
        <table className="table portal-table align-middle mb-0">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Target</th>
              <th>Orders</th>
              <th>Shipments</th>
              <th>Installations</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link className="portal-link" href={`${basePath}/${project.id}`}>
                    {project.project_number} · {project.name}
                  </Link>
                </td>
                <td><PortalStatusBadge status={project.status} /></td>
                <td>{project.target_date || project.planned_delivery_date || "—"}</td>
                <td>{project.order_count}</td>
                <td>{project.shipment_count}</td>
                <td>{project.installation_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
