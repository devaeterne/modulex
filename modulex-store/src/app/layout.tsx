import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/css/locomotive-scroll.min.css";
import "@/css/bootstrap.min.css";
import "@/css/bootstrap-icons.css";
import "@/css/style.css";
import "@/css/media-queries.css";
import "@/css/dark-mode.css";
import "@/css/panorama.css";
import Preloader from "@/components/Preloader";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import GalleryLightbox from "@/components/GalleryLightbox";
import SmoothScroll from "@/components/SmoothScroll";
import { getSiteUrl, siteConfig } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Oakwell Cabinetry",
    template: "%s | Oakwell Cabinetry",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: "/",
    siteName: siteConfig.name,
    title: "Oakwell Cabinetry",
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Oakwell Cabinetry",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={siteConfig.language}>
      <body>
        <Suspense fallback={null}>
          <Preloader />
        </Suspense>
        <Navbar />
        <Suspense fallback={null}>
          <SmoothScroll />
        </Suspense>
        <main data-scroll-container>
          {children}
          <Footer />
        </main>
        <BackToTop />
        <GalleryLightbox />
        <Suspense fallback={null}>
          <ThemeToggle />
        </Suspense>
      </body>
    </html>
  );
}
