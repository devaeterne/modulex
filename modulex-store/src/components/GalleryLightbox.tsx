"use client";

import { useLightboxStore } from "@/store/useLightboxStore";
import { useEffect } from "react";

export default function GalleryLightbox() {
  const { isOpen, type, src, closeLightbox } = useLightboxStore();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <div className={`gallery-lightbox ${isOpen ? "active" : ""}`} id="galleryLightbox">
      <div className="lightbox-overlay" onClick={closeLightbox}></div>
      <div className="lightbox-content">
        <button className="lightbox-close" id="lightboxClose" onClick={closeLightbox}>
          <i className="bi bi-x-lg"></i>
        </button>

        {type === "image" && src && (
          <img id="lightboxImage" src={src} alt="" style={{ display: "block" }} />
        )}
        {type === "pano" && src && (
          <iframe
            id="lightboxPano"
            src={src}
            allowFullScreen
            style={{ display: "block" }}
          ></iframe>
        )}
      </div>
    </div>
  );
}
