import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import type { PortalCountertopSummary, PortalOrderDetail as PortalOrderDetailType } from "@/lib/portal/orders";
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
        {order.items.filter((item) => item.countertop).map((item) => <CountertopSummary key={`countertop-${item.id}`} summary={item.countertop as PortalCountertopSummary} currencyCode={dealerOrder?.currency_code || "USD"} />)}
      </section>
    </div>
  );
}

function CountertopSummary({ summary, currencyCode }: { summary: PortalCountertopSummary; currencyCode: string }) {
  const money = (value: string | null | undefined) => value == null ? "—" : formatCurrency(Number(value), currencyCode);
  return <div className="portal-order-countertop mt-4 border-top pt-4">
    <div className="portal-section-heading"><div><p className="portal-kicker">Countertop configuration</p><h3>Commercial summary</h3></div></div>
    <dl className="portal-definition-grid">
      <div><dt>Stone</dt><dd>{summary.stone.name || "—"}</dd></div>
      <div><dt>Stone Type</dt><dd>{summary.stone.stone_type || "—"}</dd></div>
      <div><dt>Sq Ft</dt><dd>{summary.stone.sqft || "—"}</dd></div>
      <div><dt>Material Band</dt><dd>{summary.stone.material_price_band ? `${summary.stone.material_price_band} · ${money(summary.stone.price_per_sqft)} / sq ft` : "—"}</dd></div>
      {summary.edge && <div><dt>Edge</dt><dd>{summary.edge.name} · {summary.edge.linear_ft || summary.edge.applicable_measure || "—"} LF ({money(summary.edge.subtotal)})</dd></div>}
      {summary.sink && <div><dt>Sink</dt><dd>{summary.sink.name}{summary.sink.sku ? ` · ${summary.sink.sku}` : ""} ({money(summary.sink.subtotal)})</dd></div>}
    </dl>
    {summary.services.length > 0 && <div className="mt-3"><p className="portal-kicker">Services</p>{summary.services.map((service, index) => <p key={`${service.name}-${index}`} className="text-sm">{service.name} · {service.quantity || "—"} × {money(service.unit_price)} ({money(service.subtotal)})</p>)}</div>}
    <dl className="portal-definition-grid mt-3"><div><dt>Material</dt><dd>{money(summary.totals.material_subtotal)}</dd></div><div><dt>Edge</dt><dd>{money(summary.totals.edge_subtotal)}</dd></div><div><dt>Sink</dt><dd>{money(summary.totals.sink_subtotal)}</dd></div><div><dt>Services</dt><dd>{money(summary.totals.services_subtotal)}</dd></div><div><dt>Countertop Total</dt><dd>{money(summary.totals.subtotal)}</dd></div></dl>
  </div>;
}
