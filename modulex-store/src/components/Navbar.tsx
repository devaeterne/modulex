"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useScrollStore } from "@/store/useScrollStore";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const scroll = useScrollStore((state) => state.scroll);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const lastYRef = useRef(0);
  const [hasContactSection, setHasContactSection] = useState(false);

  useEffect(() => {
    const checkContact = () => {
      const contactSection = document.getElementById("contact");
      setHasContactSection(!!contactSection);
    };

    checkContact();
    const timer = setTimeout(checkContact, 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Close mobile menu on route change
  useEffect(() => {
    // Reset mobile menu
    setIsMobileOpen(false);
  }, [pathname]);

  // Handle scroll effect
  useEffect(() => {
    if (!scroll) return;

    const nav = navRef.current;

    const handleScroll = ({ scroll: s }: any) => {
      const currentY = s.y;
      const lastY = lastYRef.current;
      const isScrolled = currentY > 50;

      if (nav) {
        if (currentY > 50) {
          // Add scrolled class
          nav.classList.add("scrolled");
          nav.classList.add("is-scrolled");

          // Toggle direction classes
          if (currentY > lastY) {
            // Scrolling Down
            nav.classList.add("scroll-down");
            nav.classList.remove("scroll-up");
          } else {
            // Scrolling Up
            nav.classList.add("scroll-up");
            nav.classList.remove("scroll-down");
          }
        } else {
          // At top - remove all classes
          nav.classList.remove("scrolled", "is-scrolled", "scroll-down", "scroll-up");
        }
      }
      lastYRef.current = currentY;
    };

    scroll.on("scroll", handleScroll);

    return () => {
      if (scroll) {
        scroll.off("scroll", handleScroll);
      }
    };
  }, [scroll]);

  // Reset navbar on pathname change
  useEffect(() => {
    const nav = navRef.current;
    if (nav) {
      nav.classList.remove('scrolled', 'is-scrolled', 'scroll-down');
      nav.classList.add('scroll-up');
      // Force reset transform if it was modified by CSS transitions/animations
      nav.style.transform = '';
      lastYRef.current = 0;
    }
  }, [pathname]);

  const toggleMobileMenu = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const closeAllDropdowns = () => {
    if (navRef.current) {
      const allDropdowns = navRef.current.querySelectorAll('.nav-item.show-dropdown');
      allDropdowns.forEach((item) => {
        item.classList.remove('show-dropdown');
      });
    }
  };

  const toggleDropdown = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Only for mobile
    if (window.innerWidth <= 1024) {
      e.stopPropagation(); // Stop bubbling
      e.preventDefault();

      const currentLink = e.currentTarget;
      const currentListItem = currentLink.closest('.nav-item');

      if (!currentListItem) return;

      // Close other dropdowns
      if (navRef.current) {
        const allDropdowns = navRef.current.querySelectorAll('.nav-item.show-dropdown');
        allDropdowns.forEach((item) => {
          if (item !== currentListItem) {
            item.classList.remove('show-dropdown');
          }
        });
      }

      // Toggle class on the list item (parent)
      currentListItem.classList.toggle('show-dropdown');
    }
  };

  const handleLinkClick = () => {
    // Only for mobile
    if (window.innerWidth <= 1024) {
      closeAllDropdowns();
    }
  };

  return (
    <nav ref={navRef} className={`navbar navbar-expand-lg custom-navbar ${isMobileOpen ? "menu-open" : ""}`}>
      <div className="container">
        <Link href="/" className="logo">
          <img src="/assets/images/logo.png" className="logo" alt="logo" />
          <img
            src="/assets/images/logo-white.png"
            className="logo-dark"
            alt="logo"
          />
        </Link>
        <ul className={`navbar-nav custom-nav ${isMobileOpen ? "active" : ""}`} id="mobileNav">
          <li className="nav-item home-dd">
            <a className="nav-link" href="/" >
              Home
            </a>
          </li>
          <li className="nav-item about-dd">
            <a className="nav-link" href="/about" >
              About
            </a>
          </li>
          <li className="nav-item">
            <Link className="nav-link" href="/shop" onClick={handleLinkClick}>
              Products
            </Link>
          </li>
          <li className="nav-item services-dd">
            <a className="nav-link" href="/services" >
              Services
            </a>
          </li>
          <li className="nav-item">
            <Link className="nav-link" href="/gallery" onClick={handleLinkClick}>
              Gallery
            </Link>
          </li>
          <li className="nav-item nav-new-dd">
            <a className="nav-link" href="/blog" onClick={toggleDropdown}>
              Blog
            </a>

          </li>

        </ul>
        {hasContactSection ? (
          <a href="/contact" className="cta-nav">
            Contact Us
          </a>
        ) : (
          <Link href="/contact" className="cta-nav">
            Contact Us
          </Link>
        )}
        {/* Burger */}
        <div
          className={`burger-menu ${isMobileOpen ? "open" : ""}`}
          id="burgerMenu"
          onClick={toggleMobileMenu}
        >
          <span className={isMobileOpen ? "rotate1" : ""}></span>
          <span className={isMobileOpen ? "fade" : ""}></span>
          <span className={isMobileOpen ? "rotate2" : ""}></span>
        </div>
      </div>
    </nav >
  );
}
