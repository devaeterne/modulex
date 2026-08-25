import Link from "next/link";

export default function Blog() {
  return (
    <>
      {/* Page Header */}
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(2).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h2>Blog</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Blog</span>
              </nav>
            </div>
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
                    src="/assets/images/gallery(2).jpg"
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
                    src="/assets/images/gallery(3).jpg"
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
                    src="/assets/images/gallery(4).jpg"
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

          <div className="row">
            <div className="col-lg-4 col-md-6 mb-4">
              <article className="blog-card">
                <div className="blog-image">
                  <img
                    src="/assets/images/gallery(5).jpg"
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
                    src="/assets/images/gallery(6).jpg"
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
                    src="/assets/images/gallery(7).jpg"
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

          <div className="row">
            <div className="col-lg-4 col-md-6 mb-4">
              <article className="blog-card">
                <div className="blog-image">
                  <img
                    src="/assets/images/gallery(8).jpg"
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
                    src="/assets/images/gallery(8).jpg"
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
                    src="/assets/images/img(11).jpg"
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

          {/* Pagination */}
          <div className="row mt-5">
            <div className="col-12">
              <nav>
                <ul className="pagination justify-content-center">
                  <li className="page-item disabled">
                    <Link className="page-link" href="#">
                      <i className="bi bi-chevron-left"></i> Previous
                    </Link>
                  </li>
                  <li className="page-item active">
                    <Link className="page-link" href="#">
                      1
                    </Link>
                  </li>
                  <li className="page-item">
                    <Link className="page-link" href="#">
                      2
                    </Link>
                  </li>
                  <li className="page-item">
                    <Link className="page-link" href="#">
                      3
                    </Link>
                  </li>
                  <li className="page-item">
                    <Link className="page-link" href="#">
                      Next <i className="bi bi-chevron-right"></i>
                    </Link>
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
    </>
  );
}
