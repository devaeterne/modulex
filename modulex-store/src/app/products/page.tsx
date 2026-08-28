import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/products/ProductCard";
import { getAllStoreCatalogProducts } from "@/lib/store/products/queries";
import type { StoreCatalogProduct } from "@/lib/store/products/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Products",
  description:
    "Explore Oakwell Cabinetry products, cabinet styles, and available finish variants.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Products | Oakwell Cabinetry",
    description:
      "Explore Oakwell Cabinetry products, cabinet styles, and available finish variants.",
    url: "/products",
  },
};

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string | string[];
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const resolvedSearchParams = await searchParams;
  const query =
    typeof resolvedSearchParams.q === "string"
      ? resolvedSearchParams.q.trim()
      : "";

  let products: StoreCatalogProduct[] = [];
  let loadError = false;

  try {
    products = await getAllStoreCatalogProducts({
      query: query || undefined,
      maxItems: 5000,
    });
  } catch (error) {
    loadError = true;
    console.error("Unable to load Store catalog", error);
  }

  return (
    <>
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(3).jpg')" }}
        />
        <div className="header-overlay" />
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h1>Products</h1>
              </div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Products</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="shop-section pb-5" aria-labelledby="products-heading">
        <div className="container">
          <div className="row align-items-end mb-5 g-4">
            <div className="col-lg-7">
              <div className="service-intro-content">
                <span className="service-subtitle mb-1">Oakwell Cabinetry</span>
                <h2 id="products-heading" className="service-main-title mb-3">
                  Cabinet Products
                </h2>
                <p className="mb-0">
                  Browse published Oakwell product families and their available
                  finish variants. Product information and specifications are
                  maintained by Oakwell Cabinetry.
                </p>
              </div>
            </div>

            <div className="col-lg-5">
              <form action="/products" method="get" role="search">
                <label htmlFor="product-search" className="form-label fw-semibold">
                  Search products
                </label>
                <div className="input-group">
                  <input
                    id="product-search"
                    name="q"
                    type="search"
                    className="form-control"
                    placeholder="Search by product code or SKU"
                    defaultValue={query}
                  />
                  <button className="btn btn-dark" type="submit">
                    Search
                  </button>
                </div>
              </form>
            </div>
          </div>

          {loadError ? (
            <div className="py-5 text-center">
              <h2 className="h4 mb-3">Catalog temporarily unavailable</h2>
              <p className="text-muted mb-0">
                Product data could not be loaded. Please try again shortly.
              </p>
            </div>
          ) : products.length === 0 ? (
            <div className="py-5 text-center">
              <h2 className="h4 mb-3">
                {query ? "No matching products" : "Catalog content is being prepared"}
              </h2>
              <p className="text-muted mb-4">
                {query
                  ? `No published products matched “${query}”.`
                  : "Products will appear here as catalog content is reviewed and published."}
              </p>
              {query && (
                <Link href="/products" className="btn-link">
                  Clear search
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <p className="mb-0 text-muted">
                  {products.length} published product{products.length === 1 ? "" : "s"}
                </p>
                {query && (
                  <Link href="/products" className="btn-link">
                    Clear search
                  </Link>
                )}
              </div>

              <div className="row g-4">
                {products.map((product) => (
                  <div className="col-xl-4 col-md-6" key={product.id}>
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Need help selecting the right cabinet?</h2>
          <p>
            Contact Oakwell Cabinetry for product information, specifications,
            and dealer support.
          </p>
          <div className="cta-buttons">
            <Link href="/contact" className="btn-white">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
