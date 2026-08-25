import Link from "next/link";

export default function ResidentialService() {
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
                <h2>Residential Service</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <Link href="/services">Services</Link>
                <span className="separator">/</span>
                <span className="current">Residential Service</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Service */}
      <section className="service-detail-section pb-3" aria-label="Service">
        <div className="container">
          {/* Service Intro */}
          <div className="row mb-5">
            <div className="col-lg-6 mb-4 mb-lg-0">
              <div className="service-intro-content">
                <span className="service-subtitle">
                  Residential Design Excellence
                </span>
                <h2 className="service-main-title">
                  Creating Dream Homes That Reflect Your Lifestyle
                </h2>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="service-intro-text">
                <p>
                  Transform your house into a personalized sanctuary with our
                  comprehensive residential interior design services. We
                  specialize in creating beautiful, functional spaces that
                  enhance your daily living experience.
                </p>
                <p>
                  From concept to completion, our expert team brings creativity,
                  precision, and attention to detail to every project, ensuring
                  your home reflects your unique personality and meets your
                  practical needs.
                </p>
              </div>
            </div>
          </div>

          {/* Service Features Grid */}
          <div className="row g-4 pt-5 mb-5">
            <div className="col-lg-4 col-md-6">
              <div className="service-feature-box">
                <div className="feature-number">01</div>
                <div className="feature-icon-wrap">
                  <i className="bi bi-rulers"></i>
                </div>
                <h3>Space Planning</h3>
                <p>
                  Optimize your layout with strategic planning that maximizes
                  functionality, flow, and aesthetic appeal in every room of
                  your home.
                </p>
              </div>
            </div>

            <div className="col-lg-4 col-md-6">
              <div className="service-feature-box">
                <div className="feature-number">02</div>
                <div className="feature-icon-wrap">
                  <i className="bi bi-palette"></i>
                </div>
                <h3>Color Consultation</h3>
                <p>
                  Expert guidance on color schemes and finishes that create
                  cohesive, harmonious interiors tailored to your preferences.
                </p>
              </div>
            </div>

            <div className="col-lg-4 col-md-6">
              <div className="service-feature-box">
                <div className="feature-number">03</div>
                <div className="feature-icon-wrap">
                  <i className="bi bi-lamp"></i>
                </div>
                <h3>Furniture Selection</h3>
                <p>
                  Curated furniture and decor pieces that perfectly complement
                  your space, style, and lifestyle requirements.
                </p>
              </div>
            </div>

            <div className="col-lg-4 col-md-6">
              <div className="service-feature-box">
                <div className="feature-number">04</div>
                <div className="feature-icon-wrap">
                  <i className="bi bi-lightbulb"></i>
                </div>
                <h3>Lighting Design</h3>
                <p>
                  Layered lighting solutions that enhance ambiance,
                  functionality, and highlight architectural features
                  beautifully.
                </p>
              </div>
            </div>

            <div className="col-lg-4 col-md-6">
              <div className="service-feature-box">
                <div className="feature-number">05</div>
                <div className="feature-icon-wrap">
                  <i className="bi bi-tools"></i>
                </div>
                <h3>Custom Solutions</h3>
                <p>
                  Bespoke built-ins, millwork, and custom furniture designed
                  specifically for your unique space requirements.
                </p>
              </div>
            </div>

            <div className="col-lg-4 col-md-6">
              <div className="service-feature-box">
                <div className="feature-number">06</div>
                <div className="feature-icon-wrap">
                  <i className="bi bi-box-seam"></i>
                </div>
                <h3>Project Management</h3>
                <p>
                  Full coordination with contractors, vendors, and artisans to
                  ensure seamless execution and timely delivery.
                </p>
              </div>
            </div>
          </div>

          {/* Large Feature Image */}
          <div className="row mb-5">
            <div className="col-12">
              <div className="service-large-image">
                <img
                  src="/assets/images/img(8).jpg"
                  alt="Residential Interior Design"
                  className="img-fluid"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="">
        <div className="container">
          {/* Why Choose Us */}
          <div className="row mb-5 align-items-center">
            <div className="col-lg-6 mb-4 mb-lg-0">
              <div className="service-why-image">
                <img
                  src="/assets/images/floating(2).jpg"
                  alt="Why Choose Us"
                  className="img-fluid"
                />
                <div className="why-badge">
                  <div className="badge-content">
                    <h3>15+</h3>
                    <p>Years Experience</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="service-why-content">
                <span className="service-subtitle">Why Choose Us</span>
                <h2 className="section-title">
                  Professional Interior Design That Exceeds Expectations
                </h2>
                <p className="mb-4">
                  We bring a wealth of experience, creativity, and dedication to
                  every residential project. Our commitment to excellence and
                  client satisfaction has made us a trusted name in interior
                  design.
                </p>

                <div className="why-list">
                  <div className="why-item">
                    <div className="why-text">
                      <h3>Personalized Approach</h3>
                      <p>
                        Every project is tailored to reflect your unique style,
                        preferences, and lifestyle needs.
                      </p>
                    </div>
                  </div>

                  <div className="why-item">
                    <div className="why-text">
                      <h3>Expert Team</h3>
                      <p>
                        Our designers bring years of experience and stay current
                        with the latest design trends.
                      </p>
                    </div>
                  </div>

                  <div className="why-item">
                    <div className="why-text">
                      <h3>Quality Materials</h3>
                      <p>
                        We source premium materials and furnishings to ensure
                        lasting beauty and durability.
                      </p>
                    </div>
                  </div>

                  <div className="why-item">
                    <div className="why-text">
                      <h3>On-Time Delivery</h3>
                      <p>
                        We respect your time and complete projects within agreed
                        timelines and budgets.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grad-rev">
        <div className="container">
          {/* Our Process */}
          <div className="row">
            <div className="col-12">
              <div className="service-process-header text-center mb-5">
                <span className="service-subtitle">Our Process</span>
                <h2 className="section-title">How We Work</h2>
                <p>A streamlined approach that ensures exceptional results</p>
              </div>
            </div>
          </div>

          <div className="row g-4 mb-5">
            <div className="col-lg-3 col-md-6">
              <div className="process-card">
                <div className="process-number">01</div>
                <h3>Consultation</h3>
                <p>
                  We meet to discuss your vision, requirements, and budget to
                  establish project goals.
                </p>
              </div>
            </div>

            <div className="col-lg-3 col-md-6">
              <div className="process-card">
                <div className="process-number">02</div>
                <h3>Concept Design</h3>
                <p>
                  Our team creates mood boards, sketches, and preliminary
                  designs for your review.
                </p>
              </div>
            </div>

            <div className="col-lg-3 col-md-6">
              <div className="process-card">
                <div className="process-number">03</div>
                <h3>Development</h3>
                <p>
                  We refine the design with detailed plans, 3D renderings, and
                  material specifications.
                </p>
              </div>
            </div>

            <div className="col-lg-3 col-md-6">
              <div className="process-card">
                <div className="process-number">04</div>
                <h3>Execution</h3>
                <p>
                  We manage installation and styling, ensuring every detail is
                  perfectly placed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grad pt-0">
        <div className="container">
          {/* Project Gallery */}
          <div className="row mb-5">
            <div className="col-12">
              <div className="service-process-header text-center">
                <span className="service-subtitle">Our Portfolio</span>
                <h2 className="section-title">Recent Residential Projects</h2>
              </div>
            </div>
          </div>

          <div className="row g-4 mb-5">
            <div className="col-lg-6">
              <div className="project-card">
                <div className="project-image">
                  <img
                    src="/assets/images/img(2).jpg"
                    alt="Modern Living Room"
                  />
                  <div className="project-overlay">
                    <h3>Modern Living Space</h3>
                    <p>Residential • Manhattan</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="project-card">
                <div className="project-image">
                  <img
                    src="/assets/images/img(4).jpg"
                    alt="Luxury Bedroom"
                  />
                  <div className="project-overlay">
                    <h3>Serene Bedroom Retreat</h3>
                    <p>Residential • Brooklyn</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Testimonial Section */}
          <div className="row">
            <div className="col-lg-12 tour-container">
              <div className="tour-main">
                <div className="tour-info mb-5">
                  <h3>Explore Our Signature Projects</h3>
                  <p>
                    Take a 360° virtual walkthrough of our most stunning interior
                    transformations. Experience each space as if you were there
                    exploring textures, layouts, and finishes in immersive
                    detail. Every project reflects our dedication to thoughtful
                    design, precise craftsmanship, and a refined aesthetic that
                    elevates everyday living.
                  </p>
                </div>
                <div className="tour-video mb-5">
                  <img
                    src="/assets/images/img(9).jpg"
                    alt="Virtual Tour Preview"
                  />
                  <a
                    className="play-button"
                    data-type="pano"
                    data-src="index-360.html"
                  >
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 80 80"
                      fill="none"
                    >
                      <circle
                        cx="40"
                        cy="40"
                        r="40"
                        fill="white"
                        opacity="0.95"
                      />
                      <path
                        d="M32 25L55 40L32 55V25Z"
                        fill="#FF6B35"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-12">
              <div className="service-testimonial-wrapper">
                <div className="testimonial-quote-icon">
                  <i className="bi bi-quote"></i>
                </div>
                <blockquote className="testimonial-quote">
                  "Oakwell transformed our entire home beyond our wildest dreams.
                  Their attention to detail, creative solutions, and ability to
                  truly understand our lifestyle made the process enjoyable from
                  start to finish. We now have a space that feels uniquely
                  ours."
                </blockquote>
                <div className="testimonial-author-info">
                  <img src="/assets/images/avatar-big1.jpg" alt="Client" />
                  <div>
                    <h4>Sarah Johnson</h4>
                    <span>Homeowner, Manhattan</span>
                  </div>
                </div>
              </div>
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
