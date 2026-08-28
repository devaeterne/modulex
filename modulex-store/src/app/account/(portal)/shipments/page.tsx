import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalShipmentList from "@/components/portal/PortalShipmentList";
import { getPortalShipments } from "@/lib/portal/fulfillment";

export default async function AccountShipmentsPage() {
  const shipments = await getPortalShipments();
  return <><PortalPageHeader eyebrow="Customer Portal" title="Shipments" description="Track deliveries associated with your Oakwell orders." /><PortalShipmentList shipments={shipments} basePath="/account/shipments" /></>;
}
