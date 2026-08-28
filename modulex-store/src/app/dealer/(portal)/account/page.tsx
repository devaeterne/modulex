import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getDealerAccount } from "@/lib/portal/dealer";

export default async function DealerAccountPage() {
  const account = await getDealerAccount();
  if (!account) {
    return <PortalEmptyState title="Account unavailable" description="Your Dealer account details are temporarily unavailable." />;
  }

  return (
    <div className="d-grid gap-4">
      <PortalPageHeader
        eyebrow="Dealer Portal"
        title="Account"
        description="Read-only company and address details associated with your Oakwell Dealer account."
      />

      <section className="portal-panel portal-account-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Company</p><h2>{account.name}</h2></div></div>
        <dl className="portal-definition-grid">
          <div><dt>Email</dt><dd>{account.email || "—"}</dd></div>
          <div><dt>Phone</dt><dd>{account.phone || "—"}</dd></div>
          <div><dt>Website</dt><dd>{account.website || "—"}</dd></div>
          <div><dt>Country</dt><dd>{account.country_code || "—"}</dd></div>
          <div><dt>Currency</dt><dd>{account.currency_code}</dd></div>
          <div><dt>Customer since</dt><dd>{account.customer_since || "—"}</dd></div>
          {account.price_group_name ? <div><dt>Pricing group</dt><dd>{account.price_group_name}</dd></div> : null}
        </dl>
      </section>

      <section className="portal-panel portal-account-card">
        <div className="portal-section-heading"><div><p className="portal-kicker">Addresses</p><h2>Billing & shipping</h2></div></div>
        {!account.addresses.length ? (
          <PortalEmptyState title="No active addresses" description="Contact Oakwell if your billing or shipping details need to be updated." />
        ) : (
          <div className="portal-address-grid">
            {account.addresses.map((address) => (
              <article className="portal-address-card" key={address.id}>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <strong>{address.address_name}</strong>
                  {address.is_default_billing ? <span className="portal-status portal-status--neutral">Billing default</span> : null}
                  {address.is_default_shipping ? <span className="portal-status portal-status--neutral">Shipping default</span> : null}
                </div>
                <p className="portal-muted mb-0">
                  {[address.company_name, address.contact_name, address.address_line_1, address.address_line_2, address.postal_code, address.city, address.state_region, address.country_code]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {address.phone ? <p className="portal-muted mb-0">{address.phone}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
