import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalProjectList from "@/components/portal/PortalProjectList";
import { getPortalProjects } from "@/lib/portal/projects";

export default async function AccountProjectsPage() {
  const projects = await getPortalProjects();

  return (
    <>
      <PortalPageHeader
        eyebrow="Customer Portal"
        title="Projects"
        description="See your Oakwell projects and navigate their linked orders, deliveries, and installations."
      />
      <PortalProjectList projects={projects} basePath="/account/projects" />
    </>
  );
}
