"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import GalleryLightbox from "@/components/GalleryLightbox";
import type { StorePublicCompanyProfile } from "@/lib/store/company/queries";
import type { ResolvedStoreChromeItem } from "@/lib/store/chrome/destinations";
import type { StoreSiteSettings } from "@/lib/store/site/queries";

type StoreChromeProps = {
  children: React.ReactNode;
  company: StorePublicCompanyProfile | null;
  siteSettings: StoreSiteSettings | null;
  companyName: string;
  logoUrl?: string | null;
  galleryReady: boolean;
  chromeItems: ResolvedStoreChromeItem[];
};

export default function StoreChrome({
  children,
  company,
  siteSettings,
  companyName,
  logoUrl,
  galleryReady,
  chromeItems,
}: StoreChromeProps) {
  const pathname = usePathname();
  const isDealerRoute = pathname === "/dealer" || pathname.startsWith("/dealer/");
  const isAccountRoute = pathname === "/account" || pathname.startsWith("/account/");
  const primaryNavigation = chromeItems.filter((item) => item.placement === "primary_nav");
  const footerProducts = chromeItems.filter((item) => item.placement === "footer_products");
  const footerCompany = chromeItems.filter((item) => item.placement === "footer_company");

  if (isDealerRoute || isAccountRoute) {
    return (
      <>
        <Navbar
          companyName={companyName}
          logoUrl={logoUrl}
          galleryReady={galleryReady}
          navigationItems={primaryNavigation}
        />
        <main>{children}</main>
      </>
    );
  }

  return (
    <>
      <Navbar
        companyName={companyName}
        logoUrl={logoUrl}
        galleryReady={galleryReady}
        navigationItems={primaryNavigation}
      />
      <main>{children}</main>
      <Footer
        company={company}
        settings={siteSettings}
        productLinks={footerProducts}
        companyLinks={footerCompany}
      />
      <BackToTop />
      <GalleryLightbox />
      <ThemeToggle />
    </>
  );
}
