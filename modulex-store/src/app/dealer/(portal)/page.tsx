import Link from "next/link";
import { getPortalOrders } from "@/lib/portal/orders";

export default async function DealerPortalPage() {
  const recentOrders = await getPortalOrders(5, 0);
  return (
    <div className="row g-4">
      <div className="col-12">
        <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm">
          <p className="text-uppercase small fw-semibold text-secondary mb-2">Dealer Portal</p>
          <h1 className="h2 mb-3">Dealer dashboard</h1>
          <p className="text-secondary mb-0">View orders associated with your dealer account. Pricing remains outside this release.</p>
        </div>
      </div>
      <div className="col-12">
        <div className="border rounded-4 bg-white p-4 shadow-sm">
          <div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 mb-0">Recent orders</h2><Link href="/dealer/orders" className="small">View all</Link></div>
          {recentOrders.length ? <ul className="list-group list-group-flush">{recentOrders.map((order)=><li key={order.id} className="list-group-item px-0 d-flex justify-content-between gap-3"><Link href={`/dealer/orders/${order.id}`}>{order.order_number}</Link><span className="text-secondary small">{order.status}</span></li>)}</ul> : <p className="text-secondary mb-0">No orders are available yet.</p>}
        </div>
      </div>
    </div>
  );
}
