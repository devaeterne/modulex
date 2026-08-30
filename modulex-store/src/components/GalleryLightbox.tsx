"use client";

import { useLightboxStore } from "@/store/useLightboxStore";
import { useEffect, useRef } from "react";

export default function GalleryLightbox() {
  const { isOpen, type, src, closeLightbox } = useLightboxStore();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [isOpen, closeLightbox]);

  if (!isOpen) return null;

  return (
    <div
      className="gallery-lightbox active"
      id="galleryLightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
    >
      <div className="lightbox-overlay" onClick={closeLightbox} aria-hidden="true"></div>
      <div className="lightbox-content">
        <button
          ref={closeButtonRef}
          type="button"
          className="lightbox-close"
          id="lightboxClose"
          onClick={closeLightbox}
          aria-label="Close media viewer"
        >
          <i className="bi bi-x-lg" aria-hidden="true"></i>
        </button>

        {type === "image" && src && (
          <img id="lightboxImage" src={src} alt="" style={{ display: "block" }} />
        )}
        {type === "pano" && src && (
          <iframe
            id="lightboxPano"
            src={src}
            title="Interactive panorama"
            allowFullScreen
            style={{ display: "block" }}
          ></iframe>
        )}
      </div>
    </div>
  );
}
