import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

const staticRoutes = [
  "",
  "/about",
  "/shop",
  "/services",
  "/gallery",
  "/blog",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/shop" ? 0.9 : 0.7,
  }));
}
