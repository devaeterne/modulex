import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import PortalTimeline from "@/components/portal/PortalTimeline";
import type { PortalShipmentDetailData } from "@/lib/portal/fulfillment";

function addressLines(address: Record<string, unknown> | null) {
  if (!address) return ["—"];
  const text = (key: string) => typeof address[key] === "string" ? address[key] as string : "";
  return [
    [text("company_name"), text("contact_name")].filter(Boolean).join(" · "),
    [text("address_line_1"), text("address_line_2")].filter(Boolean).join(", "),
    [text("city"), text("state_region"), text("postal_code")].filter(Boolean).join(", "),
    text("country_code"),
  ].filter(Boolean);
}

export default function PortalShipmentDetail({ shipment }: { shipment: PortalShipmentDetailData }) {
  const cancelled = shipment.status === "cancelled";
  const timeline = cancelled
    ? [{ label: "Cancelled", timestamp: shipment.cancelled_at, exception: true, current: true }]
    : [
        { label: "Draft", complete: true },
        { label: "Picking", timestamp: shipment.picking_started_at, complete: Boolean(shipment.picking_started_at), current: shipment.status === "picking" },
        { label: "Packed", timestamp: shipment.packed_at, complete: Boolean(shipment.packed_at), current: shipment.status === "packed" },
        { label: "Shipped", timestamp: shipment.shipped_at, complete: Boolean(shipment.shipped_at), current: shipment.status === "shipped" },
        { label: "Delivered", timestamp: shipment.delivered_at, complete: Boolean(shipment.delivered_at), current: shipment.status === "delivered" },
      ];

  return (
    <div className="portal-detail-grid">
      <PortalPageHeader eyebrow="Shipment" title={shipment.shipment_number} description={`Order ${shipment.order_number}`} actions={<PortalStatusBadge status={shipment.status} />} />

      <section className="portal-panel portal-detail-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Shipment details</p><h2>Delivery information</h2></div></div>
        <dl className="portal-definition-grid">
          <div><dt>Order</dt><dd>{shipment.order_number}</dd></div>
          <div><dt>Reference</dt><dd>{shipment.customer_reference || "—"}</dd></div>
          <div><dt>Carrier</dt><dd>{shipment.carrier || "—"}</dd></div>
          <div><dt>Service</dt><dd>{shipment.service_level || "—"}</dd></div>
          <div><dt>Tracking</dt><dd>{shipment.tracking_number || "—"}</dd></div>
        </dl>
      </section>

      <section className="portal-panel portal-detail-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Progress</p><h2>Shipment timeline</h2></div></div>
        <div className="portal-detail-card__body"><PortalTimeline steps={timeline} /></div>
      </section>

      <section className="portal-panel portal-detail-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Destination</p><h2>Shipping address</h2></div></div>
        <address className="portal-address">{addressLines(shipment.shipping_address).map((line) => <span key={line}>{line}</span>)}</address>
      </section>

      <section className="portal-panel portal-table-wrap portal-detail-card--wide">
        <div className="portal-section-heading"><div><p className="portal-kicker">Contents</p><h2>Shipment items</h2></div></div>
        <div className="table-responsive">
          <table className="table portal-table align-middle mb-0">
            <thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Ordered</th><th>Shipment qty.</th></tr></thead>
            <tbody>{shipment.items.map((item) => <tr key={item.id}><td>{item.line_no}</td><td>{item.sku_snapshot}</td><td>{item.product_name_snapshot}</td><td>{item.ordered_quantity_snapshot}</td><td>{item.shipment_quantity}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
