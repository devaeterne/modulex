import PortalOverview from "@/components/portal/PortalOverview";
import { getPortalDashboardSummary } from "@/lib/portal/fulfillment";

export default async function DealerPortalPage() {
  const summary = await getPortalDashboardSummary();
  return <PortalOverview kind="dealer" summary={summary} />;
}
