import { notFound } from "next/navigation";
import PortalInstallationDetail from "@/components/portal/PortalInstallationDetail";
import { getPortalInstallation } from "@/lib/portal/fulfillment";

export default async function AccountInstallationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const installation = await getPortalInstallation(id);
  if (!installation) notFound();
  return <PortalInstallationDetail installation={installation} />;
}
