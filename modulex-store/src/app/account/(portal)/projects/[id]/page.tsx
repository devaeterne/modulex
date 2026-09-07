import { notFound } from "next/navigation";
import PortalProjectDetail from "@/components/portal/PortalProjectDetail";
import { getPortalProject } from "@/lib/portal/projects";

export default async function AccountProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getPortalProject(id);
  if (!project) notFound();
  return <PortalProjectDetail project={project} kind="customer" />;
}
