import { notFound } from "next/navigation";
import PortalOrderDetail from "@/components/portal/PortalOrderDetail";
import { getPortalOrder } from "@/lib/portal/orders";

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getPortalOrder(id);
  if (!order) notFound();
  return <PortalOrderDetail order={order} />;
}
