import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getAllStoreCatalogProducts } from "@/lib/store/products/queries";

const staticRoutes = [
  "",
  "/about",
  "/products",
  "/gallery",
  "/contact",
  "/dealers/apply",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/products" ? 0.9 : 0.7,
  }));

  try {
    const products = await getAllStoreCatalogProducts({ maxItems: 5000 });
    const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${siteConfig.url}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "monthly",
      priority: 0.8,
    }));

    return [...staticEntries, ...productEntries];
  } catch (error) {
    console.error("Unable to load product URLs for sitemap", error);
    return staticEntries;
  }
}
