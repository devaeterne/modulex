import PortalOverview from "@/components/portal/PortalOverview";
import { getPortalDashboardSummary } from "@/lib/portal/fulfillment";

export default async function AccountPortalPage() {
  const summary = await getPortalDashboardSummary();
  return <PortalOverview kind="customer" summary={summary} />;
}
