import { notFound } from "next/navigation";
import PortalOrderDetail from "@/components/portal/PortalOrderDetail";
import { getDealerOrder } from "@/lib/portal/dealer";

export default async function DealerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getDealerOrder(id);
  if (!order) notFound();
  return <PortalOrderDetail kind="dealer" order={order} />;
}
