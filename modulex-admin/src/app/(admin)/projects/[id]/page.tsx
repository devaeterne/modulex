import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProjectDetailWorkspace from "@/components/customers/ProjectDetailWorkspace";

export const metadata: Metadata = {
  title: "Project | Modulex Admin",
  description: "Review a customer Project and its related Orders",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Project Detail" />
      <ProjectDetailWorkspace projectId={id} />
    </div>
  );
}
