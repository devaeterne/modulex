"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import GalleryLightbox from "@/components/GalleryLightbox";
import type { StorePublicCompanyProfile } from "@/lib/store/company/queries";
import type { StoreSiteSettings } from "@/lib/store/site/queries";

type StoreChromeProps = {
  children: React.ReactNode;
  company: StorePublicCompanyProfile | null;
  siteSettings: StoreSiteSettings | null;
  companyName: string;
  logoUrl?: string | null;
  galleryReady: boolean;
};

export default function StoreChrome({
  children,
  company,
  siteSettings,
  companyName,
  logoUrl,
  galleryReady,
}: StoreChromeProps) {
  const pathname = usePathname();
  const isDealerRoute = pathname === "/dealer" || pathname.startsWith("/dealer/");
  const isAccountRoute = pathname === "/account" || pathname.startsWith("/account/");

  if (isDealerRoute || isAccountRoute) {
    return (
      <>
        <Navbar companyName={companyName} logoUrl={logoUrl} galleryReady={galleryReady} />
        <main>{children}</main>
      </>
    );
  }

  return (
    <>
      <Navbar companyName={companyName} logoUrl={logoUrl} galleryReady={galleryReady} />
      <main>{children}</main>
      <Footer company={company} settings={siteSettings} />
      <BackToTop />
      <GalleryLightbox />
      <ThemeToggle />
    </>
  );
}
