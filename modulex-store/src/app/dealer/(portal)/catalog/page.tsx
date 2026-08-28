import DealerCatalog from "@/components/portal/DealerCatalog";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getDealerCatalogProducts, getDealerPricingContext } from "@/lib/portal/dealer";

export default async function DealerCatalogPage() {
  const [pricing, products] = await Promise.all([
    getDealerPricingContext(),
    getDealerCatalogProducts(),
  ]);

  return (
    <div>
      <PortalPageHeader
        eyebrow="Dealer Portal"
        title="Catalog"
        description={pricing.pricing_enabled
          ? "Browse the published Oakwell catalog with pricing assigned to your account."
          : "Browse the published Oakwell catalog. Pricing is not available for this account; contact sales for pricing."}
      />
      <DealerCatalog products={products} pricing={pricing} />
    </div>
  );
}
