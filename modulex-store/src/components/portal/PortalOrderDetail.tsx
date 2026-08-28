import type { PortalOrderDetail as PortalOrderDetailType } from "@/lib/portal/orders";

export default function PortalOrderDetail({ order }: { order: PortalOrderDetailType }) {
  return (
    <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm">
      <div className="d-flex flex-wrap justify-content-between gap-3 mb-4">
        <div>
          <p className="text-uppercase small fw-semibold text-secondary mb-2">Order</p>
          <h1 className="h3 mb-1">{order.order_number}</h1>
          <div className="text-secondary small">{order.status}</div>
        </div>
        <div className="text-end small text-secondary">
          <div>Order date: {order.order_date}</div>
          <div>Expected: {order.expected_delivery_date || "—"}</div>
        </div>
      </div>

      <dl className="row mb-4">
        <dt className="col-sm-4">Customer reference</dt><dd className="col-sm-8">{order.customer_reference || "—"}</dd>
        <dt className="col-sm-4">Fulfillment</dt><dd className="col-sm-8 text-capitalize">{order.fulfillment_type}</dd>
        <dt className="col-sm-4">Items</dt><dd className="col-sm-8">{order.item_count}</dd>
      </dl>

      <div className="table-responsive">
        <table className="table align-middle mb-0">
          <thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Quantity</th></tr></thead>
          <tbody>{order.items.map((item) => <tr key={item.id}><td>{item.line_no}</td><td>{item.sku_snapshot}</td><td>{item.product_name_snapshot}</td><td>{item.quantity}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
