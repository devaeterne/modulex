import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProjectsWorkspace from "@/components/customers/ProjectsWorkspace";

export const metadata: Metadata = {
  title: "Projects | Modulex Admin",
  description: "Manage customer projects, project ownership and related orders",
};

export default function ProjectsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Projects" />
      <ProjectsWorkspace />
    </div>
  );
}
