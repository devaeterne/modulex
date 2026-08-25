"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";

const PANORAMAS = [
  "/assets/images/panorama/image2.jpg",
  "/assets/images/panorama/image1.jpg",
  "/assets/images/panorama/image3.jpg",
];

export default function Hero() {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInitializedRef = useRef(false); // 🔥 Track initialization

  // 🔥 CHECK IF SCRIPT ALREADY LOADED (untuk page navigation)
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any)?.pannellum) {
      setIsScriptLoaded(true);
    }
  }, []);

  // 🔥 INIT VIEWER
  useEffect(() => {
    if (!isScriptLoaded || !containerRef.current) return;

    const pannellum = (window as any)?.pannellum;
    if (!pannellum) return;

    // 🔥 Prevent double initialization
    if (isInitializedRef.current) return;

    const initViewer = () => {
      if (!containerRef.current) return;

      // 🔥 Destroy old viewer PROPERLY
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch (e) {
          console.warn("Viewer destroy error:", e);
        }
        viewerRef.current = null;
      }

      // 🔥 Clear container completely
      containerRef.current.innerHTML = "";

      // 🔥 Small delay to ensure WebGL context is freed
      requestAnimationFrame(() => {
        if (!containerRef.current) return;

        try {
          viewerRef.current = pannellum.viewer(containerRef.current, {
            type: "equirectangular",
            panorama: PANORAMAS[0],
            autoLoad: true,
            showControls: false,

            hfov: 125,
            minHfov: 15,
            maxHfov: 230,

            pitch: -2,
            yaw: 15,

            autoRotate: 1.1,
          });
          isInitializedRef.current = true;
        } catch (e) {
          console.error("Pannellum init error:", e);
        }
      });
    };

    // 🔥 Delay to ensure DOM is ready
    const timer = setTimeout(initViewer, 100);

    return () => {
      clearTimeout(timer);
      isInitializedRef.current = false;

      // 🔥 Cleanup when leaving page
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch (e) {
          console.warn("Cleanup error:", e);
        }
        viewerRef.current = null;
      }

      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [isScriptLoaded]);

  return (
    <section className="hero" id="home">

      {!isScriptLoaded && (
        <Script
          src="/assets/js/mainpanorama.js"
          strategy="afterInteractive"
          onLoad={() => setIsScriptLoaded(true)}
        />
      )}


      <div
        ref={containerRef}
        className="pano"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100vh",
          zIndex: 0,
          backgroundColor: "#000",
        }}
      />

      <div className="hero-overlay"></div>

      <div
        className="container-fluid mx-5-auto px-5"
        style={{ position: "relative", zIndex: 10 }}
      >
        <div className="hero-content">
          <div className="hero-text">
            <h1>
              QUALITY CABINETS AT
              <br />
              JUST THE <span className="highlight">RIGHT PRICE</span>
            </h1>
            <p>
              9 DOOR STYLES READY IN JUST ONE BUSINESS DAY! <br />
            </p>
            <div className="hero-cta">
              <Link href="#contact" className="btn-primary">
                Contact Us
              </Link>
              <Link href="#portfolio" className="btn-secondary">
                View Products
              </Link>
            </div>
          </div>
          <div className="hero-image">
            <div className="image-container">
              <div className="floating-images">
                <div className="float-img float-1">
                  <img src="/assets/images/floating(3).png" alt="" />
                </div>
                <div className="float-img float-2">
                  <img src="/assets/images/floating(2).jpg" alt="" />
                </div>
                <div className="float-img float-3">
                  <img src="/assets/images/floating(1).png" alt="" />
                </div>
              </div>
            </div>
            <div className="floating-badge">
              <h1>200+</h1>
              <p>Projects Completed</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}