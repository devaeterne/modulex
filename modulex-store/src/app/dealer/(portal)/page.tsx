import Link from "next/link";
import PortalOverview from "@/components/portal/PortalOverview";
import { getDealerPricingContext } from "@/lib/portal/dealer";
import { getPortalDashboardSummary } from "@/lib/portal/fulfillment";

export default async function DealerPortalPage() {
  const [summary, pricing] = await Promise.all([
    getPortalDashboardSummary(),
    getDealerPricingContext(),
  ]);

  return (
    <div className="d-grid gap-4">
      <PortalOverview kind="dealer" summary={summary} />
      <section className="portal-panel portal-pricing-state">
        <div>
          <p className="portal-kicker">Catalog pricing</p>
          <h2>{pricing.pricing_enabled ? "Pricing available" : "Contact sales for pricing"}</h2>
          <p className="portal-muted mb-0">
            {pricing.pricing_enabled
              ? "Your Dealer catalog uses the pricing assigned to this account."
              : "Catalog products remain available even when account pricing is not enabled."}
          </p>
        </div>
        <Link className="portal-button portal-button--secondary" href="/dealer/catalog">Open catalog</Link>
      </section>
    </div>
  );
}
