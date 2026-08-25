import Link from "next/link";
import { products } from "@/data/products";

export default function Shop() {
  return (
    <>
      {/* Page Header */}
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(3).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h2>Shop</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Shop</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Shop Section */}
      <section className="shop-section pb-5" aria-label="Shop">
        <div className="container">
          {/* Shop Intro */}
          <div className="row mb-5">
            <div className="col-lg-6 mb-4 mb-lg-0">
              <div className="service-intro-content">
                <span className="service-subtitle mb-1">
                  Curated Collection
                </span>
                <h2 className="service-main-title">Exclusive Furniture</h2>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="service-intro-text">
                <p>
                  Bring the Oakwell aesthetic into your own home with our
                  hand-selected collection of furniture, lighting, and
                  accessories. Each piece is chosen for its quality,
                  craftsmanship, and timeless design.
                </p>
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="row g-4 mb-5">
            {products.map((product) => (
              <div className="col-lg-4 col-md-6" key={product.id}>
                <div className="project-card h-100">
                  <div
                    className="project-image"
                    style={{ height: "300px", position: "relative" }}
                  >
                    <Link href={`/shop/${product.slug}`}>
                      <img
                        src={product.image}
                        alt={product.name}
                        style={{ height: "100%", objectFit: "cover" }}
                      />
                    </Link>
                    {product.badge && (
                      <div
                        className={`badge ${product.badge.color} text-white position-absolute top-0 start-0 m-3 px-3 py-2`}
                      >
                        {product.badge.text}
                      </div>
                    )}
                  </div>
                  <div className="card-body pt-3">
                    <h3
                      style={{
                        fontSize: "1.25rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <Link
                        href={`/shop/${product.slug}`}
                        className="text-decoration-none text-dark"
                      >
                        {product.name}
                      </Link>
                    </h3>
                    <p className="text-muted mb-2">{product.category}</p>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <span style={{ fontWeight: 700, fontSize: "1.2rem" }}>
                          ${product.price.toLocaleString()}
                        </span>
                        {product.originalPrice && (
                          <span
                            style={{
                              textDecoration: "line-through",
                              color: "#aaa",
                              marginLeft: "5px",
                            }}
                          >
                            ${product.originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/shop/${product.slug}`}
                        className="btn-link"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="row">
            <div className="col-12 d-flex justify-content-center">
              <nav aria-label="Shop pagination">
                <ul className="pagination">
                  <li className="page-item disabled">
                    <a className="page-link" href="#" tabIndex={-1}>
                      Previous
                    </a>
                  </li>
                  <li className="page-item active" aria-current="page">
                    <a className="page-link" href="#">
                      1
                    </a>
                  </li>
                  <li className="page-item">
                    <a className="page-link" href="#">
                      2
                    </a>
                  </li>
                  <li className="page-item">
                    <a className="page-link" href="#">
                      3
                    </a>
                  </li>
                  <li className="page-item">
                    <a className="page-link" href="#">
                      Next
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Transform Your Space?</h2>
          <p>
            Let&apos;s create something extraordinary together. Schedule a free
            consultation and turn your vision into a thoughtfully designed
            reality.
          </p>
          <div className="cta-buttons">
            <Link href="/contact" className="btn-white">
              Schedule Consultation
            </Link>
            <a href="tel:+15551234567" className="btn-outline">
              Call Us Now
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
