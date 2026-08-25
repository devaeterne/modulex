"use client";

import { useState, use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { products } from "@/data/products";

interface ShopDetailProps {
  params: Promise<{
    slug: string;
  }>;
}

export default function ShopDetail({ params }: ShopDetailProps) {
  const { slug } = use(params);
  const product = products.find((p) => p.slug === slug);

  if (!product) {
    notFound();
  }

  const [selectedImage, setSelectedImage] = useState(product.image);
  const [activeTab, setActiveTab] = useState("description");
  const [quantity, setQuantity] = useState(1);

  const relatedProducts = products
    .filter((p) => p.id !== product.id)
    .slice(0, 3);

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

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
                <h2>Product Detail</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <Link href="/shop">Shop</Link>
                <span className="separator">/</span>
                <span className="current">{product.name}</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Product Detail Section */}
      <section className="shop-detail-section pb-5" aria-label="Product Detail">
        <div className="container">
          <div className="row g-5 mb-5">
            {/* Product Image */}
            <div className="col-lg-6">
              <div className="product-image-large mb-4">
                <img
                  src={selectedImage}
                  alt={product.name}
                  className="img-fluid rounded-3 w-100"
                  style={{ objectFit: "cover", height: "500px" }}
                />
              </div>
              <div className="row g-product-shop">
                {product.images.map((img, index) => (
                  <div className="col-3 product-shop-list" key={index}>
                    <img
                      src={img}
                      alt={`${product.name} thumb ${index + 1}`}
                      className={`img-fluid cursor-pointer ${
                        selectedImage === img
                          ? "opacity-100 border border-primary"
                          : "opacity-75 hover-opacity-100"
                      }`}
                      onClick={() => setSelectedImage(img)}
                      style={{ cursor: "pointer" }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Product Info */}
            <div className="col-lg-6">
              <div className="product-info">
                {product.badge && (
                  <span className={`badge ${product.badge.color} mb-3`}>
                    {product.badge.text}
                  </span>
                )}
                <h1 className="display-5 fw-bold mb-3">{product.name}</h1>
                <div className="product-price mb-4">
                  <span className="h2 fw-bold">
                    ${product.price.toLocaleString()}
                  </span>
                  {product.originalPrice && (
                    <span
                      className="text-muted ms-3 text-decoration-line-through"
                      style={{ fontSize: "1.2rem" }}
                    >
                      ${product.originalPrice.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="product-rating mb-4 text-warning">
                  <i className="bi bi-star-fill"></i>
                  <i className="bi bi-star-fill"></i>
                  <i className="bi bi-star-fill"></i>
                  <i className="bi bi-star-fill"></i>
                  <i className="bi bi-star-half"></i>
                  <span className="text-muted ms-2">(12 Reviews)</span>
                </div>

                <p className="lead mb-4" style={{ fontSize: "1.1rem", opacity: 0.8 }}>
                  {product.description}
                </p>

                <div className="product-meta mb-4">
                  <div className="d-flex align-items-center mb-2">
                    <span className="fw-bold me-2">SKU:</span>
                    <span className="text-muted">{product.sku}</span>
                  </div>
                  <div className="d-flex align-items-center mb-2">
                    <span className="fw-bold me-2">Category:</span>
                    <Link
                      href="/shop"
                      className="text-decoration-none text-muted"
                    >
                      {product.category}
                    </Link>
                  </div>
                  <div className="d-flex align-items-center">
                    <span className="fw-bold me-2">Tags:</span>
                    {product.tags.map((tag) => (
                      <span
                        key={tag}
                        className="badge bg-light text-dark me-1"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <hr className="my-4" />

                <div className="product-actions d-flex align-items-center gap-3 mb-4">
                  <div className="quantity-wrapper d-flex align-items-center border rounded-3 px-3 py-2">
                    <button
                      className="btn btn-link text-dark p-0"
                      type="button"
                      onClick={() => handleQuantityChange(-1)}
                    >
                      <i className="bi bi-dash"></i>
                    </button>
                    <input
                      type="number"
                      className="form-control border-0 text-center mx-2 bg-none"
                      value={quantity}
                      readOnly
                      style={{ width: "50px" }}
                    />
                    <button
                      className="btn btn-link text-dark p-0"
                      type="button"
                      onClick={() => handleQuantityChange(1)}
                    >
                      <i className="bi bi-plus"></i>
                    </button>
                  </div>
                  <button className="btn btn-primary px-md-5 px-0 py-3 flex-grow-1">
                    Add to Cart
                  </button>
                  <button className="btn btn-outline-secondary p-3">
                    <i className="bi bi-heart"></i>
                  </button>
                </div>

                <div className="product-shipping">
                  <div className="d-flex align-items-center mb-2">
                    <i className="bi bi-truck me-2 text-warning"></i>
                    <span>Free shipping on orders over $2,000</span>
                  </div>
                  <div className="d-flex align-items-center">
                    <i className="bi bi-shield-check me-2 text-warning"></i>
                    <span>2-year warranty included</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className="row mb-5">
            <div className="col-12">
              <ul className="nav nav-tabs mb-4" role="tablist">
                <li className="nav-item">
                  <button
                    className={`nav-link text-dark ${
                      activeTab === "description" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("description")}
                  >
                    Description
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link text-dark ${
                      activeTab === "additional" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("additional")}
                  >
                    Additional Information
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link text-dark ${
                      activeTab === "reviews" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("reviews")}
                  >
                    Reviews (12)
                  </button>
                </li>
              </ul>
              <div className="tab-content p-4 border rounded-3">
                {activeTab === "description" && (
                  <div className="fade show active">
                    <h2 className="mb-4">Product Description</h2>
                    <p>{product.description}</p>
                    <p>
                      The {product.name} is designed to meet the highest standards
                      of quality and aesthetics. Whether you are looking to
                      refresh your current space or start from scratch, this
                      piece offers versatility and style.
                    </p>
                  </div>
                )}
                {activeTab === "additional" && (
                  <div className="fade show active">
                    <h2 className="mb-4">Additional Information</h2>
                    <table className="table table-bordered">
                      <tbody>
                        {product.dimensions && (
                          <tr>
                            <th scope="row" className="bg-light w-25">
                              Dimensions
                            </th>
                            <td>
                              {product.dimensions.height} H x{" "}
                              {product.dimensions.width} W x{" "}
                              {product.dimensions.depth} D
                            </td>
                          </tr>
                        )}
                        <tr>
                          <th scope="row" className="bg-light">
                            Materials
                          </th>
                          <td>{product.materials.join(", ")}</td>
                        </tr>
                        <tr>
                          <th scope="row" className="bg-light">
                            Assembly
                          </th>
                          <td>Minimal assembly required</td>
                        </tr>
                        <tr>
                          <th scope="row" className="bg-light">
                            Care Instructions
                          </th>
                          <td>Spot clean with a damp cloth; vacuum regularly</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {activeTab === "reviews" && (
                  <div className="fade show active">
                    <h2 className="mb-4">Customer Reviews</h2>
                    <div className="review-item mb-4 border-bottom pb-4">
                      <div className="d-flex justify-content-between mb-2">
                        <p className="mb-0 fw-bold">James Wilson</p>
                        <div className="text-warning small">
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                        </div>
                      </div>
                      <span className="text-muted small d-block mb-2">
                        October 15, 2025
                      </span>
                      <p className="mb-0">
                        Absolutely love this {product.name}! It&apos;s even more
                        beautiful in person.
                      </p>
                    </div>
                    <div className="review-item">
                      <div className="d-flex justify-content-between mb-2">
                        <p className="mb-0 fw-bold">Emily Chen</p>
                        <div className="text-warning small">
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star-fill"></i>
                          <i className="bi bi-star"></i>
                        </div>
                      </div>
                      <span className="text-muted small d-block mb-2">
                        September 22, 2025
                      </span>
                      <p className="mb-0">
                        Great quality for the price. Fits perfectly in my space.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Related Products */}
          <div className="row">
            <div className="col-12 mb-4">
              <h3 className="section-title">Related Products</h3>
            </div>
            {relatedProducts.map((related) => (
              <div className="col-lg-4 col-md-6" key={related.id}>
                <div className="project-card h-100">
                  <div
                    className="project-image"
                    style={{ height: "300px", position: "relative" }}
                  >
                    <Link href={`/shop/${related.slug}`}>
                      <img
                        src={related.image}
                        alt={related.name}
                        style={{ height: "100%", objectFit: "cover" }}
                      />
                    </Link>
                    {related.badge && (
                      <div
                        className={`badge ${related.badge.color} text-white position-absolute top-0 start-0 m-3 px-3 py-2`}
                      >
                        {related.badge.text}
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
                        href={`/shop/${related.slug}`}
                        className="text-decoration-none text-dark"
                      >
                        {related.name}
                      </Link>
                    </h3>
                    <p className="text-muted mb-2">{related.category}</p>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <span style={{ fontWeight: 700, fontSize: "1.2rem" }}>
                          ${related.price.toLocaleString()}
                        </span>
                        {related.originalPrice && (
                          <span
                            style={{
                              textDecoration: "line-through",
                              color: "#aaa",
                              marginLeft: "5px",
                            }}
                          >
                            ${related.originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/shop/${related.slug}`}
                        className="btn-link"
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          color: "var(--accent-color)",
                        }}
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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