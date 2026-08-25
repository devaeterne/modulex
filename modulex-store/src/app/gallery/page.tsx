"use client";

import Link from "next/link";
import { useState } from "react";
import { useLightboxStore } from "@/store/useLightboxStore";

// Gallery Items Data
const galleryItems = [
  {
    id: 1,
    category: "360",
    type: "image",
    src: "/assets/images/img(1).jpg",
    title: "Minimalist Haven",
    subtitle: "Residential • Living Room",
    link: "/gallery/detail",
  },
  {
    id: 2,
    category: "interior",
    type: "image",
    src: "/assets/images/img(2).jpg",
    title: "Urban Sanctuary",
    subtitle: "Residential • Bedroom",
    link: "/gallery/detail",
  },
  {
    id: 3,
    category: "interior",
    type: "image",
    src: "/assets/images/img(3).jpg",
    title: "Chef's Paradise",
    subtitle: "Residential • Kitchen",
    link: "/gallery/detail",
  },
  {
    id: 4,
    category: "pool",
    type: "image",
    src: "/assets/images/img(4).jpg",
    title: "Creative Workspace",
    subtitle: "Commercial • Office",
    link: "/gallery/detail",
  },
  {
    id: 5,
    category: "pool",
    type: "image",
    src: "/assets/images/img(5).jpg",
    title: "Serene Retreat",
    subtitle: "Residential • Bathroom",
    link: "/gallery/detail",
  },
  {
    id: 6,
    category: "bedroom",
    type: "image",
    src: "/assets/images/img(7).jpg",
    title: "Quiet Corner",
    subtitle: "Residential • Study Room",
    link: "/gallery/detail",
  },
  {
    id: 7,
    category: "bedroom",
    type: "image",
    src: "/assets/images/img(8).jpg",
    title: "Warm Brew",
    subtitle: "Hospitality • Café",
    link: "/gallery/detail",
  },
  {
    id: 8,
    category: "view",
    type: "image",
    src: "/assets/images/img(9).jpg",
    title: "Modern Retail",
    subtitle: "Commercial • Store",
    link: "/gallery/detail",
  },
  {
    id: 9,
    category: "360",
    type: "image",
    src: "/assets/images/img(10).jpg",
    title: "Grand Welcome",
    subtitle: "Hospitality • Hotel Lobby",
    link: "/gallery/detail",
  },
];

export default function GalleryPage() {
  const [filter, setFilter] = useState("all");
  const { openLightbox } = useLightboxStore();

  const filteredItems =
    filter === "all"
      ? galleryItems
      : galleryItems.filter((item) => item.category === filter);

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
                <h2>Gallery</h2>
              </div>
              <nav className="breadcrumb" data-scroll data-scroll-speed="0.5">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Gallery</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section className="portfolio" id="portfolio">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Our Work</span>
            <h2>Recent Projects</h2>
            <p>
              Explore our latest transformations and discover what's possible
              for your space
            </p>
          </div>
          {/* Filter Tabs */}
          <div className="row mt-4 mb-4 mx-auto">
            <div className="col-12">
              <ul className="nav nav-pills gallery-filter gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "interior", label: "Interior" },
                  { id: "pool", label: "Pool" },
                  { id: "bedroom", label: "Bedroom" },
                  { id: "view", label: "View" },
                  { id: "360", label: "360°" },
                ].map((tab) => (
                  <li className="nav-item" key={tab.id}>
                    <button
                      className={`nav-link ${filter === tab.id ? "active" : ""}`}
                      onClick={() => setFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="portfolio-grid">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="portfolio-item gallery-item"
                onClick={() =>
                  openLightbox(
                    item.type as "image" | "pano",
                    item.src
                  )
                }
              >
                <img src={item.src} alt={item.title} />
                <div className="portfolio-overlay">
                  <h3>
                    <Link
                      href={item.link}
                      className="text-white text-decoration-none stretched-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.title}
                    </Link>
                  </h3>
                  <p>{item.subtitle}</p>
                </div>
              </div>
            ))}
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
