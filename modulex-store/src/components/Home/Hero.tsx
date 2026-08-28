"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export type HomeHeroContent = {
  eyebrow: string | null;
  title: string;
  highlight: string | null;
  subtitle: string | null;
  primaryLabel: string | null;
  primaryHref: string | null;
  secondaryLabel: string | null;
  secondaryHref: string | null;
  posterUrl: string;
  panoramaUrl: string | null;
  panoramaEnabled: boolean;
};

function renderTitle(title: string, highlight: string | null) {
  if (!highlight) return title;
  const index = title.toLowerCase().indexOf(highlight.toLowerCase());
  if (index < 0) {
    return (
      <>
        {title} <span className="highlight">{highlight}</span>
      </>
    );
  }

  return (
    <>
      {title.slice(0, index)}
      <span className="highlight">{title.slice(index, index + highlight.length)}</span>
      {title.slice(index + highlight.length)}
    </>
  );
}

export default function Hero({ content }: { content: HomeHeroContent }) {
  const [shouldLoadPanorama, setShouldLoadPanorama] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!content.panoramaEnabled || !content.panoramaUrl) return;

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!desktopQuery.matches || reducedMotionQuery.matches) return;

    const timer = window.setTimeout(() => setShouldLoadPanorama(true), 1200);
    return () => window.clearTimeout(timer);
  }, [content.panoramaEnabled, content.panoramaUrl]);

  useEffect(() => {
    if (!shouldLoadPanorama || !isScriptLoaded || !containerRef.current || !content.panoramaUrl) return;
    const pannellum = (window as any)?.pannellum;
    if (!pannellum) return;

    try {
      viewerRef.current = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: content.panoramaUrl,
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
  }, [content.panoramaUrl, isScriptLoaded, shouldLoadPanorama]);

  return (
    <section className="hero" id="home">
      <div
        className="pano"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100vh", zIndex: 0, overflow: "hidden", backgroundColor: "#000" }}
      >
        <Image
          src={content.posterUrl}
          alt="Oakwell Cabinetry interior"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
        {content.panoramaEnabled && content.panoramaUrl ? (
          <div ref={containerRef} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1 }} />
        ) : null}
      </div>

      {shouldLoadPanorama && !isScriptLoaded ? (
        <Script src="/assets/js/mainpanorama.js" strategy="lazyOnload" onLoad={() => setIsScriptLoaded(true)} />
      ) : null}

      <div className="hero-overlay" />
      <div className="container-fluid mx-5-auto px-5" style={{ position: "relative", zIndex: 10 }}>
        <div className="hero-content">
          <div className="hero-text">
            {content.eyebrow ? <span className="section-tag">{content.eyebrow}</span> : null}
            <h1>{renderTitle(content.title, content.highlight)}</h1>
            {content.subtitle ? <p>{content.subtitle}</p> : null}
            <div className="hero-cta">
              {content.primaryLabel && content.primaryHref ? (
                <Link href={content.primaryHref} className="btn-primary">{content.primaryLabel}</Link>
              ) : null}
              {content.secondaryLabel && content.secondaryHref ? (
                <Link href={content.secondaryHref} className="btn-secondary">{content.secondaryLabel}</Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
