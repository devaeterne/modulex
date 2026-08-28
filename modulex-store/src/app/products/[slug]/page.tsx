import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteConfig } from "@/config/site";
import { getStoreProductBySlug } from "@/lib/store/products/queries";
import type { StoreProductDetail } from "@/lib/store/products/types";

export const revalidate = 300;

interface ProductDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const product = await getStoreProductBySlug(slug);

    if (!product) {
      return {
        title: "Product Not Found",
        robots: {
          index: false,
          follow: false,
        },
      };
    }

    const description =
      product.seoDescription ||
      product.shortDescription ||
      product.description ||
      `Explore ${product.displayName} from Oakwell Cabinetry.`;
    const image =
      product.ogImageUrl ||
      product.media.find((item) => item.type === "image" && item.isPrimary)?.url ||
      product.media.find((item) => item.type === "image")?.url;

    return {
      title: product.seoTitle || product.displayName,
      description,
      alternates: {
        canonical: `/products/${product.slug}`,
      },
      openGraph: {
        title: product.seoTitle || `${product.displayName} | Oakwell Cabinetry`,
        description,
        url: `/products/${product.slug}`,
        type: "website",
        images: image
          ? [
              {
                url: image,
                alt: product.displayName,
              },
            ]
          : undefined,
      },
    };
  } catch (error) {
    console.error("Unable to generate product metadata", error);
    return {
      title: "Product",
      robots: {
        index: false,
        follow: false,
      },
    };
  }
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;

  let product: StoreProductDetail | null;

  try {
    product = await getStoreProductBySlug(slug);
  } catch (error) {
    console.error("Unable to load Store product", error);
    throw new Error("Unable to load product data.");
  }

  if (!product) {
    notFound();
  }

  const images = product.media.filter((item) => item.type === "image");
  const documents = product.media.filter((item) => item.type === "document");
  const primaryImage = images.find((item) => item.isPrimary) || images[0];
  const description = product.description || product.shortDescription;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: new URL("/", siteConfig.url).toString(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Products",
        item: new URL("/products", siteConfig.url).toString(),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.displayName,
        item: new URL(`/products/${product.slug}`, siteConfig.url).toString(),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c"),
        }}
      />

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
                <h1>{product.displayName}</h1>
              </div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <Link href="/products">Products</Link>
                <span className="separator">/</span>
                <span className="current">{product.displayName}</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="shop-detail-section pb-5" aria-labelledby="product-title">
        <div className="container">
          <div className="row g-5 mb-5">
            <div className="col-lg-7">
              <div
                className="position-relative bg-light overflow-hidden rounded-3 mb-3"
                style={{ minHeight: "540px" }}
              >
                {primaryImage ? (
                  <Image
                    src={primaryImage.url}
                    alt={primaryImage.altText || product.displayName}
                    fill
                    priority
                    sizes="(max-width: 991px) 100vw, 58vw"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div className="position-absolute top-0 start-0 h-100 w-100 d-flex align-items-center justify-content-center text-muted text-center px-4">
                    Product imagery is being prepared.
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <div className="row g-3" aria-label="Product gallery">
                  {images.slice(1).map((image) => (
                    <div className="col-6 col-md-4" key={image.id}>
                      <div
                        className="position-relative bg-light rounded-3 overflow-hidden"
                        style={{ aspectRatio: "4 / 3" }}
                      >
                        <Image
                          src={image.url}
                          alt={image.altText || product.displayName}
                          fill
                          sizes="(max-width: 767px) 50vw, 20vw"
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="col-lg-5">
              <div className="product-info">
                {product.category && (
                  <p className="text-uppercase text-muted small mb-2">
                    {product.category}
                  </p>
                )}
                <h2 id="product-title" className="display-5 fw-bold mb-3">
                  {product.displayName}
                </h2>
                <p className="text-muted mb-4">
                  Product code: {product.baseProductCode}
                </p>

                {description ? (
                  <p className="lead mb-4" style={{ fontSize: "1.1rem" }}>
                    {description}
                  </p>
                ) : (
                  <p className="text-muted mb-4">
                    Detailed product information is being prepared.
                  </p>
                )}

                {(product.brand || product.category) && (
                  <dl className="row mb-4">
                    {product.brand && (
                      <>
                        <dt className="col-4">Brand</dt>
                        <dd className="col-8">{product.brand}</dd>
                      </>
                    )}
                    {product.category && (
                      <>
                        <dt className="col-4">Category</dt>
                        <dd className="col-8">{product.category}</dd>
                      </>
                    )}
                  </dl>
                )}

                <div className="border-top pt-4 mb-4">
                  <h3 className="h5 mb-3">Available variants</h3>
                  {product.variants.length > 0 ? (
                    <div className="d-grid gap-2">
                      {product.variants.map((variant) => (
                        <div
                          key={variant.id}
                          className="d-flex justify-content-between align-items-center border rounded-3 px-3 py-3"
                        >
                          <span className="fw-semibold">
                            {variant.colorName || variant.colorCode}
                          </span>
                          <span className="text-muted small">{variant.sku}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted mb-0">Variant information is not available.</p>
                  )}
                </div>

                <div className="d-grid gap-2">
                  <Link href="/contact" className="btn btn-dark py-3">
                    Request Product Information
                  </Link>
                  <Link href="/products" className="btn btn-outline-secondary py-3">
                    Back to Products
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {documents.length > 0 && (
            <div className="row mb-5">
              <div className="col-12">
                <div className="border-top pt-5">
                  <h2 className="h3 mb-4">Downloads</h2>
                  <div className="row g-3">
                    {documents.map((document) => (
                      <div className="col-lg-4 col-md-6" key={document.id}>
                        <a
                          href={document.url}
                          className="d-flex justify-content-between align-items-center border rounded-3 p-3 text-decoration-none text-dark"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span>{document.title || "Product document"}</span>
                          <span aria-hidden="true">↗</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Planning a cabinetry project?</h2>
          <p>
            Contact Oakwell Cabinetry for technical information, availability,
            or dealer assistance for this product.
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
