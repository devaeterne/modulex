import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="footer-content">
        {/* Brand */}
        <div className="footer-brand">
          <div className="logo mb-3">
            <img
              src="/assets/images/logo-white.png"
              className="h-100"
              alt="Oakwell"
            />
          </div>
          <p>
            Award-winning interior design studio creating timeless spaces that
            inspire and delight. Serving residential and commercial clients
            worldwide.
          </p>

          <div className="social-links">
            <a
              href="https://facebook.com/"
              target="_blank"
              aria-label="Facebook"
            >
              <i className="bi bi-facebook"></i>
            </a>
            <a
              href="https://instagram.com/"
              target="_blank"
              aria-label="Instagram"
            >
              <i className="bi bi-instagram"></i>
            </a>
            <a href="https://twitter.com/" target="_blank" aria-label="Twitter">
              <i className="bi bi-twitter-x"></i>
            </a>
            <a
              href="https://linkedin.com/"
              target="_blank"
              aria-label="LinkedIn"
            >
              <i className="bi bi-linkedin"></i>
            </a>
          </div>
        </div>
        {/* Services */}
        <div className="footer-links">
          <h3>Services</h3>
          <ul>
            <li>
              <Link href="/services/residential">Residential Interior</Link>
            </li>
            <li>
              <Link href="/gallery">Commercial Projects</Link>
            </li>
            <li>
              <Link href="/gallery">Renovation & Styling</Link>
            </li>
            <li>
              <Link href="/index-360">360° Virtual Tour</Link>
            </li>
          </ul>
        </div>
        {/* Company */}
        <div className="footer-links">
          <h3>Company</h3>
          <ul>
            <li>
              <Link href="/about">About Us</Link>
            </li>
            <li>
              <Link href="/blog">Insights & Blog</Link>
            </li>
            <li>
              <Link href="/gallery">Our Portfolio</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </div>
        {/* Contact */}
        <div className="footer-links">
          <h3>Contact</h3>
          <ul>
            <li>
              <a href="mailto:hello@Oakwell.design">hello@Oakwell.design</a>
            </li>
            <li>
              <a href="tel:+15551234567">+1 (555) 123-4567</a>
            </li>
            <li>
              <span>123 Design Street</span>
            </li>
            <li>
              <span>New York, NY 10001</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <p>
          &copy; 2026 Oakwell Cabinetry Design. All rights reserved. Developed by{" "}
          <a
            href="https://www.dasoft.me/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Da Software
          </a>
        </p>
      </div>
    </footer>
  );
}
