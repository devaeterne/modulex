"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StorePublicProject, StorePublicProjectMedia } from "@/lib/store/content/queries";

export type StoreProjectGalleryEntry = { project: StorePublicProject; media: StorePublicProjectMedia[] };
type StoreProjectsGalleryProps = { entries: StoreProjectGalleryEntry[] };
type DisplayMedia = { mediaType: "image" | "video"; mediaUrl: string; altText: string };

function isSafeImageUrl(url: string) { return url.startsWith("/") || /^https?:\/\//i.test(url); }
function isPublicHttpUrl(url: string) { return /^https?:\/\//i.test(url); }
function isDirectVideoUrl(url: string) { return /^https?:\/\/[^\s]+\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(url); }

function getDisplayMedia(entry: StoreProjectGalleryEntry): DisplayMedia[] {
  const seen = new Set<string>();
  const result: DisplayMedia[] = [];
  if (isSafeImageUrl(entry.project.coverImageUrl)) {
    seen.add(entry.project.coverImageUrl);
    result.push({ mediaType: "image", mediaUrl: entry.project.coverImageUrl, altText: entry.project.coverImageAlt });
  }
  for (const media of entry.media) {
    if (seen.has(media.mediaUrl)) continue;
    if (media.mediaType === "image" && !isSafeImageUrl(media.mediaUrl)) continue;
    if (media.mediaType === "video" && !isPublicHttpUrl(media.mediaUrl)) continue;
    seen.add(media.mediaUrl);
    result.push({ mediaType: media.mediaType, mediaUrl: media.mediaUrl, altText: media.altText });
  }
  return result;
}

function ProjectAttribution({ project }: { project: StorePublicProject }) {
  if (project.attributionClassification !== "parent_attributed" || !project.attributionText) return null;
  return (
    <p className="project-gallery-attribution">
      {project.sourcePageUrl ? (
        <a href={project.sourcePageUrl} target="_blank" rel="noopener noreferrer" className="project-gallery-attribution-link">
          {project.attributionText}
        </a>
      ) : project.attributionText}
    </p>
  );
}

export default function StoreProjectsGallery({ entries }: StoreProjectsGalleryProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const categories = useMemo(() => {
    const values = entries
      .map((entry) => entry.project.category?.trim())
      .filter((category): category is string => Boolean(category));
    return Array.from(new Set(values));
  }, [entries]);

  const effectiveActiveCategory = activeCategory === "All" || categories.includes(activeCategory)
    ? activeCategory
    : "All";

  const visibleEntries = useMemo(
    () => effectiveActiveCategory === "All"
      ? entries
      : entries.filter((entry) => entry.project.category === effectiveActiveCategory),
    [effectiveActiveCategory, entries],
  );

  const selected = useMemo(() => entries.find((entry) => entry.project.slug === selectedSlug) ?? null, [entries, selectedSlug]);
  const selectedMedia = selected ? getDisplayMedia(selected) : [];

  useEffect(() => {
    if (!selected) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedSlug(null);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
    };
  }, [selected]);

  const closeProjectGallery = () => setSelectedSlug(null);

  return (
    <>
      {categories.length > 1 ? (
        <div className="gallery-filter project-gallery-filter" role="group" aria-label="Filter projects by category">
          <button
            type="button"
            className={`nav-link ${effectiveActiveCategory === "All" ? "active" : ""}`}
            aria-pressed={effectiveActiveCategory === "All"}
            onClick={() => setActiveCategory("All")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              type="button"
              className={`nav-link ${effectiveActiveCategory === category ? "active" : ""}`}
              aria-pressed={effectiveActiveCategory === category}
              onClick={() => setActiveCategory(category)}
              key={category}
            >
              {category}
            </button>
          ))}
        </div>
      ) : null}

      <div className="row g-4 project-gallery-grid">
        {visibleEntries.map((entry) => (
          <div className="col-md-6 col-lg-4" key={entry.project.slug}>
            <article className="project-gallery-card">
              <button
                type="button"
                className="project-gallery-card-button"
                onClick={(event) => {
                  openerRef.current = event.currentTarget;
                  setSelectedSlug(entry.project.slug);
                }}
                aria-label={`View ${entry.project.title} project media`}
              >
                <div className="project-gallery-card-media">
                  <img src={entry.project.coverImageUrl} alt={entry.project.coverImageAlt} />
                </div>
                <div className="project-gallery-card-content">
                  <h2 className="project-gallery-title">{entry.project.title}</h2>
                  {entry.project.summary ? <p className="project-gallery-summary">{entry.project.summary}</p> : null}
                  {entry.project.category || entry.project.location ? (
                    <p className="project-gallery-meta">{[entry.project.category, entry.project.location].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  <ProjectAttribution project={entry.project} />
                </div>
              </button>
            </article>
          </div>
        ))}
      </div>

      {selected ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.project.title} project gallery`}
          className="gallery-lightbox active project-gallery-lightbox"
        >
          <div className="lightbox-overlay" onMouseDown={closeProjectGallery} aria-hidden="true"></div>
          <div className="project-gallery-dialog">
            <button
              ref={closeButtonRef}
              type="button"
              className="lightbox-close"
              onClick={closeProjectGallery}
              aria-label="Close project gallery"
            >
              <i className="bi bi-x-lg" aria-hidden="true"></i>
            </button>
            <div className="project-gallery-dialog-content">
              <div className="project-gallery-dialog-header">
                <h2 className="project-gallery-dialog-title">{selected.project.title}</h2>
                {selected.project.summary ? <p className="project-gallery-dialog-summary">{selected.project.summary}</p> : null}
                {selected.project.category || selected.project.location ? (
                  <p className="project-gallery-meta">{[selected.project.category, selected.project.location].filter(Boolean).join(" · ")}</p>
                ) : null}
                <ProjectAttribution project={selected.project} />
              </div>
              <div className="project-gallery-media-list">
                {selectedMedia.map((media, index) => (
                  <div key={`${media.mediaUrl}-${index}`}>
                    {media.mediaType === "image" ? (
                      <img src={media.mediaUrl} alt={media.altText} className="project-gallery-media" />
                    ) : isDirectVideoUrl(media.mediaUrl) ? (
                      <video className="project-gallery-media" controls preload="metadata" aria-label={media.altText}><source src={media.mediaUrl} /></video>
                    ) : (
                      <a href={media.mediaUrl} target="_blank" rel="noopener noreferrer" className="btn-primary project-gallery-video-link">Open video: {media.altText}</a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
