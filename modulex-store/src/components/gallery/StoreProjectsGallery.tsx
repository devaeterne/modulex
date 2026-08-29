"use client";

import { useEffect, useMemo, useState } from "react";
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
    <p className="small text-muted mt-2 mb-0">
      {project.sourcePageUrl ? (
        <a href={project.sourcePageUrl} target="_blank" rel="noopener noreferrer" className="text-reset text-decoration-underline">
          {project.attributionText}
        </a>
      ) : project.attributionText}
    </p>
  );
}

export default function StoreProjectsGallery({ entries }: StoreProjectsGalleryProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = useMemo(() => {
    const values = entries
      .map((entry) => entry.project.category?.trim())
      .filter((category): category is string => Boolean(category));
    return Array.from(new Set(values));
  }, [entries]);

  const visibleEntries = useMemo(
    () => activeCategory === "All" ? entries : entries.filter((entry) => entry.project.category === activeCategory),
    [activeCategory, entries],
  );

  const selected = useMemo(() => entries.find((entry) => entry.project.slug === selectedSlug) ?? null, [entries, selectedSlug]);
  const selectedMedia = selected ? getDisplayMedia(selected) : [];

  useEffect(() => {
    if (activeCategory !== "All" && !categories.includes(activeCategory)) {
      setActiveCategory("All");
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedSlug(null); };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selected]);

  return (
    <>
      {categories.length > 1 ? (
        <div className="d-flex flex-wrap justify-content-center gap-2 mb-4" role="group" aria-label="Filter projects by category">
          <button
            type="button"
            className={`btn btn-sm ${activeCategory === "All" ? "btn-dark" : "btn-outline-dark"}`}
            aria-pressed={activeCategory === "All"}
            onClick={() => setActiveCategory("All")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              type="button"
              className={`btn btn-sm ${activeCategory === category ? "btn-dark" : "btn-outline-dark"}`}
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
              key={category}
            >
              {category}
            </button>
          ))}
        </div>
      ) : null}

      <div className="row g-4">
        {visibleEntries.map((entry) => (
          <div className="col-md-6 col-lg-4" key={entry.project.slug}>
            <article className="h-100 border rounded-3 overflow-hidden bg-white shadow-sm">
              <button type="button" className="w-100 border-0 bg-transparent p-0 text-start" onClick={() => setSelectedSlug(entry.project.slug)} aria-label={`View ${entry.project.title} project media`}>
                <img src={entry.project.coverImageUrl} alt={entry.project.coverImageAlt} className="w-100" style={{ aspectRatio: "4 / 3", objectFit: "cover" }} />
                <div className="p-4">
                  <h2 className="h4 mb-2">{entry.project.title}</h2>
                  {entry.project.summary ? <p className="mb-3">{entry.project.summary}</p> : null}
                  {entry.project.category || entry.project.location ? <p className="small text-muted mb-0">{[entry.project.category, entry.project.location].filter(Boolean).join(" · ")}</p> : null}
                  <ProjectAttribution project={entry.project} />
                </div>
              </button>
            </article>
          </div>
        ))}
      </div>

      {selected ? (
        <div role="dialog" aria-modal="true" aria-label={`${selected.project.title} project gallery`} className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 2000, background: "rgba(0, 0, 0, 0.86)", padding: "1rem" }} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedSlug(null); }}>
          <div className="bg-white rounded-3 overflow-auto position-relative" style={{ width: "min(1100px, 100%)", maxHeight: "92vh" }}>
            <button type="button" className="btn btn-dark position-absolute top-0 end-0 m-3" style={{ zIndex: 2 }} onClick={() => setSelectedSlug(null)} aria-label="Close project gallery">Close</button>
            <div className="p-4 p-lg-5">
              <div className="pe-5 mb-4">
                <h2 className="mb-2">{selected.project.title}</h2>
                {selected.project.summary ? <p className="mb-2">{selected.project.summary}</p> : null}
                {selected.project.category || selected.project.location ? <p className="small text-muted mb-0">{[selected.project.category, selected.project.location].filter(Boolean).join(" · ")}</p> : null}
                <ProjectAttribution project={selected.project} />
              </div>
              <div className="row g-4">
                {selectedMedia.map((media, index) => (
                  <div className="col-12" key={`${media.mediaUrl}-${index}`}>
                    {media.mediaType === "image" ? (
                      <img src={media.mediaUrl} alt={media.altText} className="w-100 rounded-3" style={{ maxHeight: "75vh", objectFit: "contain", background: "#f4f4f4" }} />
                    ) : isDirectVideoUrl(media.mediaUrl) ? (
                      <video className="w-100 rounded-3" controls preload="metadata" aria-label={media.altText}><source src={media.mediaUrl} /></video>
                    ) : (
                      <a href={media.mediaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-dark">Open video: {media.altText}</a>
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
