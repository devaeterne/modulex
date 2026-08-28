import PortalInstallationList from "@/components/portal/PortalInstallationList";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getPortalInstallations } from "@/lib/portal/fulfillment";

export default async function DealerInstallationsPage() {
  const installations = await getPortalInstallations();
  return <><PortalPageHeader eyebrow="Dealer Portal" title="Installations" description="Review installation activity for your Oakwell dealer orders." /><PortalInstallationList installations={installations} basePath="/dealer/installations" /></>;
}
