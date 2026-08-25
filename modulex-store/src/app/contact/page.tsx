import Link from "next/link";

export default function Contact() {
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
                <h2>Contact us</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Contact us</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="pb-0" aria-label="map">
        <div className="container">
          <div className="contact-map ratio ratio-30x9">
            <iframe
              src="https://www.google.com/maps?q=Uluwatu,Bali,Indonesia&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              aria-label="Vistra Villa Location"
            ></iframe>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="contact-section" id="contact">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Contact Us</span>
            <h2>Let&apos;s Start Your Project</h2>
            <p>
              Get in touch with our team and let&apos;s bring your vision to
              life
            </p>
          </div>
          <div className="contact-container">
            <div className="contact-info">
              <div className="contact-intro">
                <h3>Get in Touch</h3>
                <p>
                  Ready to transform your space? Fill out the form and our
                  design team will reach out within 24 hours to schedule your
                  free consultation.
                </p>
              </div>

              <div className="contact-details">
                <div className="contact-item">
                  <div className="contact-icon">
                    <i className="bi bi-geo-alt"></i>
                  </div>
                  <div className="contact-text">
                    <h4>Visit Our Studio</h4>
                    <p>
                      123 Design Street<br />
                      New York, NY 10001
                    </p>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <i className="bi bi-telephone"></i>
                  </div>
                  <div className="contact-text">
                    <h4>Call Us</h4>
                    <p>
                      +1 (555) 123-4567<br />
                      Mon-Fri, 9AM-6PM EST
                    </p>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <i className="bi bi-envelope"></i>
                  </div>
                  <div className="contact-text">
                    <h4>Email Us</h4>
                    <p>
                      hello@Oakwell.design<br />
                      We reply within 24 hours
                    </p>
                  </div>
                </div>
                <div className="contact-item">
                  <div className="contact-icon">
                    <i className="bi bi-clock"></i>
                  </div>
                  <div className="contact-text">
                    <h4>Office Hours</h4>
                    <p>
                      Monday - Friday: 9AM - 6PM<br />
                      Saturday: 10AM - 4PM
                    </p>
                  </div>
                </div>
              </div>
              <div className="contact-social">
                <h4>Follow Us</h4>
                <div className="social-links-contact">
                  <a href="#" aria-label="Facebook">
                    <i className="bi bi-facebook"></i>
                  </a>
                  <a href="#" aria-label="Instagram">
                    <i className="bi bi-instagram"></i>
                  </a>
                  <a href="#" aria-label="Twitter">
                    <i className="bi bi-twitter-x"></i>
                  </a>
                  <a href="#" aria-label="Pinterest">
                    <i className="bi bi-pinterest"></i>
                  </a>
                  <a href="#" aria-label="LinkedIn">
                    <i className="bi bi-linkedin"></i>
                  </a>
                </div>
              </div>
            </div>
            <div className="contact-form-wrapper">
              <form className="contact-form">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="firstName">First Name *</label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      required
                      placeholder="John"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lastName">Last Name *</label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      required
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="email">Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone Number</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="projectType">Project Type *</label>
                  <select id="projectType" name="projectType" required>
                    <option value="">Select a project type</option>
                    <option value="residential">Residential Design</option>
                    <option value="commercial">Commercial Space</option>
                    <option value="renovation">Renovation</option>
                    <option value="consultation">Consultation Only</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="budget">Budget Range</label>
                  <select id="budget" name="budget">
                    <option value="">Select your budget</option>
                    <option value="5-10k">$5,000 - $10,000</option>
                    <option value="10-25k">$10,000 - $25,000</option>
                    <option value="25-50k">$25,000 - $50,000</option>
                    <option value="50-100k">$50,000 - $100,000</option>
                    <option value="100k+">$100,000+</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="message">Tell us about your project *</label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    required
                    placeholder="Describe your vision, timeline, and any specific requirements..."
                  ></textarea>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" name="newsletter" />
                    <span>Send me design tips and project inspiration</span>
                  </label>
                </div>
                <button type="submit" className="btn-submit">
                  <span>Send Message</span>
                  <span className="submit-icon">
                    <i className="bi bi-chevron-right"></i>
                  </span>
                </button>
              </form>
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
            <a href="tel:+15551234567" className="btn-outline">
              Call Us Now
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
