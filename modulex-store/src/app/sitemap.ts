import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getStorePublicCompanyLocations } from "@/lib/store/company/queries";
import { getStoreGalleryReadiness, getStorePublicPage } from "@/lib/store/content/queries";
import { getAllStoreCatalogProducts } from "@/lib/store/products/queries";

const staticRoutes = [
  "",
  "/about",
  "/products",
  "/contact",
  "/dealers/apply",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/products" ? 0.9 : 0.7,
  }));

  const [productsResult, galleryResult, showroomPageResult, locationsResult] = await Promise.allSettled([
    getAllStoreCatalogProducts({ maxItems: 5000 }),
    getStoreGalleryReadiness(),
    getStorePublicPage("showroom"),
    getStorePublicCompanyLocations(),
  ]);

  let productEntries: MetadataRoute.Sitemap = [];
  if (productsResult.status === "fulfilled") {
    productEntries = productsResult.value.map((product) => ({
      url: `${siteConfig.url}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } else {
    console.error("Unable to load product URLs for sitemap");
  }

  let galleryEntries: MetadataRoute.Sitemap = [];
  if (galleryResult.status === "fulfilled" && galleryResult.value.isReady && galleryResult.value.page) {
    galleryEntries = [
      {
        url: `${siteConfig.url}/gallery`,
        lastModified: galleryResult.value.page.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      },
    ];
  } else if (galleryResult.status === "rejected") {
    console.error("Unable to determine Gallery readiness for sitemap");
  }

  let showroomEntries: MetadataRoute.Sitemap = [];
  if (showroomPageResult.status === "fulfilled" && locationsResult.status === "fulfilled") {
    const showroomPage = showroomPageResult.value;
    const hasPublishedShowroom = locationsResult.value.locations.some(
      (location) => location.locationType === "showroom",
    );

    if (showroomPage && hasPublishedShowroom) {
      showroomEntries = [
        {
          url: `${siteConfig.url}/showroom`,
          lastModified: showroomPage.updatedAt,
          changeFrequency: "monthly",
          priority: 0.8,
        },
      ];
    }
  } else if (showroomPageResult.status === "rejected" || locationsResult.status === "rejected") {
    console.error("Unable to determine Showroom readiness for sitemap");
  }

  return [...staticEntries, ...galleryEntries, ...showroomEntries, ...productEntries];
}
