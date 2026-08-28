import Image from "next/image";
import Link from "next/link";
import type { StoreCatalogProduct } from "@/lib/store/products/types";

interface ProductCardProps {
  product: StoreCatalogProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="project-card h-100 overflow-hidden">
      <Link
        href={`/products/${product.slug}`}
        className="d-block text-decoration-none"
        aria-label={`View ${product.displayName}`}
      >
        <div
          className="project-image position-relative bg-light"
          style={{ height: "320px" }}
        >
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.displayName}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div className="h-100 d-flex align-items-center justify-content-center px-4 text-center text-muted">
              <span>Product imagery coming soon</span>
            </div>
          )}
        </div>
      </Link>

      <div className="card-body pt-4 pb-4">
        <div className="d-flex justify-content-between gap-3 align-items-start mb-2">
          <div>
            {product.category && (
              <p className="text-uppercase text-muted small mb-2">
                {product.category}
              </p>
            )}
            <h2 className="h4 mb-1">
              <Link
                href={`/products/${product.slug}`}
                className="text-decoration-none text-dark"
              >
                {product.displayName}
              </Link>
            </h2>
          </div>
          {product.isFeatured && (
            <span className="badge bg-dark">Featured</span>
          )}
        </div>

        <p className="small text-muted mb-3">Code: {product.baseProductCode}</p>

        {product.shortDescription && (
          <p className="mb-3">{product.shortDescription}</p>
        )}

        {product.variants.length > 0 && (
          <div className="d-flex flex-wrap align-items-center gap-2 mb-4" aria-label="Available finishes">
            {product.variants.map((variant) => (
              <span
                key={variant.id}
                className="badge rounded-pill bg-light text-dark border"
                title={variant.sku}
              >
                {variant.colorName || variant.colorCode}
              </span>
            ))}
          </div>
        )}

        <Link href={`/products/${product.slug}`} className="btn-link">
          View Product
        </Link>
      </div>
    </article>
  );
}
