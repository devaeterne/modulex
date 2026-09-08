import { redirect } from "next/navigation";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalProjectList from "@/components/portal/PortalProjectList";
import { getPortalProjects } from "@/lib/portal/projects";

const PAGE_SIZE = 25;

type ProjectsSearchParams = Promise<{ page?: string | string[] }>;

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function DealerProjectsPage({ searchParams }: { searchParams: ProjectsSearchParams }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const pageData = await getPortalProjects(PAGE_SIZE, offset);

  if (page > 1 && pageData.totalCount > 0 && offset >= pageData.totalCount) {
    const lastPage = Math.max(1, Math.ceil(pageData.totalCount / PAGE_SIZE));
    redirect(lastPage === 1 ? "/dealer/projects" : `/dealer/projects?page=${lastPage}`);
  }

  return (
    <>
      <PortalPageHeader
        eyebrow="Dealer Portal"
        title="Projects"
        description="See your Oakwell projects and navigate their linked orders, deliveries, installations, and approved documents."
      />
      <PortalProjectList
        projects={pageData.projects}
        basePath="/dealer/projects"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={pageData.totalCount}
      />
    </>
  );
}
