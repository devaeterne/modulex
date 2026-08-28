import type { Metadata } from "next";
import "./globals.css";
import "@/css/bootstrap.min.css";
import "@/css/bootstrap-icons.css";
import "@/css/style.css";
import "@/css/media-queries.css";
import "@/css/dark-mode.css";
import "@/css/panorama.css";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import JsonLd from "@/components/seo/JsonLd";
import StoreChrome from "@/components/StoreChrome";
import { siteConfig } from "@/config/site";
import { getStorePublicCompanyProfile } from "@/lib/store/company/queries";
import { getStoreMarketingSettings } from "@/lib/store/marketing/queries";
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
  let company = null;
  let marketing = null;

  try {
    [company, marketing] = await Promise.all([
      getStorePublicCompanyProfile(),
      getStoreMarketingSettings(),
    ]);
  } catch (error) {
    console.error("Unable to load public Store shell settings", error);
  }

  return (
    <html lang={siteConfig.language}>
      <body>
        <AnalyticsProvider settings={marketing} />
        <JsonLd data={[createOrganizationJsonLd(), createWebSiteJsonLd()]} />
        <StoreChrome
          companyName={company?.companyName || siteConfig.name}
          logoUrl={company?.logoUrl}
        >
          {children}
        </StoreChrome>
      </body>
    </html>
  );
}
