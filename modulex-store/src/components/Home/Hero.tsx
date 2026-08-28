"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const PANORAMA_IMAGE = "/assets/images/panorama/image2.jpg";
const HERO_POSTER = "/assets/images/img(3).jpg";

export default function Hero() {
  const [shouldLoadPanorama, setShouldLoadPanorama] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (!desktopQuery.matches || reducedMotionQuery.matches) return;

    const timer = window.setTimeout(() => {
      setShouldLoadPanorama(true);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!shouldLoadPanorama || !isScriptLoaded || !containerRef.current) return;

    const pannellum = (window as any)?.pannellum;
    if (!pannellum) return;

    try {
      viewerRef.current = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: PANORAMA_IMAGE,
        autoLoad: true,
        showControls: false,
        hfov: 125,
        minHfov: 15,
        maxHfov: 230,
        pitch: -2,
        yaw: 15,
        autoRotate: 1.1,
      });
    } catch (error) {
      console.error("Pannellum init error:", error);
    }

    return () => {
      try {
        viewerRef.current?.destroy();
      } catch (error) {
        console.warn("Pannellum cleanup error:", error);
      } finally {
        viewerRef.current = null;
      }
    };
  }, [isScriptLoaded, shouldLoadPanorama]);

  return (
    <section className="hero" id="home">
      <div
        className="pano"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100vh",
          zIndex: 0,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <Image
          src={HERO_POSTER}
          alt="Oakwell Cabinetry interior"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
        <div
          ref={containerRef}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        />
      </div>

      {shouldLoadPanorama && !isScriptLoaded && (
        <Script
          src="/assets/js/mainpanorama.js"
          strategy="lazyOnload"
          onLoad={() => setIsScriptLoaded(true)}
        />
      )}

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
              <Link href="/shop" className="btn-secondary">
                View Products
              </Link>
            </div>
          </div>
          <div className="hero-image">
            <div className="image-container">
              <div className="floating-images">
                <div className="float-img float-1">
                  <Image
                    src="/assets/images/floating(3).png"
                    alt=""
                    width={420}
                    height={420}
                    sizes="(max-width: 1023px) 35vw, 20vw"
                  />
                </div>
                <div className="float-img float-2">
                  <Image
                    src="/assets/images/floating(2).jpg"
                    alt=""
                    width={420}
                    height={420}
                    sizes="(max-width: 1023px) 35vw, 20vw"
                  />
                </div>
                <div className="float-img float-3">
                  <Image
                    src="/assets/images/floating(1).png"
                    alt=""
                    width={420}
                    height={420}
                    sizes="(max-width: 1023px) 35vw, 20vw"
                  />
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
