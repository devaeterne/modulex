import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import "@/css/locomotive-scroll.min.css";
import "@/css/bootstrap.min.css";
import "@/css/bootstrap-icons.css";
import "@/css/style.css";
import "@/css/media-queries.css";
import "@/css/dark-mode.css";
import "@/css/panorama.css";
import Script from "next/script";
import Preloader from "@/components/Preloader";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import GalleryLightbox from "@/components/GalleryLightbox";
import SmoothScroll from "@/components/SmoothScroll";

export const metadata: Metadata = {
  title: "Oakwell – Cabinetry",
  description: "Cabinetry and Interior Design Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/assets/images/ico.png" type="image/x-icon" />
      </head>
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
