import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalOrderSummary } from "@/lib/portal/orders";

export default function PortalOrderList({ orders, basePath }: { orders: PortalOrderSummary[]; basePath: string }) {
  if (!orders.length) {
    return <PortalEmptyState title="No orders yet" description="Orders associated with this Oakwell account will appear here." />;
  }

  return (
    <div className="portal-panel portal-table-wrap">
      <div className="table-responsive">
        <table className="table portal-table align-middle mb-0">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Date</th>
              <th>Expected</th>
              <th>Reference</th>
              <th>Items</th>
              <th>Fulfillment</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td><Link className="portal-link" href={`${basePath}/${order.id}`}>{order.order_number}</Link></td>
                <td><PortalStatusBadge status={order.status} /></td>
                <td>{order.order_date}</td>
                <td>{order.expected_delivery_date || "—"}</td>
                <td>{order.customer_reference || "—"}</td>
                <td>{order.item_count}</td>
                <td className="text-capitalize">{order.fulfillment_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
