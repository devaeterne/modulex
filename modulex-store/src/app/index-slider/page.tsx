import HeroSlider from "@/components/Home/HeroSlider";
import RecentProjects from "@/components/Home/RecentProjects";
import Stats from "@/components/Home/Stats";
import VirtualTour from "@/components/Home/VirtualTour";
import Testimonials from "@/components/Home/Testimonials";
import FAQ from "@/components/Home/FAQ";
import Contact from "@/components/Home/Contact";
import Link from "next/link";

export default function IndexSlider() {
  return (
    <>
      <HeroSlider />

      {/* Services Section */}
      <section className="services" id="services">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Our Services</span>
            <h2>What We Offer</h2>
            <p>
              From concept to completion, we provide comprehensive interior
              design solutions tailored to your vision
            </p>
          </div>
          <div className="services-grid">
            <div className="service-card">
              <div className="service-icon">
                <i className="bi bi-house-door"></i>
              </div>
              <h3>Residential Design</h3>
              <p>
                Create your dream home with personalized interior solutions
                that blend comfort, style, and functionality.
              </p>
              <Link href="#" className="service-link">
                Learn more <i className="bi bi-chevron-right"></i>
              </Link>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <i className="bi bi-building"></i>
              </div>
              <h3>Commercial Spaces</h3>
              <p>
                Transform offices, retail spaces, and hospitality venues into
                inspiring environments that drive success.
              </p>
              <Link href="#" className="service-link">
                Learn more <i className="bi bi-chevron-right"></i>
              </Link>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <i className="bi bi-stars"></i>
              </div>
              <h3>Renovation</h3>
              <p>
                Breathe new life into existing spaces with thoughtful
                redesigns that maximize potential and value.
              </p>
              <Link href="#" className="service-link">
                Learn more <i className="bi bi-chevron-right"></i>
              </Link>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <i className="bi bi-palette"></i>
              </div>
              <h3>Color Consultation</h3>
              <p>
                Expert guidance on color palettes and finishes to create the
                perfect mood and atmosphere.
              </p>
              <Link href="#" className="service-link">
                Learn more <i className="bi bi-chevron-right"></i>
              </Link>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <i className="bi bi-lamp"></i>
              </div>
              <h3>Furniture Selection</h3>
              <p>
                Curated furniture and decor pieces that perfectly complement
                your space and lifestyle.
              </p>
              <Link href="#" className="service-link">
                Learn more <i className="bi bi-chevron-right"></i>
              </Link>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <i className="bi bi-bounding-box"></i>
              </div>
              <h3>Space Planning</h3>
              <p>
                Optimize your layout with strategic planning that enhances
                flow, function, and aesthetics.
              </p>
              <Link href="#" className="service-link">
                Learn more <i className="bi bi-chevron-right"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Stats />

      <RecentProjects />

      <section className="banner-section">
        <div className="container">
          <div className="banner-container">
            <div className="banner-content">
              <div className="banner-text">
                <h3>Special Offer: Get 20% Off Your First Project</h3>
                <p>
                  Limited time offer for new clients. Transform your space
                  with our award-winning designs.
                </p>
              </div>
              <a href="#contact" className="banner-btn">
                Claim Offer Now
              </a>
            </div>
          </div>
        </div>
      </section>

      <VirtualTour />

      <Testimonials />

      <FAQ />

      <Contact />

      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Transform Your Space?</h2>
          <p>
            Let&apos;s create something extraordinary together. Schedule a
            free consultation and turn your vision into a thoughtfully
            designed reality.
          </p>
          <div className="cta-buttons">
            <a href="#contact" className="btn-white">
              Schedule Consultation
            </a>
            <a href="tel:+15551234567" className="btn-outline">
              Call Us Now
            </a>
          </div>
        </div>
      </section>

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
                    <Link href="/blog-detail">
                      Embracing Minimalism: Less is More in 2026
                    </Link>
                  </h3>
                  <p className="blog-excerpt">
                    Discover how minimalist design continues to evolve,
                    creating serene spaces that prioritize function and beauty
                    without the clutter.
                  </p>
                  <Link href="/blog-detail" className="blog-link">
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
                    <Link href="/blog-detail">
                      Sustainable Materials: Building a Greener Home
                    </Link>
                  </h3>
                  <p className="blog-excerpt">
                    Learn about eco-friendly materials and sustainable
                    practices that can transform your home while protecting
                    our planet.
                  </p>
                  <Link href="/blog-detail" className="blog-link">
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
                    <Link href="/blog-detail">
                      The Psychology of Color in Interior Design
                    </Link>
                  </h3>
                  <p className="blog-excerpt">
                    Understand how different colors affect mood and behavior,
                    and how to use this knowledge in your design projects.
                  </p>
                  <Link href="/blog-detail" className="blog-link">
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
