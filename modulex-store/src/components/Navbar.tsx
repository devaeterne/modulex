"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { pushAnalyticsEvent } from "@/lib/analytics/events";
import type { ResolvedStoreChromeItem } from "@/lib/store/chrome/destinations";

export default function Navbar({
  companyName = "Oakwell Cabinetry",
  logoUrl,
  galleryReady = false,
  navigationItems,
}: {
  companyName?: string;
  logoUrl?: string | null;
  galleryReady?: boolean;
  navigationItems: ResolvedStoreChromeItem[];
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const lastYRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsMobileOpen(false), 0);
    return () => window.clearTimeout(timeout);
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

  const handleContactClick = () => {
    pushAnalyticsEvent("contact_click", { context: "navbar" });
    handleLinkClick();
  };

  const lightLogo = logoUrl || "/assets/images/logo.png";
  const darkLogo = logoUrl || "/assets/images/logo-white.png";
  const visibleNavigationItems = navigationItems.filter(
    (item) => item.destinationKey !== "gallery" || galleryReady,
  );

  return (
    <nav ref={navRef} className={`navbar navbar-expand-lg custom-navbar ${isMobileOpen ? "menu-open" : ""}`}>
      <div className="container">
        <Link href="/" className="logo" onClick={handleLinkClick}>
          <img src={lightLogo} className="logo" alt={companyName} />
          <img src={darkLogo} className="logo-dark" alt={companyName} />
        </Link>

        <ul className={`navbar-nav custom-nav ${isMobileOpen ? "active" : ""}`} id="mobileNav">
          {visibleNavigationItems.map((item) => (
            <li
              className={`nav-item ${item.destinationKey === "home" ? "home-dd" : item.destinationKey === "about" ? "about-dd" : ""}`.trim()}
              key={item.id}
            >
              <Link className="nav-link" href={item.href} onClick={handleLinkClick}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="d-flex align-items-center gap-2">
          <Link
            href="/account"
            aria-label="Account"
            title="Account"
            onClick={handleLinkClick}
            className="d-inline-flex align-items-center justify-content-center text-decoration-none"
            style={{ width: 42, height: 42, borderRadius: "50%", border: "1px solid currentColor", color: "inherit" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M4.5 20c.8-3.7 3.2-5.5 7.5-5.5s6.7 1.8 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
          <Link href="/contact" className="cta-nav" onClick={handleContactClick}>Contact Us</Link>
        </div>
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
