import type { DealerCatalogProduct, DealerPricingContext } from "@/lib/portal/dealer";
import PortalEmptyState from "@/components/portal/PortalEmptyState";

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(value);
}

export default function DealerCatalog({ products, pricing }: { products: DealerCatalogProduct[]; pricing: DealerPricingContext }) {
  if (!products.length) {
    return <PortalEmptyState title="No catalog products" description="Published products will appear here when available." />;
  }

  return (
    <div className="portal-catalog-grid">
      {products.map((product) => (
        <article className="portal-panel portal-catalog-card" key={product.id}>
          <div className="portal-catalog-card__body">
            <p className="portal-kicker">{product.category || product.brand || "Oakwell Cabinetry"}</p>
            <h2>{product.displayName}</h2>
            {product.shortDescription ? <p className="portal-muted">{product.shortDescription}</p> : null}
            <div className="portal-catalog-variants">
              {product.variants.map((variant) => (
                <div className="portal-catalog-variant" key={variant.id}>
                  <div>
                    <strong>{variant.colorName || variant.colorCode || "Standard"}</strong>
                    <span className="portal-muted">{variant.sku}</span>
                  </div>
                  {pricing.pricing_enabled && variant.priceAvailable && typeof variant.price === "number" && variant.currencyCode
                    ? <span className="portal-price">{formatCurrency(variant.price, variant.currencyCode)}</span>
                    : <span className="portal-muted">Contact sales for pricing</span>}
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
