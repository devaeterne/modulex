import type { Metadata } from "next";
import "./globals.css";
import "@/css/bootstrap.min.css";
import "@/css/bootstrap-icons.css";
import "@/css/style.css";
import "@/css/media-queries.css";
import "@/css/dark-mode.css";
import "@/css/panorama.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import GalleryLightbox from "@/components/GalleryLightbox";
import JsonLd from "@/components/seo/JsonLd";
import { siteConfig } from "@/config/site";
import { getStorePublicCompanyProfile } from "@/lib/store/company/queries";
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
  try {
    company = await getStorePublicCompanyProfile();
  } catch (error) {
    console.error("Unable to load public company branding", error);
  }

  return (
    <html lang={siteConfig.language}>
      <body>
        <JsonLd data={[createOrganizationJsonLd(), createWebSiteJsonLd()]} />
        <Navbar companyName={company?.companyName || siteConfig.name} logoUrl={company?.logoUrl} />
        <main>{children}</main>
        <Footer />
        <BackToTop />
        <GalleryLightbox />
        <ThemeToggle />
      </body>
    </html>
  );
}
