import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalOrderDetail as PortalOrderDetailType } from "@/lib/portal/orders";
import type { DealerPortalOrderDetail } from "@/lib/portal/dealer";

type PortalOrderDetailProps =
  | { kind?: "customer"; order: PortalOrderDetailType }
  | { kind: "dealer"; order: DealerPortalOrderDetail };

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(value);
}

export default function PortalOrderDetail(props: PortalOrderDetailProps) {
  const { order } = props;
  const dealerOrder = props.kind === "dealer" ? props.order : null;
  const showPricing = Boolean(dealerOrder?.pricing_enabled && dealerOrder.currency_code);

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

      {showPricing && dealerOrder && dealerOrder.currency_code ? (
        <section className="portal-panel portal-order-commercial">
          <div className="portal-section-heading">
            <div><p className="portal-kicker">Dealer pricing</p><h2>Order amount</h2></div>
          </div>
          <dl className="portal-definition-grid">
            <div><dt>Subtotal</dt><dd>{typeof dealerOrder.subtotal === "number" ? formatCurrency(dealerOrder.subtotal, dealerOrder.currency_code) : "—"}</dd></div>
            <div><dt>Tax</dt><dd>{typeof dealerOrder.tax_amount === "number" ? formatCurrency(dealerOrder.tax_amount, dealerOrder.currency_code) : "—"}</dd></div>
            <div><dt>Total</dt><dd>{typeof dealerOrder.total_amount === "number" ? formatCurrency(dealerOrder.total_amount, dealerOrder.currency_code) : "—"}</dd></div>
          </dl>
        </section>
      ) : props.kind === "dealer" ? (
        <div className="portal-alert">Pricing is not available for this account. Contact sales for pricing.</div>
      ) : null}

      <section className="portal-panel portal-order-detail__items">
        <div className="portal-section-heading">
          <div>
            <p className="portal-kicker">Order items</p>
            <h2>Products in this order</h2>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table portal-table align-middle mb-0">
            <thead>
              <tr><th>Line</th><th>SKU</th><th>Product</th><th>Quantity</th>{showPricing ? <><th>Unit price</th><th>Line total</th></> : null}</tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const dealerItem = showPricing ? dealerOrder?.items.find((candidate) => candidate.id === item.id) : null;
                return (
                  <tr key={item.id}>
                    <td>{item.line_no}</td>
                    <td>{item.sku_snapshot}</td>
                    <td>{item.product_name_snapshot}</td>
                    <td>{item.quantity}</td>
                    {showPricing && dealerOrder?.currency_code ? <>
                      <td>{typeof dealerItem?.unit_price === "number" ? formatCurrency(dealerItem.unit_price, dealerOrder.currency_code) : "—"}</td>
                      <td>{typeof dealerItem?.line_total === "number" ? formatCurrency(dealerItem.line_total, dealerOrder.currency_code) : "—"}</td>
                    </> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
