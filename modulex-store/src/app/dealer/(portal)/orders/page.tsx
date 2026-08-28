import PortalOrderList from "@/components/portal/PortalOrderList";
import { getPortalOrders } from "@/lib/portal/orders";

export default async function DealerOrdersPage() {
  const orders = await getPortalOrders();
  return <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm"><h1 className="h3 mb-4">Orders</h1><PortalOrderList orders={orders} basePath="/dealer/orders" /></div>;
}
