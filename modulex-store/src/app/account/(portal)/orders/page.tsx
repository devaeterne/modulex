import PortalOrderList from "@/components/portal/PortalOrderList";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getPortalOrders } from "@/lib/portal/orders";

export default async function AccountOrdersPage() {
  const orders = await getPortalOrders();

  return (
    <>
      <PortalPageHeader
        eyebrow="Customer Portal"
        title="Orders"
        description="Review your Oakwell orders and track their current status."
      />
      <PortalOrderList orders={orders} basePath="/account/orders" />
    </>
  );
}
