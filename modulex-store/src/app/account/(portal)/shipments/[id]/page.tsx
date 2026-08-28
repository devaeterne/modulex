import { notFound } from "next/navigation";
import PortalShipmentDetail from "@/components/portal/PortalShipmentDetail";
import { getPortalShipment } from "@/lib/portal/fulfillment";

export default async function AccountShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await getPortalShipment(id);
  if (!shipment) notFound();
  return <PortalShipmentDetail shipment={shipment} />;
}
