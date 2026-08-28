"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import GalleryLightbox from "@/components/GalleryLightbox";

type StoreChromeProps = {
  children: React.ReactNode;
  companyName: string;
  logoUrl?: string | null;
};

export default function StoreChrome({ children, companyName, logoUrl }: StoreChromeProps) {
  const pathname = usePathname();
  const isDealerRoute = pathname === "/dealer" || pathname.startsWith("/dealer/");

  if (isDealerRoute) {
    return <main>{children}</main>;
  }

  return (
    <>
      <Navbar companyName={companyName} logoUrl={logoUrl} />
      <main>{children}</main>
      <Footer />
      <BackToTop />
      <GalleryLightbox />
      <ThemeToggle />
    </>
  );
}
