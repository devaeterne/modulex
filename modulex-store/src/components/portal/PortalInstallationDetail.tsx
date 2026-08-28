import PortalPageHeader from "@/components/portal/PortalPageHeader";
import PortalStatusBadge from "@/components/portal/PortalStatusBadge";
import PortalTimeline from "@/components/portal/PortalTimeline";
import type { PortalInstallationDetailData } from "@/lib/portal/fulfillment";

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

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PortalInstallationDetail({ installation }: { installation: PortalInstallationDetailData }) {
  const cancelled = installation.status === "cancelled";
  const timeline = cancelled
    ? [{ label: "Cancelled", timestamp: installation.cancelled_at, exception: true, current: true }]
    : [
        { label: "Scheduled", timestamp: installation.scheduled_start_at, complete: true, current: installation.status === "scheduled" },
        { label: "Confirmed", timestamp: installation.confirmed_at, complete: Boolean(installation.confirmed_at), current: installation.status === "confirmed" },
        { label: "In progress", timestamp: installation.started_at, complete: Boolean(installation.started_at), current: installation.status === "in_progress" },
        { label: "Completed", timestamp: installation.completed_at, complete: Boolean(installation.completed_at), current: installation.status === "completed" },
      ];

  return (
    <div className="portal-detail-grid">
      <PortalPageHeader eyebrow="Installation" title={installation.installation_number} description={`Order ${installation.order_number}`} actions={<PortalStatusBadge status={installation.status} />} />

      <section className="portal-panel portal-detail-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Schedule</p><h2>Installation details</h2></div></div>
        <dl className="portal-definition-grid">
          <div><dt>Start</dt><dd>{formatDateTime(installation.scheduled_start_at)}</dd></div>
          <div><dt>End</dt><dd>{formatDateTime(installation.scheduled_end_at)}</dd></div>
          <div><dt>Shipment</dt><dd>{installation.shipment_number || "—"}</dd></div>
          <div><dt>Team</dt><dd>{installation.team_name || "—"}</dd></div>
          <div><dt>Contact</dt><dd>{installation.contact_name || "—"}</dd></div>
          <div><dt>Phone</dt><dd>{installation.contact_phone || "—"}</dd></div>
        </dl>
      </section>

      <section className="portal-panel portal-detail-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Progress</p><h2>Installation timeline</h2></div></div>
        <div className="portal-detail-card__body"><PortalTimeline steps={timeline} /></div>
      </section>

      <section className="portal-panel portal-detail-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Location</p><h2>Installation address</h2></div></div>
        <address className="portal-address">{addressLines(installation.address).map((line) => <span key={line}>{line}</span>)}</address>
      </section>

      {(installation.notes || installation.completion_notes) ? (
        <section className="portal-panel portal-detail-card portal-detail-card--wide">
          <div className="portal-section-heading"><div><p className="portal-kicker">Notes</p><h2>Installation information</h2></div></div>
          <div className="portal-detail-card__body portal-note-grid">
            {installation.notes ? <div><strong>Notes</strong><p>{installation.notes}</p></div> : null}
            {installation.completion_notes ? <div><strong>Completion notes</strong><p>{installation.completion_notes}</p></div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
