import PortalInstallationList from "@/components/portal/PortalInstallationList";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getPortalInstallations } from "@/lib/portal/fulfillment";

export default async function AccountInstallationsPage() {
  const installations = await getPortalInstallations();
  return <><PortalPageHeader eyebrow="Customer Portal" title="Installations" description="Review scheduled and completed Oakwell installation activity." /><PortalInstallationList installations={installations} basePath="/account/installations" /></>;
}
