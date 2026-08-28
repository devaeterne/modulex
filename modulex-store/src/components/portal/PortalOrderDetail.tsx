import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalOrderDetail as PortalOrderDetailType } from "@/lib/portal/orders";

export default function PortalOrderDetail({ order }: { order: PortalOrderDetailType }) {
  return (
    <div className="portal-order-detail">
      <PortalPageHeader
        eyebrow="Order"
        title={order.order_number}
        description={`Order date ${order.order_date} · Expected ${order.expected_delivery_date || "not scheduled"}`}
        actions={<PortalStatusBadge status={order.status} />}
      />

      <section className="portal-panel portal-order-detail__summary">
        <dl className="portal-definition-grid">
          <div><dt>Customer reference</dt><dd>{order.customer_reference || "—"}</dd></div>
          <div><dt>Fulfillment</dt><dd className="text-capitalize">{order.fulfillment_type}</dd></div>
          <div><dt>Items</dt><dd>{order.item_count}</dd></div>
        </dl>
      </section>

      <section className="portal-panel portal-order-detail__items">
        <div className="portal-section-heading">
          <div>
            <p className="portal-kicker">Order items</p>
            <h2>Products in this order</h2>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table portal-table align-middle mb-0">
            <thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Quantity</th></tr></thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.line_no}</td>
                  <td>{item.sku_snapshot}</td>
                  <td>{item.product_name_snapshot}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
