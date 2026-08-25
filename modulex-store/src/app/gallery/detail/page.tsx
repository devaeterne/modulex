"use client";

import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

export default function GalleryDetail() {
  return (
    <>
      {/* Page Header */}
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(1).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h2>Minimalist Haven</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <Link href="/gallery">Gallery</Link>
                <span className="separator">/</span>
                <span className="current">Minimalist Haven</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Project Detail Section */}
      <section className="project-detail-section pb-5" aria-label="Project Detail">
        <div className="container">
          {/* Project Overview */}
          <div className="row mb-5">
            <div className="col-lg-8">
              <div className="project-slider project-slider-gallery rounded-3 overflow-hidden">
                <Swiper
                  modules={[Navigation, Pagination, Autoplay]}
                  loop={true}
                  autoplay={{
                    delay: 5000,
                    disableOnInteraction: false,
                  }}
                  pagination={{
                    clickable: true,
                  }}
                  navigation={true}
                  className="h-100"
                >
                  <SwiperSlide>
                    <img
                      src="/assets/images/img(9).jpg"
                      alt="Project Image 1"
                      className="object-fit-cover w-100 h-100"
                    />
                  </SwiperSlide>
                  <SwiperSlide>
                    <img
                      src="/assets/images/img(6).jpg"
                      alt="Project Image 2"
                      className="object-fit-cover w-100 h-100"
                    />
                  </SwiperSlide>
                  <SwiperSlide>
                    <img
                      src="/assets/images/img(7).jpg"
                      alt="Project Image 3"
                      className="object-fit-cover w-100 h-100"
                    />
                  </SwiperSlide>
                </Swiper>
              </div>
            </div>
            <div className="col-lg-4 pt-lg-0 pt-5">
              <div className="sidebar-widget h-100">
                <h3 className="widget-title">Project Details</h3>
                <ul className="list-unstyled">
                  <li className="mb-3 d-flex justify-content-between border-bottom pb-2">
                    <span className="fw-bold text-muted">Client:</span>
                    <span>Private Residence</span>
                  </li>
                  <li className="mb-3 d-flex justify-content-between border-bottom pb-2">
                    <span className="fw-bold text-muted">Location:</span>
                    <span>Manhattan, NY</span>
                  </li>
                  <li className="mb-3 d-flex justify-content-between border-bottom pb-2">
                    <span className="fw-bold text-muted">Year:</span>
                    <span>2025</span>
                  </li>
                  <li className="mb-3 d-flex justify-content-between border-bottom pb-2">
                    <span className="fw-bold text-muted">Services:</span>
                    <span>Interior Design, Styling</span>
                  </li>
                  <li className="mb-3 d-flex justify-content-between border-bottom pb-2">
                    <span className="fw-bold text-muted">Area:</span>
                    <span>2,500 sq ft</span>
                  </li>
                </ul>
                <div className="mt-4">
                  <h4 className="h5 mb-3">Share Project</h4>
                  <div className="d-flex gap-3">
                    <a href="#" className="text-dark fs-5">
                      <i className="bi bi-facebook"></i>
                    </a>
                    <a href="#" className="text-dark fs-5">
                      <i className="bi bi-twitter-x"></i>
                    </a>
                    <a href="#" className="text-dark fs-5">
                      <i className="bi bi-pinterest"></i>
                    </a>
                    <a href="#" className="text-dark fs-5">
                      <i className="bi bi-linkedin"></i>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Description */}
          <div className="row mb-5">
            <div className="col-lg-8">
              <h3 className="mb-4">About The Project</h3>
              <p className="lead mb-4">
                This project was a complete renovation of a mid-century modern
                apartment in the heart of Manhattan. The goal was to create a
                serene, minimalist haven that would serve as a retreat from the
                bustling city outside.
              </p>
              <p className="mb-4">
                We focused on a neutral color palette with warm wood tones and
                natural textures to add depth and interest. The open-concept
                living area features custom millwork and curated furniture pieces
                that balance form and function. Large windows allow natural light
                to flood the space, highlighting the carefully selected finishes
                and art pieces.
              </p>
              <p>
                The bedroom was designed as a sanctuary, with soft textiles and
                layered lighting to create a cozy atmosphere. The result is a
                sophisticated yet comfortable home that perfectly reflects the
                client's lifestyle and aesthetic preferences.
              </p>
            </div>
            <div className="col-lg-4">
              <div className="blog-quote">
                <i className="bi bi-quote quote-icon"></i>
                <p>
                  "Oakwell truly understood our vision and brought it to life in
                  ways we couldn't have imagined. Every detail was thoughtfully
                  considered, and the result is a home that we absolutely love."
                </p>
                <cite>- Sarah Johnson, Homeowner</cite>
              </div>
            </div>
          </div>

          {/* Project Gallery Grid */}
          <div className="row mb-5">
            <div className="col-12 mb-4">
              <h3 className="mb-0">Gallery</h3>
            </div>
            <div className="col-md-6 mb-4">
              <div className="gallery-item-detail rounded-3 overflow-hidden position-relative">
                <img
                  src="/assets/images/img(4).jpg"
                  alt="Detail 1"
                  className="w-100 object-fit-cover"
                  style={{ height: "300px" }}
                />
                <div className="overlay position-absolute top-0 start-0 w-100 h-100 bg-dark opacity-0 hover-opacity-25 transition-all"></div>
              </div>
            </div>
            <div className="col-md-6 mb-4">
              <div className="gallery-item-detail rounded-3 overflow-hidden position-relative">
                <img
                  src="/assets/images/img(5).jpg"
                  alt="Detail 2"
                  className="w-100 object-fit-cover"
                  style={{ height: "300px" }}
                />
              </div>
            </div>
            <div className="col-md-4 mb-4">
              <div className="gallery-item-detail rounded-3 overflow-hidden position-relative">
                <img
                  src="/assets/images/img(6).jpg"
                  alt="Detail 3"
                  className="w-100 object-fit-cover"
                  style={{ height: "250px" }}
                />
              </div>
            </div>
            <div className="col-md-4 mb-4">
              <div className="gallery-item-detail rounded-3 overflow-hidden position-relative">
                <img
                  src="/assets/images/img(7).jpg"
                  alt="Detail 4"
                  className="w-100 object-fit-cover"
                  style={{ height: "250px" }}
                />
              </div>
            </div>
            <div className="col-md-4 mb-4">
              <div className="gallery-item-detail rounded-3 overflow-hidden position-relative">
                <img
                  src="/assets/images/img(8).jpg"
                  alt="Detail 5"
                  className="w-100 object-fit-cover"
                  style={{ height: "250px" }}
                />
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="row pt-5">
            <div className="col-6 text-start">
              <Link
                href="#"
                className="d-inline-flex align-items-center text-decoration-none text-dark group-hover"
              >
                <i className="bi bi-arrow-left me-2"></i>
                <div>
                  <span className="d-block text-muted small">Previous Project</span>
                  <span className="fw-bold">Urban Loft</span>
                </div>
              </Link>
            </div>
            <div className="col-6 text-end">
              <Link
                href="#"
                className="d-inline-flex align-items-center text-decoration-none text-dark group-hover"
              >
                <div>
                  <span className="d-block text-muted small">Next Project</span>
                  <span className="fw-bold">Coastal Retreat</span>
                </div>
                <i className="bi bi-arrow-right ms-2"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Transform Your Space?</h2>
          <p>
            Let's create something extraordinary together. Schedule a free
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

      {/* Blog */}
      <section id="blog">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Our Blog</span>
            <h2>Design Insights & Inspiration</h2>
            <p>
              Explore the latest trends, tips, and stories from the world of
              interior design
            </p>
          </div>
          <div className="row">
            <div className="col-lg-4 col-md-6 mb-4">
              <article className="blog-card">
                <div className="blog-image">
                  <img
                    src="/assets/images/img(4).jpg"
                    alt="Minimalist Living Room"
                  />
                  <span className="blog-category">Design Trends</span>
                </div>
                <div className="blog-content">
                  <div className="blog-meta">
                    <span>
                      <i className="bi bi-calendar3"></i> Jan 15, 2026
                    </span>
                    <span>
                      <i className="bi bi-clock"></i> 5 min read
                    </span>
                  </div>
                  <h3 className="blog-title">
                    <Link href="/blog/detail">
                      Embracing Minimalism: Less is More in 2026
                    </Link>
                  </h3>
                  <p className="blog-excerpt">
                    Discover how minimalist design continues to evolve, creating
                    serene spaces that prioritize function and beauty without
                    the clutter.
                  </p>
                  <Link href="/blog/detail" className="blog-link">
                    Read More <i className="bi bi-chevron-right"></i>
                  </Link>
                </div>
              </article>
            </div>

            <div className="col-lg-4 col-md-6 mb-4">
              <article className="blog-card">
                <div className="blog-image">
                  <img
                    src="/assets/images/floating(3).jpg"
                    alt="Sustainable Materials"
                  />
                  <span className="blog-category">Sustainability</span>
                </div>
                <div className="blog-content">
                  <div className="blog-meta">
                    <span>
                      <i className="bi bi-calendar3"></i> Jan 10, 2026
                    </span>
                    <span>
                      <i className="bi bi-clock"></i> 7 min read
                    </span>
                  </div>
                  <h3 className="blog-title">
                    <Link href="/blog/detail">
                      Sustainable Materials: Building a Greener Home
                    </Link>
                  </h3>
                  <p className="blog-excerpt">
                    Learn about eco-friendly materials and sustainable practices
                    that can transform your home while protecting our planet.
                  </p>
                  <Link href="/blog/detail" className="blog-link">
                    Read More <i className="bi bi-chevron-right"></i>
                  </Link>
                </div>
              </article>
            </div>

            <div className="col-lg-4 col-md-6 mb-4">
              <article className="blog-card">
                <div className="blog-image">
                  <img
                    src="/assets/images/img(6).jpg"
                    alt="Color Psychology"
                  />
                  <span className="blog-category">Color Theory</span>
                </div>
                <div className="blog-content">
                  <div className="blog-meta">
                    <span>
                      <i className="bi bi-calendar3"></i> Jan 5, 2026
                    </span>
                    <span>
                      <i className="bi bi-clock"></i> 6 min read
                    </span>
                  </div>
                  <h3 className="blog-title">
                    <Link href="/blog/detail">
                      The Psychology of Color in Interior Design
                    </Link>
                  </h3>
                  <p className="blog-excerpt">
                    Understand how different colors affect mood and behavior,
                    and how to use this knowledge in your design projects.
                  </p>
                  <Link href="/blog/detail" className="blog-link">
                    Read More <i className="bi bi-chevron-right"></i>
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
