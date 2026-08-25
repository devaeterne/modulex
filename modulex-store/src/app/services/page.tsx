import Link from "next/link";

export default function Services() {
  return (
    <>
      {/* Page Header */}
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(5).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h2>Our Services</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Services</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section
        className="service-detail-section pb-3"
        aria-label="Services Overview"
      >
        <div className="container">
          {/* Service Intro */}
          <div className="row mb-5">
            <div className="col-lg-6 mb-4 mb-lg-0">
              <div className="service-intro-content">
                <span className="service-subtitle">
                  Comprehensive Design Solutions
                </span>
                <h2 className="service-main-title">
                  Tailored Interior Architecture for Every Need
                </h2>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="service-intro-text">
                <p>
                  At Oakwell, we offer a full spectrum of interior design
                  services, from initial concept development to final styling.
                  Whether you're looking to refresh a single room or redesign an
                  entire property, our team is dedicated to bringing your vision
                  to life.
                </p>
                <p>
                  We blend creativity with technical expertise to deliver
                  functional, beautiful spaces that enhance your lifestyle and
                  business goals.
                </p>
              </div>
            </div>
          </div>

          {/* Services Grid */}
          <div className="row g-4 pt-4 mb-5">
            {/* Service 1: Residential */}
            <div className="col-lg-6">
              <div className="project-card h-100">
                <div className="project-image" style={{ height: "350px" }}>
                  <img
                    src="/assets/images/img(2).jpg"
                    alt="Residential Design"
                    style={{ height: "100%", objectFit: "cover" }}
                  />
                  <div className="project-overlay">
                    <h3>Residential Design</h3>
                    <p>
                      Custom homes, apartments, and renovations tailored to your
                      lifestyle.
                    </p>
                    <Link
                      href="/services/residential"
                      className="btn-link text-white mt-3"
                    >
                      Learn More{" "}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Service 2: Commercial */}
            <div className="col-lg-6">
              <div className="project-card h-100">
                <div className="project-image" style={{ height: "350px" }}>
                  <img
                    src="/assets/images/img(10).jpg"
                    alt="Commercial Design"
                    style={{ height: "100%", objectFit: "cover" }}
                  />
                  <div className="project-overlay">
                    <h3>Commercial & Office</h3>
                    <p>
                      Productive workspaces and corporate environments that
                      reflect your brand identity.
                    </p>
                    <Link href="#" className="btn-link text-white mt-3">
                      Learn More{" "}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Service 3: Hospitality */}
            <div className="col-lg-6">
              <div className="project-card h-100">
                <div className="project-image" style={{ height: "350px" }}>
                  <img
                    src="/assets/images/img(6).jpg"
                    alt="Hospitality Design"
                    style={{ height: "100%", objectFit: "cover" }}
                  />
                  <div className="project-overlay">
                    <h3>Hospitality & Retail</h3>
                    <p>
                      Engaging customer experiences for hotels, restaurants, and
                      retail spaces.
                    </p>
                    <Link href="#" className="btn-link text-white mt-3">
                      Learn More{" "}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Service 4: Virtual Design */}
            <div className="col-lg-6">
              <div className="project-card h-100">
                <div className="project-image" style={{ height: "350px" }}>
                  <img
                    src="/assets/images/img(9).jpg"
                    alt="Virtual Design"
                    style={{ height: "100%", objectFit: "cover" }}
                  />
                  <div className="project-overlay">
                    <h3>360° Virtual Design</h3>
                    <p>
                      Immersive visualization and virtual tours to experience
                      your space before it's built.
                    </p>
                    <a
                      href="index-360.html"
                      className="btn-link text-white mt-3"
                    >
                      Explore Now{" "}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Design Packages */}
          <div className="row mb-5">
            <div className="col-12 text-center mb-5">
              <span className="service-subtitle">Pricing Options</span>
              <h2 className="section-title">Design Packages</h2>
            </div>

            <div className="col-lg-4 mb-4">
              <div
                className="service-feature-box p-5 h-100"
                style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              >
                <div className="feature-icon-wrap mb-4">
                  <i className="bi bi-chat-square-text"></i>
                </div>
                <h3>Consultation</h3>
                <p className="mb-4">
                  Perfect for DIYers needing professional guidance.
                </p>
                <ul
                  className="list-unstyled text-start mb-4"
                  style={{ opacity: 0.8 }}
                >
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> 2-Hour In-Home Visit
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Design Assessment
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Color Recommendations
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Shopping List
                  </li>
                </ul>
                <Link
                  href="/contact"
                  className="btn-secondary dark d-block text-center"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="col-lg-4 mb-4">
              <div
                className="service-feature-box p-5 h-100"
                style={{ background: "var(--dark-brown)", color: "white" }}
              >
                <div className="feature-icon-wrap mb-4 text-white">
                  <i className="bi bi-pencil-square"></i>
                </div>
                <h3 className="text-white">Design Concept</h3>
                <p className="mb-4" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Visualizing your space with a complete plan.
                </p>
                <ul
                  className="list-unstyled text-start mb-4"
                  style={{ opacity: 0.9 }}
                >
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Everything in
                    Consultation
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Mood Boards
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> 2D Floor Plans
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Furniture Selection
                  </li>
                </ul>
                <Link
                  href="/contact"
                  className="btn-primary d-block text-center"
                >
                  Most Popular
                </Link>
              </div>
            </div>

            <div className="col-lg-4 mb-4">
              <div
                className="service-feature-box p-5 h-100"
                style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              >
                <div className="feature-icon-wrap mb-4">
                  <i className="bi bi-house-door"></i>
                </div>
                <h3>Full Service</h3>
                <p className="mb-4">Turnkey solution from start to finish.</p>
                <ul
                  className="list-unstyled text-start mb-4"
                  style={{ opacity: 0.8 }}
                >
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Complete Design Plan
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> 3D Renderings
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Procurement &
                    Installation
                  </li>
                  <li className="mb-2">
                    <i className="bi bi-check2 me-2"></i> Project Management
                  </li>
                </ul>
                <Link
                  href="/contact"
                  className="btn-secondary dark d-block text-center"
                >
                  Get Started
                </Link>
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
