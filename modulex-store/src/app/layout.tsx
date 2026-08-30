import type { Metadata } from "next";
import "./globals.css";
import "./portal.css";
import "./portal-forms.css";
import "./portal-fulfillment.css";
import "./portal-dealer.css";
import "@/css/bootstrap.min.css";
import "@/css/bootstrap-icons.css";
import "@/css/style.css";
import "@/css/media-queries.css";
import "@/css/dark-mode.css";
import "@/css/gallery-projects.css";
import "@/css/panorama.css";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import JsonLd from "@/components/seo/JsonLd";
import StoreChrome from "@/components/StoreChrome";
import { siteConfig } from "@/config/site";
import { getStorePublicCompanyProfile } from "@/lib/store/company/queries";
import {
  SAFE_STORE_CHROME_FALLBACK,
  resolveStoreChromeItems,
} from "@/lib/store/chrome/destinations";
import { getStorePublicChromeItems } from "@/lib/store/chrome/queries";
import { getStoreGalleryReadiness } from "@/lib/store/content/queries";
import { getStoreMarketingSettings } from "@/lib/store/marketing/queries";
import { getStoreSiteSettings } from "@/lib/store/site/queries";
import {
  createOrganizationJsonLd,
  createWebSiteJsonLd,
} from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [companyResult, marketingResult, siteSettingsResult, galleryResult, chromeResult] = await Promise.allSettled([
    getStorePublicCompanyProfile(),
    getStoreMarketingSettings(),
    getStoreSiteSettings(),
    getStoreGalleryReadiness(),
    getStorePublicChromeItems(),
  ]);

  const company = companyResult.status === "fulfilled" ? companyResult.value : null;
  const marketing = marketingResult.status === "fulfilled" ? marketingResult.value : null;
  const siteSettings = siteSettingsResult.status === "fulfilled" ? siteSettingsResult.value : null;
  const galleryReady = galleryResult.status === "fulfilled" ? galleryResult.value.isReady : false;
  const chromeItems = resolveStoreChromeItems(
    chromeResult.status === "fulfilled" ? chromeResult.value : SAFE_STORE_CHROME_FALLBACK,
  );

  if (
    companyResult.status === "rejected" ||
    marketingResult.status === "rejected" ||
    siteSettingsResult.status === "rejected" ||
    galleryResult.status === "rejected" ||
    chromeResult.status === "rejected"
  ) {
    console.error("Unable to load one or more public Store shell settings");
  }

  return (
    <html lang={siteConfig.language}>
      <body>
        <AnalyticsProvider settings={marketing} />
        <JsonLd data={[createOrganizationJsonLd(company), createWebSiteJsonLd()]} />
        <StoreChrome
          company={company}
          siteSettings={siteSettings}
          companyName={company?.companyName || siteConfig.name}
          logoUrl={company?.logoUrl}
          galleryReady={galleryReady}
          chromeItems={chromeItems}
        >
          {children}
        </StoreChrome>
      </body>
    </html>
  );
}
