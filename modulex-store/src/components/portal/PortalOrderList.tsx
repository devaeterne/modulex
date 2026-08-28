import Link from "next/link";
import type { PortalOrderSummary } from "@/lib/portal/orders";

export default function PortalOrderList({ orders, basePath }: { orders: PortalOrderSummary[]; basePath: string }) {
  if (!orders.length) return <p className="text-secondary mb-0">No orders are available yet.</p>;

  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0">
        <thead><tr><th>Order</th><th>Status</th><th>Date</th><th>Expected</th><th>Reference</th><th>Items</th><th>Fulfillment</th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td><Link href={`${basePath}/${order.id}`}>{order.order_number}</Link></td>
              <td>{order.status}</td>
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
  );
}
