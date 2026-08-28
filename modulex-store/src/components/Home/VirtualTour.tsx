"use client";

import Image from "next/image";
import { useLightboxStore } from "@/store/useLightboxStore";

export default function VirtualTour() {
  const { openLightbox } = useLightboxStore();

  return (
    <section className="virtual-tour" id="virtual-tour">
      <div className="container-fluid">
        <div className="row">
          <div className="col-lg-12 section-header text-center">
            <span className="section-tag">Experience</span>
            <h2>Virtual Tour</h2>
            <p>
              Step inside our completed projects and experience the
              transformation
            </p>
          </div>
          <div className="col-lg-12 tour-container">
            <div className="tour-main">
              <div className="tour-video" style={{ position: "relative" }}>
                <Image
                  src="/assets/images/img(5).jpg"
                  alt="Virtual Tour Preview"
                  width={1600}
                  height={900}
                  sizes="(max-width: 991px) 100vw, 92vw"
                  style={{ width: "100%", height: "auto" }}
                />
                <button
                  type="button"
                  className="play-button"
                  onClick={() => openLightbox("pano", "/index-360.html")}
                  style={{ border: "none", background: "transparent" }}
                  aria-label="Open 360 degree virtual tour"
                >
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 80 80"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r="40"
                      fill="white"
                      opacity="0.95"
                    />
                    <path d="M32 25L55 40L32 55V25Z" fill="#FF6B35" />
                  </svg>
                </button>
              </div>
              <div className="tour-info">
                <h3>Explore Our Signature Projects</h3>
                <p>
                  Take a 360° virtual walkthrough of our most stunning
                  interior transformations. Experience each space as if you
                  were there exploring textures, layouts, and finishes in
                  immersive detail. Every project reflects our dedication to
                  thoughtful design, precise craftsmanship, and a refined
                  aesthetic that elevates everyday living.
                </p>
                <div className="tour-features">
                  <div className="tour-feature">
                    <span className="feature-icon">
                      <i className="bi bi-house-door"></i>
                    </span>
                    <span>Interactive 360° Views</span>
                  </div>
                  <div className="tour-feature">
                    <span className="feature-icon">
                      <i className="bi bi-bounding-box"></i>
                    </span>
                    <span>Detailed Room Layouts</span>
                  </div>
                  <div className="tour-feature">
                    <span className="feature-icon">
                      <i className="bi bi-palette"></i>
                    </span>
                    <span>Design Inspiration</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
