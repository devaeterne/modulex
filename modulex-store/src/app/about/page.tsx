import Link from "next/link";

export default function About() {
  return (
    <>
      {/* Page Header */}
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(7).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h2>About us</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">About us</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* About Story Section */}
      <section className="about-story grad">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <div className="about-images">
                <div className="about-img-main">
                  <img
                    src="/assets/images/floating(2).jpg"
                    alt="Interior Design Studio"
                  />
                </div>
                <div className="about-img-overlay">
                  <img
                    src="/assets/images/gallery(1).jpg"
                    alt="Design Details"
                  />
                </div>
                <div className="experience-badge">
                  <h3>15+</h3>
                  <p>
                    Years of<br />
                    Excellence
                  </p>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="about-content">
                <span className="section-tag p-0">Our Story</span>
                <h2>Where Vision Meets Reality</h2>
                <p>
                  Founded in 2010, Oakwell began with a simple yet powerful
                  vision: to create interiors that don&apos;t just look
                  beautiful, but feel like home. What started as a small studio
                  with big dreams has grown into an award-winning design firm
                  trusted by hundreds of clients across the country.
                </p>
                <p>
                  Our approach combines timeless design principles with
                  contemporary aesthetics, always putting your needs and vision
                  at the forefront. We believe that great design isn&apos;t
                  about following trends—it&apos;s about creating spaces that
                  resonate with who you are and how you live.
                </p>
                <p>
                  Every project we undertake is a collaboration, a journey where
                  your dreams meet our expertise. From the initial concept to
                  the final reveal, we&apos;re dedicated to exceeding
                  expectations and creating interiors that inspire for years to
                  come.
                </p>
                <div className="signature-section">
                  <div className="signature">
                    <img
                      src="/assets/images/avatar2.jpg"
                      alt="Founder"
                    />
                    <div>
                      <h3>Sarah Mitchell</h3>
                      <p>Founder & Creative Director</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="process-section">
        <div className="container">
          <div className="section-header text-center pt-4">
            <span className="section-tag">Our Process</span>
            <h2>How We Work</h2>
            <p>
              A proven methodology that brings your vision to life with
              precision and care
            </p>
          </div>
          <div className="process-timeline">
            <div className="process-step">
              <div className="step-number">01</div>
              <div className="step-content">
                <div className="step-icon">
                  <i className="bi bi-chat-dots"></i>
                </div>
                <h3>Discovery & Consultation</h3>
                <p>
                  We begin by understanding your lifestyle, preferences, and
                  goals. Through in-depth conversations, we gather inspiration
                  and establish a clear vision for your space.
                </p>
              </div>
            </div>
            <div className="process-step">
              <div className="step-number">02</div>
              <div className="step-content">
                <div className="step-icon">
                  <i className="bi bi-palette"></i>
                </div>
                <h3>Concept Development</h3>
                <p>
                  Our team creates mood boards, sketches, and 3D renderings that
                  visualize your space. We present color palettes, materials,
                  and furnishing options for your approval.
                </p>
              </div>
            </div>
            <div className="process-step">
              <div className="step-number">03</div>
              <div className="step-content">
                <div className="step-icon">
                  <i className="bi bi-rulers"></i>
                </div>
                <h3>Design & Planning</h3>
                <p>
                  With your feedback, we refine the design and create detailed
                  plans. This includes space planning, furniture layout,
                  lighting design, and material specifications.
                </p>
              </div>
            </div>
            <div className="process-step">
              <div className="step-number">04</div>
              <div className="step-content">
                <div className="step-icon">
                  <i className="bi bi-hammer"></i>
                </div>
                <h3>Implementation</h3>
                <p>
                  We coordinate with contractors, source materials, and oversee
                  installation. Our project managers ensure everything is
                  executed flawlessly and on schedule.
                </p>
              </div>
            </div>
            <div className="process-step">
              <div className="step-number">05</div>
              <div className="step-content">
                <div className="step-icon">
                  <i className="bi bi-star"></i>
                </div>
                <h3>Final Reveal</h3>
                <p>
                  The moment we&apos;ve all been waiting for. We style your
                  space with final touches and accessories, then reveal your
                  transformed interior ready to be enjoyed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="team-section pt-0">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Our Team</span>
            <h2>Meet the Experts</h2>
            <p>
              Talented designers passionate about creating spaces that inspire
            </p>
          </div>
          <div className="team-grid">
            <div className="team-member" data-scroll data-scroll-speed="0.8">
              <div className="member-image">
                <img
                  src="/assets/images/avatar-big1.jpg"
                  alt="Sarah Mitchell"
                />
                <div className="member-overlay">
                  <div className="social-links">
                    <a href="#">
                      <i className="bi bi-linkedin"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-instagram"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-envelope"></i>
                    </a>
                  </div>
                </div>
              </div>
              <div className="member-info">
                <h3>Sarah Mitchell</h3>
                <p className="member-role">Founder & Creative Director</p>
                <p className="member-bio">
                  With over 15 years of experience, Sarah leads our design
                  vision with a perfect blend of creativity and practicality.
                </p>
              </div>
            </div>
            <div className="team-member" data-scroll data-scroll-speed="1">
              <div className="member-image">
                <img
                  src="/assets/images/avatar-big2.jpg"
                  alt="David Chen"
                />
                <div className="member-overlay">
                  <div className="social-links">
                    <a href="#">
                      <i className="bi bi-linkedin"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-instagram"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-envelope"></i>
                    </a>
                  </div>
                </div>
              </div>
              <div className="member-info">
                <h3>David Chen</h3>
                <p className="member-role">Senior Interior Designer</p>
                <p className="member-bio">
                  David specializes in contemporary residential design, bringing
                  fresh Oakwelltives to every project.
                </p>
              </div>
            </div>
            <div className="team-member" data-scroll data-scroll-speed="1.2">
              <div className="member-image">
                <img
                  src="/assets/images/avatar-big3.jpg"
                  alt="Emma Rodriguez"
                />
                <div className="member-overlay">
                  <div className="social-links">
                    <a href="#">
                      <i className="bi bi-linkedin"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-instagram"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-envelope"></i>
                    </a>
                  </div>
                </div>
              </div>
              <div className="member-info">
                <h3>Emma Rodriguez</h3>
                <p className="member-role">Commercial Design Lead</p>
                <p className="member-bio">
                  Emma transforms commercial spaces into inspiring environments
                  that drive business success.
                </p>
              </div>
            </div>
            <div className="team-member" data-scroll data-scroll-speed="1.4">
              <div className="member-image">
                <img
                  src="/assets/images/avatar-big4.jpg"
                  alt="Michael Park"
                />
                <div className="member-overlay">
                  <div className="social-links">
                    <a href="#">
                      <i className="bi bi-linkedin"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-instagram"></i>
                    </a>
                    <a href="#">
                      <i className="bi bi-envelope"></i>
                    </a>
                  </div>
                </div>
              </div>
              <div className="member-info">
                <h3>Michael Park</h3>
                <p className="member-role">Project Manager</p>
                <p className="member-bio">
                  Michael ensures every project runs smoothly from concept to
                  completion with meticulous attention to detail.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="why-choose">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <div className="why-content">
                <span className="section-tag p-0">Why Choose Us</span>
                <h2>What Sets Us Apart</h2>
                <p>
                  We&apos;re not just designers—we&apos;re storytellers,
                  problem-solvers, and dream-makers. Here&apos;s what makes
                  working with Oakwell different:
                </p>
                <div className="why-list">
                  <div className="why-item">
                    <div className="why-text">
                      <h3>Personalized Approach</h3>
                      <p>
                        No cookie-cutter solutions. Every design is tailored to
                        your unique needs and lifestyle.
                      </p>
                    </div>
                  </div>
                  <div className="why-item">
                    <div className="why-text">
                      <h3>Transparent Process</h3>
                      <p>
                        Clear communication, detailed timelines, and no hidden
                        costs. You&apos;re informed every step of the way.
                      </p>
                    </div>
                  </div>
                  <div className="why-item">
                    <div className="why-text">
                      <h3>Sustainable Practices</h3>
                      <p>
                        We prioritize eco-friendly materials and sustainable
                        design solutions for a better tomorrow.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="why-images">
                <div className="why-grid">
                  <img
                    src="/assets/images/floating(2).jpg"
                    alt="Design Detail"
                  />
                  <img
                    src="/assets/images/floating(3).jpg"
                    alt="Interior Space"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Awards Section */}
      <section className="awards-section">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Recognition</span>
            <h2>Awards & Achievements</h2>
            <p>
              Honored by industry leaders for our commitment to excellence
            </p>
          </div>
          <div className="awards-grid">
            <div className="award-item" data-scroll data-scroll-speed="0.8">
              <div className="award-icon">
                <i className="bi bi-trophy"></i>
              </div>
              <h3>Best Residential Design 2024</h3>
              <p>Interior Design Excellence Awards</p>
            </div>
            <div className="award-item" data-scroll data-scroll-speed="1">
              <div className="award-icon">
                <i className="bi bi-award"></i>
              </div>
              <h3>Innovation in Design 2023</h3>
              <p>National Design Association</p>
            </div>
            <div className="award-item" data-scroll data-scroll-speed="1.2">
              <div className="award-icon">
                <i className="bi bi-star"></i>
              </div>
              <h3>Studio of the Year 2023</h3>
              <p>Architectural Digest</p>
            </div>
            <div className="award-item" data-scroll data-scroll-speed="1.4">
              <div className="award-icon">
                <i className="bi bi-gem"></i>
              </div>
              <h3>Sustainable Design Leader 2022</h3>
              <p>Green Building Council</p>
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
