"use client";

import { useState } from "react";
import { useLightboxStore } from "@/store/useLightboxStore";

interface Project {
  id: string;
  category: string;
  type: "image" | "pano";
  src: string;
  thumb: string;
  title: string;
  subtitle: string;
}

const projects: Project[] = [
  {
    id: "1",
    category: "360",
    type: "image",
    src: "/assets/images/img(1).jpg",
    thumb: "/assets/images/img(1).jpg",
    title: "Minimalist Haven",
    subtitle: "Residential • Living Room",
  },
  {
    id: "2",
    category: "interior",
    type: "image",
    src: "/assets/images/img(2).jpg",
    thumb: "/assets/images/img(2).jpg",
    title: "Urban Sanctuary",
    subtitle: "Residential • Bedroom",
  },
  {
    id: "3",
    category: "interior",
    type: "image",
    src: "/assets/images/img(3).jpg",
    thumb: "/assets/images/img(3).jpg",
    title: "Chef's Paradise",
    subtitle: "Residential • Kitchen",
  },
  {
    id: "4",
    category: "pool",
    type: "image",
    src: "/assets/images/img(4).jpg",
    thumb: "/assets/images/img(4).jpg",
    title: "Creative Workspace",
    subtitle: "Commercial • Office",
  },
  {
    id: "5",
    category: "pool",
    type: "image",
    src: "/assets/images/img(5).jpg",
    thumb: "/assets/images/img(5).jpg",
    title: "Serene Retreat",
    subtitle: "Residential • Bathroom",
  },
  {
    id: "6",
    category: "bedroom",
    type: "image",
    src: "/assets/images/img(7).jpg",
    thumb: "/assets/images/img(7).jpg",
    title: "Quiet Corner",
    subtitle: "Residential • Study Room",
  },
  {
    id: "7",
    category: "bedroom",
    type: "image",
    src: "/assets/images/img(8).jpg",
    thumb: "/assets/images/img(8).jpg",
    title: "Warm Brew",
    subtitle: "Hospitality • Café",
  },
  {
    id: "8",
    category: "view",
    type: "image",
    src: "/assets/images/img(9).jpg",
    thumb: "/assets/images/img(9).jpg",
    title: "Modern Retail",
    subtitle: "Commercial • Store",
  },
  {
    id: "9",
    category: "360",
    type: "image",
    src: "/assets/images/img(10).jpg",
    thumb: "/assets/images/img(10).jpg",
    title: "Grand Welcome",
    subtitle: "Hospitality • Hotel Lobby",
  },
];

export default function RecentProjects() {
  const [filter, setFilter] = useState("all");
  const { openLightbox } = useLightboxStore();

  const filteredProjects =
    filter === "all"
      ? projects
      : projects.filter((project) => project.category === filter);

  return (
    <section className="portfolio" id="portfolio">
      <div className="container">
        <div className="section-header text-center">
          <span className="section-tag">Our Work</span>
          <h2>Recent Projects</h2>
          <p>
            Explore our latest transformations and discover what&apos;s possible
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
              ].map((item) => (
                <li className="nav-item" key={item.id}>
                  <button
                    className={`nav-link ${filter === item.id ? "active" : ""}`}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="portfolio-grid">
          {filteredProjects.map((project) => (
            <div
              className="portfolio-item gallery-item"
              key={project.id}
              onClick={() => openLightbox(project.type, project.src)}
              style={{ cursor: "pointer" }}
            >
              <img src={project.thumb} alt={project.title} />
              <div className="portfolio-overlay">
                <h3>{project.title}</h3>
                <p>{project.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
