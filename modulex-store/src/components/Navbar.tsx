"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function Navbar({
  companyName = "Oakwell Cabinetry",
  logoUrl,
}: {
  companyName?: string;
  logoUrl?: string | null;
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const lastYRef = useRef(0);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let ticking = false;

    const updateNavbar = () => {
      const currentY = window.scrollY;
      const lastY = lastYRef.current;
      if (currentY > 50) {
        nav.classList.add("scrolled", "is-scrolled");
        if (currentY > lastY) {
          nav.classList.add("scroll-down");
          nav.classList.remove("scroll-up");
        } else {
          nav.classList.add("scroll-up");
          nav.classList.remove("scroll-down");
        }
      } else {
        nav.classList.remove("scrolled", "is-scrolled", "scroll-down");
        nav.classList.add("scroll-up");
      }
      lastYRef.current = currentY;
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateNavbar);
        ticking = true;
      }
    };

    updateNavbar();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  const closeAllDropdowns = () => {
    navRef.current?.querySelectorAll(".nav-item.show-dropdown").forEach((item) => item.classList.remove("show-dropdown"));
  };

  const handleLinkClick = () => {
    closeAllDropdowns();
    setIsMobileOpen(false);
  };

  const lightLogo = logoUrl || "/assets/images/logo.png";
  const darkLogo = logoUrl || "/assets/images/logo-white.png";

  return (
    <nav ref={navRef} className={`navbar navbar-expand-lg custom-navbar ${isMobileOpen ? "menu-open" : ""}`}>
      <div className="container">
        <Link href="/" className="logo" onClick={handleLinkClick}>
          <img src={lightLogo} className="logo" alt={companyName} />
          <img src={darkLogo} className="logo-dark" alt={companyName} />
        </Link>

        <ul className={`navbar-nav custom-nav ${isMobileOpen ? "active" : ""}`} id="mobileNav">
          <li className="nav-item home-dd"><Link className="nav-link" href="/" onClick={handleLinkClick}>Home</Link></li>
          <li className="nav-item about-dd"><Link className="nav-link" href="/about" onClick={handleLinkClick}>About</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/products" onClick={handleLinkClick}>Products</Link></li>
          <li className="nav-item services-dd"><Link className="nav-link" href="/services" onClick={handleLinkClick}>Services</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/gallery" onClick={handleLinkClick}>Gallery</Link></li>
          <li className="nav-item nav-new-dd"><Link className="nav-link" href="/blog" onClick={handleLinkClick}>Blog</Link></li>
        </ul>

        <Link href="/contact" className="cta-nav" onClick={handleLinkClick}>Contact Us</Link>
        <button
          type="button"
          className={`burger-menu ${isMobileOpen ? "open" : ""}`}
          id="burgerMenu"
          onClick={() => setIsMobileOpen((open) => !open)}
          aria-expanded={isMobileOpen}
          aria-controls="mobileNav"
          aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
          style={{ border: 0, background: "transparent", padding: 0 }}
        >
          <span className={isMobileOpen ? "rotate1" : ""}></span>
          <span className={isMobileOpen ? "fade" : ""}></span>
          <span className={isMobileOpen ? "rotate2" : ""}></span>
        </button>
      </div>
    </nav>
  );
}
