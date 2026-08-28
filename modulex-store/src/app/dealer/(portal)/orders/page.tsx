import PortalOrderList from "@/components/portal/PortalOrderList";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getPortalOrders } from "@/lib/portal/orders";

export default async function DealerOrdersPage() {
  const orders = await getPortalOrders();

  return (
    <>
      <PortalPageHeader
        eyebrow="Dealer Portal"
        title="Orders"
        description="Review your Oakwell dealer orders and track their current status."
      />
      <PortalOrderList orders={orders} basePath="/dealer/orders" />
    </>
  );
}
