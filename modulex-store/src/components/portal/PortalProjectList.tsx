import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalProjectSummary } from "@/lib/portal/projects";

export default function PortalProjectList({
  projects,
  basePath,
  page,
  pageSize,
  totalCount,
}: {
  projects: PortalProjectSummary[];
  basePath: string;
  page: number;
  pageSize: number;
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  const pageHref = (targetPage: number) => targetPage <= 1 ? basePath : `${basePath}?page=${targetPage}`;

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

      <nav className="d-flex align-items-center justify-content-between gap-3 px-3 py-3" aria-label="Project pagination">
        {hasPrevious ? (
          <Link className="portal-link" href={pageHref(page - 1)}>Previous</Link>
        ) : (
          <span aria-disabled="true">Previous</span>
        )}
        <span className="portal-muted">Page {page} of {totalPages} · {totalCount} projects</span>
        {hasNext ? (
          <Link className="portal-link" href={pageHref(page + 1)}>Next</Link>
        ) : (
          <span aria-disabled="true">Next</span>
        )}
      </nav>
    </div>
  );
}
