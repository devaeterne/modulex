import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalProjectList from "@/components/portal/PortalProjectList";
import { getPortalProjects } from "@/lib/portal/projects";

export default async function DealerProjectsPage() {
  const projects = await getPortalProjects();

  return (
    <>
      <PortalPageHeader
        eyebrow="Dealer Portal"
        title="Projects"
        description="See your Oakwell projects and navigate their linked orders, deliveries, installations, and approved documents."
      />
      <PortalProjectList projects={projects} basePath="/dealer/projects" />
    </>
  );
}
