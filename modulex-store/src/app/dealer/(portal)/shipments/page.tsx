import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalShipmentList from "@/components/portal/PortalShipmentList";
import { getPortalShipments } from "@/lib/portal/fulfillment";

export default async function DealerShipmentsPage() {
  const shipments = await getPortalShipments();
  return <><PortalPageHeader eyebrow="Dealer Portal" title="Shipments" description="Track deliveries associated with your Oakwell dealer orders." /><PortalShipmentList shipments={shipments} basePath="/dealer/shipments" /></>;
}
